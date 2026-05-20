import uuid
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Patch(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "patches"

    slide_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("slides.id", ondelete="CASCADE"), index=True
    )
    x: Mapped[int] = mapped_column(Integer)
    y: Mapped[int] = mapped_column(Integer)
    level: Mapped[int] = mapped_column(Integer)
    magnification: Mapped[Optional[float]] = mapped_column(Float)
    file_path: Mapped[Optional[str]] = mapped_column(String(500))
    tissue_fraction: Mapped[Optional[float]] = mapped_column(Float)

    slide = relationship("Slide", back_populates="patches")
