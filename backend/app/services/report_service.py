"""Generate structured AI-assisted pathology reports from inference results."""

from __future__ import annotations

import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Optional


def _compute_confidence_stats(probabilities_list: list[dict | list]) -> dict:
    """Compute confidence statistics from a list of probability vectors."""
    confidences = []
    for probs in probabilities_list:
        if isinstance(probs, dict):
            values = list(probs.values())
        elif isinstance(probs, list):
            values = probs
        else:
            continue
        if values:
            confidences.append(max(values))

    if not confidences:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0, "std": 0.0}

    return {
        "mean": round(statistics.mean(confidences), 4),
        "median": round(statistics.median(confidences), 4),
        "min": round(min(confidences), 4),
        "max": round(max(confidences), 4),
        "std": round(statistics.stdev(confidences) if len(confidences) > 1 else 0.0, 4),
    }


def _count_tumor_regions(
    predictions: list[dict], tumor_label: str = "tumor", adjacency: int = 512
) -> int:
    """Estimate the number of distinct tumor regions via simple connected-component counting.

    Uses a flood-fill on patch grid coordinates. Two tumor patches are considered
    connected if they are within ``adjacency`` pixels (the default patch size) in
    both x and y directions.
    """
    tumor_coords = set()
    for pred in predictions:
        if pred.get("predicted_label", "").lower() == tumor_label.lower():
            tumor_coords.add((pred["x"], pred["y"]))

    if not tumor_coords:
        return 0

    visited: set[tuple[int, int]] = set()
    regions = 0

    for coord in tumor_coords:
        if coord in visited:
            continue
        regions += 1
        stack = [coord]
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in visited:
                continue
            visited.add((cx, cy))
            for dx, dy in [
                (-adjacency, 0),
                (adjacency, 0),
                (0, -adjacency),
                (0, adjacency),
            ]:
                neighbor = (cx + dx, cy + dy)
                if neighbor in tumor_coords and neighbor not in visited:
                    stack.append(neighbor)

    return regions


def generate_report_json(
    *,
    job_id: uuid.UUID,
    slide: dict,
    classifier: dict,
    class_counts: list[dict],
    total_patches: int,
    confidence_stats: dict,
    tumor_regions: int,
    embedding_model: str = "path-foundation-v1",
) -> dict[str, Any]:
    """Build the structured JSON report payload."""

    generated_at = datetime.now(timezone.utc).isoformat()

    # Specimen information
    magnification = slide.get("magnification")
    mag_str = f"{int(magnification)}x" if magnification else "N/A"

    dimensions = "N/A"
    if slide.get("width") and slide.get("height"):
        dimensions = f"{slide['width']} x {slide['height']}"

    specimen = {
        "filename": slide.get("filename", "N/A"),
        "dimensions": dimensions,
        "magnification": mag_str,
        "vendor": slide.get("vendor") or "N/A",
    }

    # Classifier / analysis info
    clf_metrics = classifier.get("metrics") or {}
    clf_auc = clf_metrics.get("auc")
    clf_report = clf_metrics.get("classification_report", {})

    # Compute weighted F1 from classification_report if available
    f1_weighted = None
    if clf_report:
        wa = clf_report.get("weighted avg", {})
        f1_weighted = wa.get("f1-score")
        if isinstance(f1_weighted, (int, float)):
            f1_weighted = round(f1_weighted, 4)

    analysis = {
        "classifier": classifier.get("name", "N/A"),
        "classifier_auc": clf_auc,
        "total_patches": total_patches,
        "embedding_model": embedding_model,
    }

    # Class distribution
    class_distribution = []
    tumor_percentage: Optional[float] = None
    for item in class_counts:
        pct = round(item["count"] / total_patches * 100, 2) if total_patches else 0.0
        class_distribution.append(
            {"class": item["label"], "count": item["count"], "percentage": pct}
        )
        if item["label"].lower() == "tumor":
            tumor_percentage = pct

    # Primary diagnosis line
    if tumor_percentage is not None and tumor_percentage > 0:
        primary_diagnosis = "Tumor tissue detected"
    else:
        primary_diagnosis = "No tumor tissue detected"

    findings = {
        "primary_diagnosis": primary_diagnosis,
        "tumor_percentage": tumor_percentage,
        "tumor_regions": tumor_regions,
        "class_distribution": class_distribution,
        "confidence": confidence_stats,
    }

    quality = {
        "embedding_model": embedding_model,
        "classifier_metrics": {
            "auc": clf_auc,
            "f1_weighted": f1_weighted,
        },
    }

    return {
        "title": "AI-Assisted Pathology Analysis Report",
        "report_id": str(job_id),
        "generated_at": generated_at,
        "specimen": specimen,
        "analysis": analysis,
        "findings": findings,
        "quality": quality,
        "disclaimer": (
            "This report is AI-generated and intended for research purposes only. "
            "It does not constitute a clinical diagnosis and should not be used as "
            "a substitute for professional medical judgment."
        ),
    }


