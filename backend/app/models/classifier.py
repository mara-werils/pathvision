from typing import Optional

from sqlalchemy import Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Classifier(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "classifiers"

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    class_names: Mapped[dict] = mapped_column(JSONB)
    n_classes: Mapped[int] = mapped_column(Integer)
    n_training_samples: Mapped[Optional[int]] = mapped_column(Integer)
    model_path: Mapped[Optional[str]] = mapped_column(String(500))
    metrics: Mapped[Optional[dict]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(50), default="training")
