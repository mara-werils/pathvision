import uuid
from typing import Optional

from sqlalchemy import BigInteger, Float, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Slide(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "slides"

    filename: Mapped[str] = mapped_column(String(500))
    original_path: Mapped[Optional[str]] = mapped_column(String(1000))
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)
    magnification: Mapped[Optional[float]] = mapped_column(Float)
    vendor: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="uploaded")
    tile_count: Mapped[int] = mapped_column(Integer, default=0)
    tissue_percentage: Mapped[Optional[float]] = mapped_column(Float)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB)

    patches = relationship("Patch", back_populates="slide", cascade="all, delete-orphan")
