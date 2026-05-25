import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClassifierCreate(BaseModel):
    name: str
    description: Optional[str] = None
    class_names: list[str]


class ClassifierOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    class_names: list[str]
    n_classes: int
    n_training_samples: Optional[int] = None
    metrics: Optional[dict] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LabelUpload(BaseModel):
    patch_id: uuid.UUID
    label: str


class ActiveLearningRequest(BaseModel):
    slide_id: uuid.UUID
    top_n: int = 20


class UncertainPatchOut(BaseModel):
    patch_id: uuid.UUID
    x: int
    y: int
    max_probability: float
    predicted_label: str
