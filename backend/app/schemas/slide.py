import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SlideOut(BaseModel):
    id: uuid.UUID
    filename: str
    file_size_bytes: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    magnification: Optional[float] = None
    vendor: Optional[str] = None
    status: str
    tile_count: int
    tissue_percentage: Optional[float] = None
    thumbnail_path: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SlideListOut(BaseModel):
    id: uuid.UUID
    filename: str
    status: str
    tile_count: int
    file_size_bytes: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatchOut(BaseModel):
    id: uuid.UUID
    slide_id: uuid.UUID
    x: int
    y: int
    level: int
    magnification: Optional[float] = None
    tissue_fraction: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatchLabelRequest(BaseModel):
    label: str


class LabelSummaryOut(BaseModel):
    slide_id: uuid.UUID
    total_labeled: int
    counts: dict[str, int]
