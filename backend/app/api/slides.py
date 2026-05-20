import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.models.patch import Patch
from app.models.slide import Slide
from app.schemas.slide import SlideOut, SlideListOut, PatchOut

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
