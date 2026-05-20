from fastapi import APIRouter

router = APIRouter()


@router.post("/run")
async def run_inference():
    return {"detail": "Not implemented yet — Phase 5"}
