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


def generate_report_pdf(report: dict[str, Any]):
    """Generate a professional pathology report as a PDF. Returns a BytesIO buffer."""
    import io

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=25 * mm,
                            leftMargin=20 * mm, rightMargin=20 * mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("RT", parent=styles["Title"], fontSize=20, spaceAfter=4,
                                  textColor=colors.HexColor("#1e293b"))
    subtitle_style = ParagraphStyle("RS", parent=styles["Normal"], fontSize=10,
                                     textColor=colors.HexColor("#64748b"), spaceAfter=12)
    section_style = ParagraphStyle("RH", parent=styles["Heading2"], fontSize=13,
                                    textColor=colors.HexColor("#1e293b"), spaceBefore=14, spaceAfter=6)
    body_style = ParagraphStyle("RB", parent=styles["Normal"], fontSize=10, leading=14,
                                 textColor=colors.HexColor("#334155"))
    disclaimer_style = ParagraphStyle("RD", parent=styles["Normal"], fontSize=8, leading=11,
                                       textColor=colors.HexColor("#94a3b8"), fontName="Helvetica-Oblique")

    tbl_style = TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334155")),
        ("PADDING", (0, 0), (-1, -1), 7),
    ])

    elements: list = []

    # Header
    elements.append(Paragraph("PathVision", ParagraphStyle(
        "Logo", parent=styles["Normal"], fontSize=10,
        textColor=colors.HexColor("#4f46e5"), fontName="Helvetica-Bold")))
    elements.append(Paragraph(report["title"], title_style))
    elements.append(Paragraph(
        f"Report ID: {report['report_id']} &bull; Generated: {report['generated_at'][:19].replace('T', ' ')} UTC",
        subtitle_style))

    # Specimen
    elements.append(Paragraph("Specimen Information", section_style))
    sp = report["specimen"]
    t = Table([["Filename", sp["filename"]], ["Dimensions", f"{sp['dimensions']} px"],
               ["Magnification", sp["magnification"]], ["Vendor", sp["vendor"]]], colWidths=[150, 320])
    t.setStyle(tbl_style)
    elements.append(t)

    # Analysis
    elements.append(Paragraph("AI Analysis Parameters", section_style))
    an = report["analysis"]
    auc_str = f"{an['classifier_auc']:.4f}" if an.get("classifier_auc") else "N/A"
    t = Table([["Classifier", an["classifier"]], ["AUC", auc_str],
               ["Patches Analyzed", str(an["total_patches"])],
               ["Embedding Model", an["embedding_model"]]], colWidths=[150, 320])
    t.setStyle(tbl_style)
    elements.append(t)

    # Findings
    elements.append(Paragraph("Findings", section_style))
    fd = report["findings"]
    elements.append(Paragraph(f"<b>Primary Assessment:</b> {fd['primary_diagnosis']}", body_style))
    if fd.get("tumor_percentage") is not None:
        elements.append(Paragraph(
            f"<b>Overall Classification:</b> {fd['tumor_percentage']:.1f}% of tissue classified as tumor.", body_style))
    if fd.get("tumor_regions", 0) > 0:
        elements.append(Paragraph(
            f"<b>Spatial Distribution:</b> Tumor tissue across {fd['tumor_regions']} distinct region(s).", body_style))
    elements.append(Spacer(1, 3 * mm))

    # Class distribution table
    dist_rows = [["Class", "Count", "Percentage"]]
    for item in fd["class_distribution"]:
        dist_rows.append([item["class"].capitalize(), str(item["count"]), f"{item['percentage']:.1f}%"])
    dist_rows.append(["Total", str(an["total_patches"]), "100.0%"])
    t = Table(dist_rows, colWidths=[160, 120, 120])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # Disclaimer
    elements.append(Paragraph(report["disclaimer"], disclaimer_style))

    doc.build(elements)
    buf.seek(0)
    return buf
