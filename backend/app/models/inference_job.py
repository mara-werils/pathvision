import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class InferenceJob(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "inference_jobs"

    slide_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("slides.id")
    )
    classifier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classifiers.id")
    )
    status: Mapped[str] = mapped_column(String(50), default="pending")
    progress_current: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[Optional[dict]] = mapped_column(JSONB)
    heatmap_path: Mapped[Optional[str]] = mapped_column(String(500))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
