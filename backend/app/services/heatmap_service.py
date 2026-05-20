"""Generate heatmap overlay images from patch-level predictions."""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Color map: class index -> BGR color
DEFAULT_COLORS = [
    (0, 180, 0),      # class 0 — green (e.g. normal)
    (0, 0, 220),      # class 1 — red (e.g. tumor)
    (220, 180, 0),    # class 2 — cyan
    (0, 220, 220),    # class 3 — yellow
    (220, 0, 220),    # class 4 — magenta
]


class HeatmapService:
    def generate(
        self,
        predictions: list[dict],
        slide_width: int,
        slide_height: int,
        patch_size: int,
        level_downsample: float,
        save_path: str,
        alpha: float = 0.6,
    ) -> str:
        """Generate a heatmap overlay image.

        Args:
            predictions: list of {x, y, predicted_class, confidence}
            slide_width: original slide width at level 0
            slide_height: original slide height at level 0
            patch_size: tile size (224)
            level_downsample: downsample factor for the tiling level
            save_path: where to save the PNG
            alpha: overlay opacity

        Returns:
            Path to saved heatmap image.
        """
        # Determine heatmap dimensions (downscaled for manageability)
        max_dim = 2048
        scale = min(max_dim / slide_width, max_dim / slide_height, 1.0)

        hm_w = int(slide_width * scale)
        hm_h = int(slide_height * scale)
        heatmap = np.zeros((hm_h, hm_w, 4), dtype=np.uint8)

        patch_w = max(1, int(patch_size * level_downsample * scale))
        patch_h = max(1, int(patch_size * level_downsample * scale))

        for pred in predictions:
            x = int(pred["x"] * scale)
            y = int(pred["y"] * scale)
            cls = pred["predicted_class"]
            conf = pred.get("confidence", 0.8)

            color = DEFAULT_COLORS[cls % len(DEFAULT_COLORS)]
            a = int(255 * alpha * min(conf, 1.0))

            x_end = min(x + patch_w, hm_w)
            y_end = min(y + patch_h, hm_h)

            heatmap[y:y_end, x:x_end, 0] = color[2]  # R
            heatmap[y:y_end, x:x_end, 1] = color[1]  # G
            heatmap[y:y_end, x:x_end, 2] = color[0]  # B
            heatmap[y:y_end, x:x_end, 3] = a          # A

        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(heatmap, "RGBA").save(save_path)
        logger.info("Heatmap saved to %s (%dx%d)", save_path, hm_w, hm_h)
        return save_path

    def generate_confidence_map(
        self,
        predictions: list[dict],
        slide_width: int,
        slide_height: int,
        patch_size: int,
        level_downsample: float,
        target_class: int,
        save_path: str,
    ) -> str:
        """Generate a single-channel confidence heatmap for a specific class.

        Uses a blue-to-red colormap (low confidence = blue, high = red).
        """
        max_dim = 2048
        scale = min(max_dim / slide_width, max_dim / slide_height, 1.0)
        hm_w = int(slide_width * scale)
        hm_h = int(slide_height * scale)

        conf_map = np.zeros((hm_h, hm_w), dtype=np.float32)
        patch_w = max(1, int(patch_size * level_downsample * scale))
        patch_h = max(1, int(patch_size * level_downsample * scale))

        for pred in predictions:
            x = int(pred["x"] * scale)
            y = int(pred["y"] * scale)
            probs = pred.get("probabilities", [])
            conf = probs[target_class] if target_class < len(probs) else 0.0

            x_end = min(x + patch_w, hm_w)
            y_end = min(y + patch_h, hm_h)
            conf_map[y:y_end, x:x_end] = conf

        # Apply colormap
        conf_u8 = (conf_map * 255).astype(np.uint8)
        colored = cv2.applyColorMap(conf_u8, cv2.COLORMAP_JET)
        colored_rgb = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)

        # Add alpha channel — transparent where no predictions
        alpha = np.where(conf_map > 0, 180, 0).astype(np.uint8)
        rgba = np.dstack([colored_rgb, alpha])

        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba, "RGBA").save(save_path)
        logger.info("Confidence map saved to %s", save_path)
        return save_path
