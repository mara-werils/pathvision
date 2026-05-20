import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PatchLabel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "patch_labels"
    __table_args__ = (UniqueConstraint("patch_id", "label"),)

    patch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patches.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(100))
    label_source: Mapped[Optional[str]] = mapped_column(String(50))