def generate_report_text(report: dict[str, Any]) -> str:
    """Render the structured report dict as professional pathology report text."""

    lines: list[str] = []
    lines.append("=" * 72)
    lines.append(report["title"].upper().center(72))
    lines.append("=" * 72)
    lines.append("")

    # Specimen
    sp = report["specimen"]
    lines.append("SPECIMEN INFORMATION")
    lines.append("-" * 40)
    lines.append(f"  Slide Filename:    {sp['filename']}")
    lines.append(f"  Image Dimensions:  {sp['dimensions']} px")
    lines.append(f"  Scanning Mag.:     {sp['magnification']}")
    lines.append(f"  Scanner Vendor:    {sp['vendor']}")
    lines.append("")

    # Analysis
    an = report["analysis"]
    lines.append("AI ANALYSIS PARAMETERS")
    lines.append("-" * 40)
    lines.append(f"  Classifier:        {an['classifier']}")
    auc_str = f"{an['classifier_auc']:.4f}" if an.get("classifier_auc") else "N/A"
    lines.append(f"  Classifier AUC:    {auc_str}")
    lines.append(f"  Patches Analyzed:  {an['total_patches']}")
    lines.append(f"  Embedding Model:   {an['embedding_model']}")
    lines.append("")

    # Findings
    fd = report["findings"]
    lines.append("FINDINGS")
    lines.append("-" * 40)
    lines.append(f"  Primary Assessment: {fd['primary_diagnosis']}")
    lines.append("")

    if fd.get("tumor_percentage") is not None:
        lines.append(
            f"  Overall Classification: {fd['tumor_percentage']:.1f}% of analyzed "
            f"tissue classified as tumor."
        )
        if fd.get("tumor_regions", 0) > 0:
            lines.append(
                f"  Spatial Distribution: Tumor tissue distributed across "
                f"{fd['tumor_regions']} distinct region(s)."
            )
        lines.append("")

    lines.append("  Class Distribution:")
    for item in fd["class_distribution"]:
        lines.append(
            f"    - {item['class']:20s}  {item['count']:>6d} patches  "
            f"({item['percentage']:.1f}%)"
        )
    lines.append("")

    conf = fd["confidence"]
    lines.append("  Prediction Confidence:")
    lines.append(f"    Mean:     {conf['mean']:.4f}")
    lines.append(f"    Median:   {conf['median']:.4f}")
    lines.append(f"    Min:      {conf['min']:.4f}")
    lines.append(f"    Max:      {conf['max']:.4f}")
    lines.append(f"    Std Dev:  {conf['std']:.4f}")
    lines.append("")

    # Quality
    qa = report["quality"]
    lines.append("QUALITY METRICS")
    lines.append("-" * 40)
    lines.append(f"  Embedding Model:   {qa['embedding_model']}")
    cm = qa["classifier_metrics"]
    auc_str = f"{cm['auc']:.4f}" if cm.get("auc") else "N/A"
    f1_str = f"{cm['f1_weighted']:.4f}" if cm.get("f1_weighted") else "N/A"
    lines.append(f"  Classifier AUC:    {auc_str}")
    lines.append(f"  Weighted F1:       {f1_str}")
    lines.append("")

    # Disclaimer
    lines.append("DISCLAIMER")
    lines.append("-" * 40)
    lines.append(f"  {report['disclaimer']}")
    lines.append("")

    # Footer
    lines.append("=" * 72)
    lines.append(f"  Report ID:   {report['report_id']}")
    lines.append(f"  Generated:   {report['generated_at']}")
    lines.append("=" * 72)

    return "\n".join(lines)
