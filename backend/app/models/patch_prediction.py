import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PatchPrediction(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "patch_predictions"

    inference_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inference_jobs.id", ondelete="CASCADE"), index=True
    )
    patch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patches.id")
    )
    predicted_class: Mapped[int] = mapped_column(Integer)
    predicted_label: Mapped[str] = mapped_column(String(100))
    probabilities: Mapped[dict] = mapped_column(JSONB)
