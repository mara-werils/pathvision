import asyncio
import uuid
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.embedding import Embedding

router = APIRouter()


class SimilarByPatchRequest(BaseModel):
    patch_id: uuid.UUID
    k: int = 20
    exclude_same_slide: bool = False


class SearchResult(BaseModel):
    patch_id: str
    slide_id: str
    similarity: float


@router.post("/similar", response_model=list[SearchResult])
async def search_similar(req: SimilarByPatchRequest, db: AsyncSession = Depends(get_db)):
    """Find similar patches by patch_id."""
    from app.services.search_service import SearchService

    emb = await db.execute(
        select(Embedding).where(Embedding.patch_id == req.patch_id).limit(1)
    )
    emb_row = emb.scalar_one_or_none()
    if not emb_row:
        raise HTTPException(status_code=404, detail="No embedding found for this patch")

    query = np.array(emb_row.vector, dtype=np.float32)
    exclude_sid = str(emb_row.slide_id) if req.exclude_same_slide else None

    svc = SearchService.get_instance()
    results = svc.search(query, k=req.k, exclude_slide_id=exclude_sid)
    return results


@router.post("/similar/upload", response_model=list[SearchResult])
async def search_similar_upload(
    file: UploadFile = File(...),
    k: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Find similar patches by uploading a query image.

    Requires the embedding model to be available.
    """
    from PIL import Image
    import io

    raw = await file.read()
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB").resize((224, 224))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    img_arr = np.array(img)

    from app.services.embedding_service import EmbeddingService
    from app.services.search_service import SearchService

    def _embed_and_search() -> list[dict]:
        svc_emb = EmbeddingService.get_instance()
        query = svc_emb.embed_patch(img_arr)
        svc = SearchService.get_instance()
        return svc.search(query, k=k)

    try:
        results = await asyncio.to_thread(_embed_and_search)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Embedding model unavailable: {exc}",
        )

    return results


@router.post("/index/rebuild")
async def rebuild_index(db: AsyncSession = Depends(get_db)):
    """Rebuild FAISS index from all embeddings in database."""
    from app.services.search_service import SearchService

    result = await db.execute(
        select(Embedding.patch_id, Embedding.slide_id, Embedding.vector)
    )
    rows = result.all()

    if not rows:
        return {"status": "empty", "vectors": 0}

    patch_ids = [str(r[0]) for r in rows]
    slide_ids = [str(r[1]) for r in rows]
    embeddings = np.array([r[2] for r in rows], dtype=np.float32)

    svc = SearchService.get_instance()
    count = svc.build_index(embeddings, patch_ids, slide_ids)

    return {"status": "rebuilt", "vectors": count}


@router.get("/index/stats")
async def index_stats():
    from app.services.search_service import SearchService

    svc = SearchService.get_instance()
    return svc.get_stats()
