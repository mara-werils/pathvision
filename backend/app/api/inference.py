import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.inference_job import InferenceJob
from app.models.patch_prediction import PatchPrediction
from app.schemas.inference import InferenceJobOut, InferenceRequest, PatchPredictionOut

router = APIRouter()


@router.post("/run", response_model=InferenceJobOut)
async def run_inference(req: InferenceRequest, db: AsyncSession = Depends(get_db)):
    job = InferenceJob(
        slide_id=req.slide_id,
        classifier_id=req.classifier_id,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    from app.workers.inference_worker import run_inference as infer_task

    infer_task.delay(str(job.id))
    return job


@router.get("/{job_id}", response_model=InferenceJobOut)
async def get_inference_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    return job


@router.get("/{job_id}/predictions", response_model=list[PatchPredictionOut])
async def get_predictions(
    job_id: uuid.UUID,
    offset: int = 0,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PatchPrediction)
        .where(PatchPrediction.inference_job_id == job_id)
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


def _resolve_path(db_path: str | None) -> Path | None:
    """Resolve a file path that may differ between Docker and host."""
    if not db_path:
        return None
    p = Path(db_path)
    if p.exists():
        return p
    # Try mapping host path to Docker /data path
    if "/pathvision/data/" in db_path:
        alt = Path("/data/" + db_path.split("/pathvision/data/", 1)[1])
        if alt.exists():
            return alt
    # Try mapping /data to host path
    if db_path.startswith("/data/"):
        import os
        data_dir = os.environ.get("DATA_DIR", "/data")
        alt = Path(data_dir) / db_path[len("/data/"):]
        if alt.exists():
            return alt
    return None


@router.get("/{job_id}/heatmap")
async def get_heatmap(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    resolved = _resolve_path(job.heatmap_path)
    if not resolved:
        raise HTTPException(status_code=404, detail="Heatmap not generated yet")
    return FileResponse(str(resolved), media_type="image/png")


@router.get("/{job_id}/heatmap/confidence")
async def get_confidence_map(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    conf_db_path = job.heatmap_path.replace(".png", "_conf.png") if job.heatmap_path else None
    resolved = _resolve_path(conf_db_path)
    if not resolved:
        raise HTTPException(status_code=404, detail="Confidence map not available")
    return FileResponse(str(resolved), media_type="image/png")


@router.get("", response_model=list[InferenceJobOut])
async def list_inference_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InferenceJob).order_by(InferenceJob.created_at.desc()).limit(50)
    )
    return result.scalars().all()
