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
