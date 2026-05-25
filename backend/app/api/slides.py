import csv
import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.models.patch import Patch
from app.models.slide import Slide
from app.schemas.slide import SlideOut, SlideListOut, PatchOut
from app.services.dzi_service import dzi_service

router = APIRouter()


@router.post("/upload", response_model=SlideOut)
async def upload_slide(
    file: UploadFile = File(...),
    auto_tile: bool = True,
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    allowed = {".svs", ".tiff", ".tif", ".ndpi", ".mrxs", ".png", ".jpg", ".jpeg"}
    suffix = Path(file.filename).suffix.lower()
    if suffix not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {suffix}")

    slide_id = uuid.uuid4()
    slides_dir = Path(settings.DATA_DIR) / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    save_path = slides_dir / f"{slide_id}{suffix}"

    content = await file.read()
    save_path.write_bytes(content)

    slide = Slide(
        id=slide_id,
        filename=file.filename,
        original_path=str(save_path),
        file_size_bytes=len(content),
        status="uploaded",
    )
    db.add(slide)
    await db.commit()
    await db.refresh(slide)

    if auto_tile:
        from app.workers.tile_worker import tile_slide

        tile_slide.delay(str(slide_id))
        slide.status = "tiling"
        await db.commit()
        await db.refresh(slide)

    return slide


@router.get("", response_model=list[SlideListOut])
async def list_slides(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Slide).order_by(Slide.created_at.desc()))
    return result.scalars().all()


@router.get("/{slide_id}", response_model=SlideOut)
async def get_slide(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    return slide


@router.get("/{slide_id}/patches", response_model=list[PatchOut])
async def list_patches(
    slide_id: uuid.UUID,
    offset: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Patch)
        .where(Patch.slide_id == slide_id)
        .offset(offset)
        .limit(limit)
        .order_by(Patch.x, Patch.y)
    )
    return result.scalars().all()


@router.get("/{slide_id}/patches/{patch_id}/image")
async def get_patch_image(
    slide_id: uuid.UUID,
    patch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    patch = await db.get(Patch, patch_id)
    if not patch or patch.slide_id != slide_id:
        raise HTTPException(status_code=404, detail="Patch not found")
    if not patch.file_path or not Path(patch.file_path).exists():
        raise HTTPException(status_code=404, detail="Patch image file not found")
    return FileResponse(patch.file_path, media_type="image/png")


@router.get("/{slide_id}/thumbnail")
async def get_thumbnail(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    if not slide.thumbnail_path or not Path(slide.thumbnail_path).exists():
        raise HTTPException(status_code=404, detail="Thumbnail not generated yet")
    return FileResponse(slide.thumbnail_path, media_type="image/png")


@router.post("/{slide_id}/tile")
async def trigger_tiling(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    from app.workers.tile_worker import tile_slide

    task = tile_slide.delay(str(slide_id))
    slide.status = "tiling"
    await db.commit()

    return {"task_id": task.id, "status": "tiling"}


@router.delete("/{slide_id}")
async def delete_slide(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    await db.delete(slide)
    await db.commit()
    return {"status": "deleted"}


# ------------------------------------------------------------------
# DZI (Deep Zoom Image) endpoints for OpenSeadragon viewer
# ------------------------------------------------------------------

@router.get("/{slide_id}/dzi")
async def get_dzi_descriptor(
    slide_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return DZI XML descriptor for the slide."""
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    if not slide.original_path or not Path(slide.original_path).exists():
        raise HTTPException(status_code=404, detail="Slide file not found on disk")

    try:
        xml = dzi_service.get_dzi_xml(slide.original_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate DZI: {exc}")

    return Response(content=xml, media_type="application/xml")


async def _serve_dzi_tile(slide_id: uuid.UUID, level: int, tile_coord: str, db: AsyncSession):
    """Shared handler for DZI tile requests."""
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    if not slide.original_path or not Path(slide.original_path).exists():
        raise HTTPException(status_code=404, detail="Slide file not found on disk")

    try:
        parts = tile_coord.split("_")
        col = int(parts[0])
        row = int(parts[1])
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tile coordinate format: '{tile_coord}'. Expected 'col_row'.",
        )

    try:
        tile_bytes = dzi_service.get_tile(slide.original_path, level, col, row)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate tile: {exc}")

    return Response(content=tile_bytes, media_type="image/jpeg")


@router.get("/{slide_id}/dzi/{level}/{tile_coord}.jpeg")
async def get_dzi_tile(
    slide_id: uuid.UUID,
    level: int,
    tile_coord: str,
    db: AsyncSession = Depends(get_db),
):
    """Return a single DZI tile image as JPEG."""
    return await _serve_dzi_tile(slide_id, level, tile_coord, db)


@router.get("/{slide_id}/dzi_files/{level}/{tile_coord}.jpeg")
async def get_dzi_tile_osd(
    slide_id: uuid.UUID,
    level: int,
    tile_coord: str,
    db: AsyncSession = Depends(get_db),
):
    """Return a single DZI tile — OpenSeadragon default URL pattern."""
    return await _serve_dzi_tile(slide_id, level, tile_coord, db)


@router.get("/{slide_id}/export/patches/csv")
async def export_patches_csv(slide_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Export all patch IDs and coordinates as a CSV file."""
    slide = await db.get(Slide, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    result = await db.execute(
        select(Patch)
        .where(Patch.slide_id == slide_id)
        .order_by(Patch.x, Patch.y)
    )
    patches = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["patch_id", "x", "y", "level", "magnification", "tissue_fraction"])
    for p in patches:
        writer.writerow([
            str(p.id),
            p.x,
            p.y,
            p.level,
            p.magnification,
            f"{p.tissue_fraction:.4f}" if p.tissue_fraction is not None else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=patches_{slide_id}.csv"},
    )
