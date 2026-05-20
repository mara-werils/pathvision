import uuid
from typing import Optional

from sqlalchemy import ARRAY, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Embedding(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "embeddings"

    patch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patches.id", ondelete="CASCADE"), index=True
    )
    slide_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("slides.id", ondelete="CASCADE"), index=True
    )
    vector: Mapped[list[float]] = mapped_column(ARRAY(Float))
    model_version: Mapped[str] = mapped_column(String(100), default="path-foundation-v1")
