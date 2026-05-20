import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.models.slide import Slide
from app.schemas.slide import SlideOut, SlideListOut

router = APIRouter()


@router.post("/upload", response_model=SlideOut)
async def upload_slide(
    file: UploadFile = File(...),
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
