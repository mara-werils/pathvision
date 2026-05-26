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


class AttentionPatchOut(BaseModel):
    patch_id: str
    x: int
    y: int
    attention_weight: float
    predicted_label: str


class SpatialSummaryOut(BaseModel):
    tumor_clusters: int
    largest_cluster_area_mm2: float


class SlideDiagnosisOut(BaseModel):
    slide_id: str
    diagnosis: str
    confidence: float
    class_probabilities: dict[str, float]
    total_patches: int
    tumor_patches: int
    tumor_percentage: float
    top_attention_patches: list[AttentionPatchOut]
    spatial_summary: SpatialSummaryOut
