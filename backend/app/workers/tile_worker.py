"""Celery task: tile a WSI into 224×224 patches."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings
from app.models.patch import Patch
from app.models.slide import Slide
from app.services.slide_service import SlideService
from app.workers.celery_app import celery

logger = logging.getLogger(__name__)

engine = create_engine(settings.DATABASE_URL_SYNC)


@celery.task(bind=True, name="app.workers.tile_worker.tile_slide")
def tile_slide(self, slide_id: str) -> dict:
    svc = SlideService()
    sid = uuid.UUID(slide_id)

    with Session(engine) as db:
        slide = db.get(Slide, sid)
        if not slide:
            return {"error": "Slide not found"}

        slide.status = "tiling"
        db.commit()

        slide_path = slide.original_path
        tiles_dir = str(Path(settings.DATA_DIR) / "tiles" / slide_id)

        try:
            # Generate thumbnail
            thumb_dir = Path(settings.DATA_DIR) / "thumbnails"
            thumb_dir.mkdir(parents=True, exist_ok=True)
            thumb_path = str(thumb_dir / f"{slide_id}.png")
            svc.generate_thumbnail(slide_path, thumb_path)

            # Get properties
            props = svc.get_slide_properties(slide_path)

            # Tile
            patches = svc.tile(slide_path, tiles_dir)

            # Save patches to DB
            db_patches = []
            for p in patches:
                db_patches.append(
                    Patch(
                        slide_id=sid,
                        x=p["x"],
                        y=p["y"],
                        level=p["level"],
                        magnification=p.get("magnification"),
                        file_path=p["path"],
                        tissue_fraction=p.get("tissue_fraction"),
                    )
                )

            db.bulk_save_objects(db_patches)

            slide.status = "tiled"
            slide.tile_count = len(patches)
            slide.width = props.get("width")
            slide.height = props.get("height")
            slide.magnification = props.get("magnification")
            slide.vendor = props.get("vendor")
            slide.thumbnail_path = thumb_path
            slide.metadata_json = {
                k: v
                for k, v in props.get("properties", {}).items()
                if isinstance(v, (str, int, float, bool))
            } if "properties" in props else None
            db.commit()

            logger.info("Tiled slide %s: %d patches", slide_id, len(patches))
            return {"slide_id": slide_id, "patches": len(patches), "status": "tiled"}

        except Exception as e:
            logger.exception("Tiling failed for slide %s", slide_id)
            slide.status = "error"
            db.commit()
            return {"error": str(e)}
