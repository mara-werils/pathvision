"""Spatial clustering and ROI detection for patch-level predictions."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from scipy.spatial import ConvexHull
from sklearn.cluster import DBSCAN

logger = logging.getLogger(__name__)

PATCH_SIZE_PX = 224


@dataclass
class PatchInfo:
    patch_id: str
    x: int
    y: int
    predicted_class: int
    predicted_label: str
    confidence: float


@dataclass
class ROI:
    id: int
    label: str
    patch_count: int
    area_mm2: float
    avg_confidence: float
    centroid: dict[str, float]
    boundary: list[list[float]]
    top_patches: list[dict]


@dataclass
class RegionSummary:
    total_regions: int
    total_tumor_area_mm2: float
    slide_tumor_percentage: float


@dataclass
class SpatialResult:
    regions: list[ROI]
    summary: RegionSummary


class SpatialService:
    """Detects spatially coherent tumor regions using DBSCAN clustering."""

    def detect_regions(
        self,
        patches: list[PatchInfo],
        target_label: str = "tumor",
        magnification: float = 40.0,
        total_slide_patches: int | None = None,
        eps_multiplier: float = 2.0,
        min_samples: int = 3,
    ) -> SpatialResult:
        """Run DBSCAN on tumor patches and compute ROIs with convex hulls.

        Args:
            patches: All patch predictions with coordinates.
            target_label: The label to cluster (default "tumor").
            magnification: Slide magnification (e.g. 40x).
            total_slide_patches: Total patches in the slide for percentage calc.
            eps_multiplier: Multiplier for DBSCAN eps relative to patch stride.
            min_samples: Minimum samples for DBSCAN core point.

        Returns:
            SpatialResult with list of ROIs and summary.
        """
        # Filter to target-label patches only
        tumor_patches = [p for p in patches if p.predicted_label == target_label]

        if not tumor_patches:
            return SpatialResult(
                regions=[],
                summary=RegionSummary(
                    total_regions=0,
                    total_tumor_area_mm2=0.0,
                    slide_tumor_percentage=0.0,
                ),
            )

        # Build coordinate array
        coords = np.array([[p.x, p.y] for p in tumor_patches], dtype=np.float64)

        # DBSCAN clustering
        eps = PATCH_SIZE_PX * eps_multiplier
        clustering = DBSCAN(eps=eps, min_samples=min_samples).fit(coords)
        labels = clustering.labels_

        unique_labels = sorted(set(labels) - {-1})

        # Compute pixel-to-mm conversion
        pixel_size_um = 1000.0 / magnification  # um per pixel
        patch_size_mm = PATCH_SIZE_PX * pixel_size_um / 1000.0
        patch_area_mm2 = patch_size_mm ** 2

        regions: list[ROI] = []

        for cluster_id in unique_labels:
            mask = labels == cluster_id
            cluster_patches = [p for p, m in zip(tumor_patches, mask) if m]
            cluster_coords = coords[mask]

            patch_count = len(cluster_patches)
            avg_confidence = float(np.mean([p.confidence for p in cluster_patches]))

            # Centroid
            centroid_x = float(np.mean(cluster_coords[:, 0]))
            centroid_y = float(np.mean(cluster_coords[:, 1]))

            # Convex hull boundary
            boundary: list[list[float]] = []
            if len(cluster_coords) >= 3:
                try:
                    hull = ConvexHull(cluster_coords)
                    boundary = [
                        [float(cluster_coords[v, 0]), float(cluster_coords[v, 1])]
                        for v in hull.vertices
                    ]
                except Exception:
                    # Degenerate case (collinear points)
                    boundary = cluster_coords.tolist()
            else:
                boundary = cluster_coords.tolist()

            # Area: simply patch_count * patch_area for grid-based patches
            area_mm2 = round(patch_count * patch_area_mm2, 4)

            # Top patches by confidence
            sorted_patches = sorted(cluster_patches, key=lambda p: p.confidence, reverse=True)
            top_patches = [
                {
                    "patch_id": p.patch_id,
                    "x": p.x,
                    "y": p.y,
                    "confidence": round(p.confidence, 4),
                }
                for p in sorted_patches[:5]
            ]

            regions.append(ROI(
                id=cluster_id + 1,
                label=target_label,
                patch_count=patch_count,
                area_mm2=area_mm2,
                avg_confidence=round(avg_confidence, 4),
                centroid={"x": round(centroid_x, 1), "y": round(centroid_y, 1)},
                boundary=boundary,
                top_patches=top_patches,
            ))

        # Sort by area descending
        regions.sort(key=lambda r: r.area_mm2, reverse=True)
        # Reassign IDs after sorting
        for i, r in enumerate(regions):
            r.id = i + 1

        total_tumor_area = round(sum(r.area_mm2 for r in regions), 4)
        total_for_pct = total_slide_patches if total_slide_patches else len(patches)
        total_tumor_patches = sum(r.patch_count for r in regions)
        tumor_pct = round(
            (total_tumor_patches / total_for_pct * 100) if total_for_pct else 0.0,
            2,
        )

        return SpatialResult(
            regions=regions,
            summary=RegionSummary(
                total_regions=len(regions),
                total_tumor_area_mm2=total_tumor_area,
                slide_tumor_percentage=tumor_pct,
            ),
        )
