"""Deep Zoom Image (DZI) tile generation service for WSI viewing with OpenSeadragon."""

from __future__ import annotations

import io
import logging
import math
from pathlib import Path

from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

try:
    import openslide
    from openslide.deepzoom import DeepZoomGenerator

    HAS_OPENSLIDE = True
except ImportError:
    HAS_OPENSLIDE = False
    logger.warning("openslide not installed — DZI will use PIL-only fallback")

# Tile size and overlap used by Deep Zoom
TILE_SIZE = 254
OVERLAP = 1
TILE_FORMAT = "jpeg"
TILE_QUALITY = 80


class DZIService:
    """Generate DZI descriptors and tiles from WSI or plain images."""

    def __init__(self) -> None:
        self._cache: dict[str, _DZISource] = {}

    def _get_source(self, slide_path: str) -> _DZISource:
        """Get or create a DZI source for the given slide path."""
        if slide_path not in self._cache:
            self._cache[slide_path] = _DZISource(slide_path)
        return self._cache[slide_path]

    def get_dzi_xml(self, slide_path: str) -> str:
        """Return DZI XML descriptor string for the slide."""
        source = self._get_source(slide_path)
        return source.get_dzi_xml()

    def get_tile(self, slide_path: str, level: int, col: int, row: int) -> bytes:
        """Return JPEG bytes for a single tile at the given level/col/row."""
        source = self._get_source(slide_path)
        return source.get_tile(level, col, row)

    def evict(self, slide_path: str) -> None:
        """Remove a slide from the cache."""
        source = self._cache.pop(slide_path, None)
        if source is not None:
            source.close()


class _DZISource:
    """Wraps either OpenSlide DeepZoomGenerator or a PIL-based fallback."""

    def __init__(self, slide_path: str) -> None:
        self._path = slide_path
        suffix = Path(slide_path).suffix.lower()
        self._use_openslide = (
            suffix in {".svs", ".tiff", ".tif", ".ndpi", ".mrxs"} and HAS_OPENSLIDE
        )

        if self._use_openslide:
            self._osr = openslide.OpenSlide(slide_path)
            self._dz = DeepZoomGenerator(
                self._osr, tile_size=TILE_SIZE, overlap=OVERLAP, limit_bounds=True
            )
            self._width, self._height = self._osr.dimensions
        else:
            self._img = Image.open(slide_path).convert("RGB")
            self._width, self._height = self._img.size
            self._osr = None
            self._dz = None

    # ------------------------------------------------------------------ #
    # DZI XML
    # ------------------------------------------------------------------ #
    def get_dzi_xml(self) -> str:
        if self._dz is not None:
            return self._dz.get_dzi(TILE_FORMAT)

        # Manual DZI XML for plain images
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"'
            f' Format="{TILE_FORMAT}"'
            f' Overlap="{OVERLAP}"'
            f' TileSize="{TILE_SIZE}">'
            f'<Size Height="{self._height}" Width="{self._width}"/>'
            f"</Image>"
        )

    # ------------------------------------------------------------------ #
    # Tile generation
    # ------------------------------------------------------------------ #
    def get_tile(self, level: int, col: int, row: int) -> bytes:
        if self._dz is not None:
            return self._tile_openslide(level, col, row)
        return self._tile_pil(level, col, row)

    def _tile_openslide(self, level: int, col: int, row: int) -> bytes:
        """Get tile via OpenSlide DeepZoomGenerator."""
        if level < 0 or level >= self._dz.level_count:
            raise ValueError(f"Invalid level {level}")

        cols, rows = self._dz.level_tiles[level]
        if col < 0 or col >= cols or row < 0 or row >= rows:
            raise ValueError(f"Invalid tile coordinates ({col}, {row}) at level {level}")

        tile = self._dz.get_tile(level, (col, row))
        buf = io.BytesIO()
        tile.save(buf, format="JPEG", quality=TILE_QUALITY)
        return buf.getvalue()

    def _tile_pil(self, level: int, col: int, row: int) -> bytes:
        """Generate a DZI tile from a plain PIL image."""
        max_dim = max(self._width, self._height)
        max_level = math.ceil(math.log2(max_dim)) if max_dim > 0 else 0

        if level < 0 or level > max_level:
            raise ValueError(f"Invalid level {level}")

        # At max_level the image is at full resolution.
        # Each level below halves the dimensions.
        scale = 2 ** (max_level - level)
        scaled_w = max(1, math.ceil(self._width / scale))
        scaled_h = max(1, math.ceil(self._height / scale))

        # Tile grid size at this level
        tile_cols = math.ceil(scaled_w / TILE_SIZE)
        tile_rows = math.ceil(scaled_h / TILE_SIZE)

        if col < 0 or col >= tile_cols or row < 0 or row >= tile_rows:
            raise ValueError(
                f"Invalid tile coordinates ({col}, {row}) at level {level}"
            )

        # Compute pixel region in scaled image
        x0 = col * TILE_SIZE - (OVERLAP if col > 0 else 0)
        y0 = row * TILE_SIZE - (OVERLAP if row > 0 else 0)
        x1 = min(
            (col + 1) * TILE_SIZE + (OVERLAP if col < tile_cols - 1 else 0),
            scaled_w,
        )
        y1 = min(
            (row + 1) * TILE_SIZE + (OVERLAP if row < tile_rows - 1 else 0),
            scaled_h,
        )

        # Resize source image to the scale for this level, then crop the tile
        scaled_img = self._img.resize((scaled_w, scaled_h), Image.LANCZOS)
        tile = scaled_img.crop((max(0, x0), max(0, y0), x1, y1))

        buf = io.BytesIO()
        tile.save(buf, format="JPEG", quality=TILE_QUALITY)
        return buf.getvalue()

    def close(self) -> None:
        if self._osr is not None:
            self._osr.close()
            self._osr = None
            self._dz = None


# Module-level singleton
dzi_service = DZIService()
