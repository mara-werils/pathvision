"""Slide-level diagnosis via Multiple Instance Learning (MIL) aggregation.

Uses attention-based aggregation over patch predictions to produce
a single slide-level diagnosis with confidence and spatial analysis.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

import numpy as np
from sklearn.cluster import DBSCAN

logger = logging.getLogger(__name__)


@dataclass
class PatchInfo:
    """Minimal patch data needed for MIL aggregation."""

    patch_id: uuid.UUID
    x: int
    y: int
    predicted_class: int
    predicted_label: str
    probabilities: dict  # e.g. {"normal": 0.1, "tumor": 0.9} or list


@dataclass
class SlideDiagnosis:
    """Result of slide-level MIL aggregation."""

    slide_id: uuid.UUID
    diagnosis: str
    confidence: float
    class_probabilities: dict[str, float]
    total_patches: int
    tumor_patches: int
    tumor_percentage: float
    top_attention_patches: list[dict]
    spatial_summary: dict


class MILService:
    """Attention-based Multiple Instance Learning aggregation for slide diagnosis."""

    def __init__(
        self,
        tumor_label: str = "tumor",
        attention_top_k: int = 10,
        dbscan_eps_px: float = 512.0,
        dbscan_min_samples: int = 3,
        patch_size_um: float = 256.0,
    ):
        self.tumor_label = tumor_label
        self.attention_top_k = attention_top_k
        self.dbscan_eps_px = dbscan_eps_px
        self.dbscan_min_samples = dbscan_min_samples
        self.patch_size_um = patch_size_um

    def aggregate(
        self,
        slide_id: uuid.UUID,
        patches: list[PatchInfo],
        class_names: list[str] | None = None,
    ) -> SlideDiagnosis:
        """Run MIL aggregation over all patch predictions for a slide.

        The attention mechanism uses entropy-weighted softmax:
        patches with higher prediction confidence (lower entropy) receive
        more attention weight. The slide-level probability is the
        attention-weighted average of per-patch probabilities.
        """
        if not patches:
            return SlideDiagnosis(
                slide_id=slide_id,
                diagnosis="No patches available",
                confidence=0.0,
                class_probabilities={},
                total_patches=0,
                tumor_patches=0,
                tumor_percentage=0.0,
                top_attention_patches=[],
                spatial_summary={"tumor_clusters": 0, "largest_cluster_area_mm2": 0.0},
            )

        # Infer class names from the first patch if not provided
        if class_names is None:
            sample_probs = patches[0].probabilities
            if isinstance(sample_probs, dict):
                class_names = list(sample_probs.keys())
            else:
                class_names = [f"class_{i}" for i in range(len(sample_probs))]

        n_classes = len(class_names)
        n_patches = len(patches)

        # Build probability matrix (n_patches, n_classes)
        prob_matrix = np.zeros((n_patches, n_classes), dtype=np.float64)
        for i, p in enumerate(patches):
            if isinstance(p.probabilities, dict):
                for j, name in enumerate(class_names):
                    prob_matrix[i, j] = p.probabilities.get(name, 0.0)
            else:
                for j in range(min(len(p.probabilities), n_classes)):
                    prob_matrix[i, j] = p.probabilities[j]

        # --- Attention weights via inverse entropy ---
        # Shannon entropy per patch (low entropy = confident = high attention)
        eps = 1e-10
        entropy = -np.sum(prob_matrix * np.log(prob_matrix + eps), axis=1)
        max_entropy = np.log(n_classes + eps)
        # Inverse entropy: more confident patches get higher weight
        inv_entropy = max_entropy - entropy
        # Softmax to normalize
        inv_entropy_shifted = inv_entropy - np.max(inv_entropy)
        attention_weights = np.exp(inv_entropy_shifted)
        attention_weights = attention_weights / (np.sum(attention_weights) + eps)

        # --- Slide-level prediction ---
        slide_probs = attention_weights @ prob_matrix  # (n_classes,)
        # Normalize to valid probability distribution
        slide_probs = slide_probs / (np.sum(slide_probs) + eps)

        class_probabilities = {
            name: round(float(slide_probs[j]), 4)
            for j, name in enumerate(class_names)
        }

        # Determine diagnosis
        predicted_class_idx = int(np.argmax(slide_probs))
        predicted_label = class_names[predicted_class_idx]
        confidence = float(slide_probs[predicted_class_idx])

        # Determine tumor-specific stats
        tumor_idx = None
        for j, name in enumerate(class_names):
            if name.lower() == self.tumor_label.lower():
                tumor_idx = j
                break

        if tumor_idx is not None:
            tumor_mask = np.array(
                [p.predicted_label.lower() == self.tumor_label.lower() for p in patches]
            )
            tumor_patches = int(np.sum(tumor_mask))
            tumor_percentage = round(tumor_patches / n_patches * 100, 1)
            diagnosis = (
                "Tumor Detected"
                if slide_probs[tumor_idx] > 0.5
                else "No Tumor Detected"
            )
        else:
            # No explicit tumor class; use the predicted label
            tumor_patches = 0
            tumor_percentage = 0.0
            diagnosis = f"Predicted: {predicted_label}"

        # --- Top attention patches ---
        top_k = min(self.attention_top_k, n_patches)
        top_indices = np.argsort(attention_weights)[::-1][:top_k]
        top_attention_patches = []
        for idx in top_indices:
            p = patches[idx]
            top_attention_patches.append(
                {
                    "patch_id": str(p.patch_id),
                    "x": p.x,
                    "y": p.y,
                    "attention_weight": round(float(attention_weights[idx]), 6),
                    "predicted_label": p.predicted_label,
                }
            )

        # --- Spatial clustering of tumor patches ---
        spatial_summary = self._cluster_tumor_patches(patches, tumor_idx)

        return SlideDiagnosis(
            slide_id=slide_id,
            diagnosis=diagnosis,
            confidence=round(confidence, 4),
            class_probabilities=class_probabilities,
            total_patches=n_patches,
            tumor_patches=tumor_patches,
            tumor_percentage=tumor_percentage,
            top_attention_patches=top_attention_patches,
            spatial_summary=spatial_summary,
        )

    def _cluster_tumor_patches(
        self,
        patches: list[PatchInfo],
        tumor_idx: int | None,
    ) -> dict:
        """Use DBSCAN to find spatial clusters of tumor patches."""
        if tumor_idx is None:
            return {"tumor_clusters": 0, "largest_cluster_area_mm2": 0.0}

        tumor_patches = [
            p for p in patches if p.predicted_label.lower() == self.tumor_label.lower()
        ]
        if len(tumor_patches) < self.dbscan_min_samples:
            return {
                "tumor_clusters": 0 if len(tumor_patches) == 0 else 1,
                "largest_cluster_area_mm2": round(
                    len(tumor_patches) * (self.patch_size_um / 1000) ** 2, 2
                ),
            }

        coords = np.array([[p.x, p.y] for p in tumor_patches], dtype=np.float64)
        clustering = DBSCAN(
            eps=self.dbscan_eps_px,
            min_samples=self.dbscan_min_samples,
        ).fit(coords)

        labels = clustering.labels_
        unique_labels = set(labels)
        unique_labels.discard(-1)  # noise
        n_clusters = len(unique_labels)

        if n_clusters == 0:
            # All noise — treat as one diffuse region
            patch_area_mm2 = (self.patch_size_um / 1000) ** 2
            return {
                "tumor_clusters": 1,
                "largest_cluster_area_mm2": round(
                    len(tumor_patches) * patch_area_mm2, 2
                ),
            }

        # Find largest cluster by number of patches
        cluster_sizes = []
        for label in unique_labels:
            cluster_sizes.append(int(np.sum(labels == label)))

        largest_cluster_patches = max(cluster_sizes)
        patch_area_mm2 = (self.patch_size_um / 1000) ** 2
        largest_cluster_area_mm2 = round(largest_cluster_patches * patch_area_mm2, 2)

        return {
            "tumor_clusters": n_clusters,
            "largest_cluster_area_mm2": largest_cluster_area_mm2,
        }
