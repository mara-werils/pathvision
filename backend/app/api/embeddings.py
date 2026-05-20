from fastapi import APIRouter

router = APIRouter()


@router.post("/generate")
async def generate_embeddings():
    return {"detail": "Not implemented yet — Phase 3"}
