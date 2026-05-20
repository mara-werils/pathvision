from fastapi import APIRouter

router = APIRouter()


@router.post("/similar")
async def search_similar():
    return {"detail": "Not implemented yet — Phase 6"}
