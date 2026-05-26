import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class InferenceRequest(BaseModel):
    slide_id: uuid.UUID
    classifier_id: uuid.UUID


class InferenceJobOut(BaseModel):
    id: uuid.UUID
    slide_id: uuid.UUID
    classifier_id: uuid.UUID
    status: str
    progress_current: int
    progress_total: int
    summary: Optional[dict] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PatchPredictionOut(BaseModel):
    id: uuid.UUID
    patch_id: uuid.UUID
    predicted_class: int
    predicted_label: str
    probabilities: list[float]

    model_config = {"from_attributes": True}


class TopPatchOut(BaseModel):
    patch_id: str
    x: int
    y: int
    confidence: float


class CentroidOut(BaseModel):
    x: float
    y: float


class RegionOut(BaseModel):
    id: int
    label: str
    patch_count: int
    area_mm2: float
    avg_confidence: float
    centroid: CentroidOut
    boundary: list[list[float]]
    top_patches: list[TopPatchOut]


class RegionSummaryOut(BaseModel):
    total_regions: int
    total_tumor_area_mm2: float
    slide_tumor_percentage: float


class RegionsResponse(BaseModel):
    regions: list[RegionOut]
    summary: RegionSummaryOut
