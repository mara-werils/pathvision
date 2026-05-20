"""WSI tiling with OpenSlide + tissue detection via Otsu thresholding."""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Try OpenSlide; fall back to PIL-only mode for plain images
try:
    import openslide

    HAS_OPENSLIDE = True
except ImportError:
    HAS_OPENSLIDE = False
    logger.warning("openslide not installed — only plain images (.png/.jpg) supported")

PATCH_SIZE = settings.PATCH_SIZE  # 224


class SlideService:
    """Tile a WSI or plain image into 224×224 patches with tissue detection."""

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------
    def tile(
        self,
        slide_path: str,
        output_dir: str,
        magnification: int = 20,
    ) -> list[dict]:
        """Return list of ``{x, y, level, path, tissue_fraction}``."""
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        suffix = Path(slide_path).suffix.lower()
        if suffix in {".svs", ".tiff", ".tif", ".ndpi", ".mrxs"} and HAS_OPENSLIDE:
            return self._tile_wsi(slide_path, output_dir, magnification)
        return self._tile_plain_image(slide_path, output_dir)

    def generate_thumbnail(self, slide_path: str, save_path: str, size: int = 512) -> str:
        suffix = Path(slide_path).suffix.lower()
        if suffix in {".svs", ".tiff", ".tif", ".ndpi", ".mrxs"} and HAS_OPENSLIDE:
            slide = openslide.OpenSlide(slide_path)
            thumb = slide.get_thumbnail((size, size))
            slide.close()
        else:
            thumb = Image.open(slide_path).convert("RGB")
            thumb.thumbnail((size, size))
        thumb.save(save_path)
        return save_path

    def get_slide_properties(self, slide_path: str) -> dict:
        suffix = Path(slide_path).suffix.lower()
        if suffix in {".svs", ".tiff", ".tif", ".ndpi", ".mrxs"} and HAS_OPENSLIDE:
            slide = openslide.OpenSlide(slide_path)
            props = {
                "width": slide.dimensions[0],
                "height": slide.dimensions[1],
                "level_count": slide.level_count,
                "vendor": slide.properties.get(openslide.PROPERTY_NAME_VENDOR, ""),
                "magnification": float(
                    slide.properties.get(openslide.PROPERTY_NAME_OBJECTIVE_POWER, 0)
                ),
                "properties": dict(slide.properties),
            }
            slide.close()
            return props
        img = Image.open(slide_path)
        return {
            "width": img.width,
            "height": img.height,
            "level_count": 1,
            "vendor": "",
            "magnification": 0,
        }

    # ------------------------------------------------------------------
    # WSI tiling via OpenSlide
    # ------------------------------------------------------------------
    def _tile_wsi(
        self, slide_path: str, output_dir: str, target_mag: int
    ) -> list[dict]:
        slide = openslide.OpenSlide(slide_path)

        base_mag = float(
            slide.properties.get(openslide.PROPERTY_NAME_OBJECTIVE_POWER, 40)
        )
        downsample = base_mag / target_mag if target_mag else 1.0
        level = slide.get_best_level_for_downsample(downsample)
        level_dims = slide.level_dimensions[level]
        level_ds = slide.level_downsamples[level]

        # Tissue mask from low-res thumbnail
        thumb_level = slide.level_count - 1
        thumb_dims = slide.level_dimensions[thumb_level]
        thumbnail = np.array(
            slide.read_region((0, 0), thumb_level, thumb_dims).convert("RGB")
        )
        tissue_mask = self._detect_tissue(thumbnail)
        thumb_ds = slide.level_downsamples[thumb_level]

        patches: list[dict] = []
        step = int(PATCH_SIZE * level_ds)

        w_patches = level_dims[0] // PATCH_SIZE
        h_patches = level_dims[1] // PATCH_SIZE
        total = w_patches * h_patches
        logger.info("Tiling %s: %d×%d patches at level %d", slide_path, w_patches, h_patches, level)

        for row in range(h_patches):
            for col in range(w_patches):
                x0 = int(col * PATCH_SIZE * level_ds)
                y0 = int(row * PATCH_SIZE * level_ds)

                # Check tissue
                tx = int(x0 / thumb_ds)
                ty = int(y0 / thumb_ds)
                tw = max(1, int(PATCH_SIZE * level_ds / thumb_ds))
                th = max(1, int(PATCH_SIZE * level_ds / thumb_ds))
                tx_end = min(tx + tw, tissue_mask.shape[1])
                ty_end = min(ty + th, tissue_mask.shape[0])
                roi = tissue_mask[ty:ty_end, tx:tx_end]
                tissue_frac = float(roi.mean() / 255.0) if roi.size > 0 else 0.0

                if tissue_frac < settings.TISSUE_THRESHOLD:
                    continue

                region = slide.read_region(
                    (x0, y0), level, (PATCH_SIZE, PATCH_SIZE)
                ).convert("RGB")
                patch_path = Path(output_dir) / f"patch_{x0}_{y0}.png"
                region.save(patch_path)

                patches.append(
                    {
                        "x": x0,
                        "y": y0,
                        "level": level,
                        "magnification": target_mag,
                        "path": str(patch_path),
                        "tissue_fraction": round(tissue_frac, 4),
                    }
                )

        slide.close()
        logger.info("Extracted %d tissue patches from %s", len(patches), slide_path)
        return patches

    # ------------------------------------------------------------------
    # Plain image tiling (PNG / JPG)
    # ------------------------------------------------------------------
    def _tile_plain_image(self, image_path: str, output_dir: str) -> list[dict]:
        img = np.array(Image.open(image_path).convert("RGB"))
        h, w = img.shape[:2]
        tissue_mask = self._detect_tissue(img)
        patches: list[dict] = []

        for y in range(0, h - PATCH_SIZE + 1, PATCH_SIZE):
            for x in range(0, w - PATCH_SIZE + 1, PATCH_SIZE):
                roi_mask = tissue_mask[y : y + PATCH_SIZE, x : x + PATCH_SIZE]
                tissue_frac = float(roi_mask.mean() / 255.0)
                if tissue_frac < settings.TISSUE_THRESHOLD:
                    continue

                patch = img[y : y + PATCH_SIZE, x : x + PATCH_SIZE]
                patch_path = Path(output_dir) / f"patch_{x}_{y}.png"
                Image.fromarray(patch).save(patch_path)

                patches.append(
                    {
                        "x": x,
                        "y": y,
                        "level": 0,
                        "magnification": 0,
                        "path": str(patch_path),
                        "tissue_fraction": round(tissue_frac, 4),
                    }
                )

        logger.info("Extracted %d tissue patches from %s", len(patches), image_path)
        return patches

    # ------------------------------------------------------------------
    # Tissue detection (Otsu)
    # ------------------------------------------------------------------
    @staticmethod
    def _detect_tissue(rgb: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        return mask
