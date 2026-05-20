from fastapi import APIRouter

router = APIRouter()


@router.post("/train")
async def train_classifier():
    return {"detail": "Not implemented yet — Phase 4"}


@router.get("")
async def list_classifiers():
    return []
