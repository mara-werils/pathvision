from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.slide import Slide
from app.models.classifier import Classifier
from app.models.embedding import Embedding

router = APIRouter()


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    slides_count = await db.scalar(select(func.count(Slide.id)))
    classifiers_count = await db.scalar(select(func.count(Classifier.id)))
    embeddings_count = await db.scalar(select(func.count(Embedding.id)))

    return {
        "slides": slides_count or 0,
        "classifiers": classifiers_count or 0,
        "embeddings": embeddings_count or 0,
    }


@router.get("/health")
async def health():
    return {"status": "ok", "gpu": "not checked yet"}
