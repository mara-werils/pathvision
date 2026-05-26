import csv
import io
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.classifier import Classifier
from app.models.inference_job import InferenceJob
from app.models.patch import Patch
from app.models.patch_prediction import PatchPrediction
from app.models.slide import Slide
from app.schemas.inference import InferenceJobOut, InferenceRequest, PatchPredictionOut

router = APIRouter()


@router.post("/run", response_model=InferenceJobOut)
async def run_inference(req: InferenceRequest, db: AsyncSession = Depends(get_db)):
    job = InferenceJob(
        slide_id=req.slide_id,
        classifier_id=req.classifier_id,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    from app.workers.inference_worker import run_inference as infer_task

    infer_task.delay(str(job.id))
    return job


@router.get("/{job_id}", response_model=InferenceJobOut)
async def get_inference_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    return job


@router.get("/{job_id}/predictions", response_model=list[PatchPredictionOut])
async def get_predictions(
    job_id: uuid.UUID,
    offset: int = 0,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PatchPrediction)
        .where(PatchPrediction.inference_job_id == job_id)
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


def _resolve_path(db_path: str | None) -> Path | None:
    """Resolve a file path that may differ between Docker and host."""
    if not db_path:
        return None
    p = Path(db_path)
    if p.exists():
        return p
    # Try mapping host path to Docker /data path
    if "/pathvision/data/" in db_path:
        alt = Path("/data/" + db_path.split("/pathvision/data/", 1)[1])
        if alt.exists():
            return alt
    # Try mapping /data to host path
    if db_path.startswith("/data/"):
        import os
        data_dir = os.environ.get("DATA_DIR", "/data")
        alt = Path(data_dir) / db_path[len("/data/"):]
        if alt.exists():
            return alt
    return None


@router.get("/{job_id}/heatmap")
async def get_heatmap(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    resolved = _resolve_path(job.heatmap_path)
    if not resolved:
        raise HTTPException(status_code=404, detail="Heatmap not generated yet")
    return FileResponse(str(resolved), media_type="image/png")


@router.get("/{job_id}/heatmap/confidence")
async def get_confidence_map(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    conf_db_path = job.heatmap_path.replace(".png", "_conf.png") if job.heatmap_path else None
    resolved = _resolve_path(conf_db_path)
    if not resolved:
        raise HTTPException(status_code=404, detail="Confidence map not available")
    return FileResponse(str(resolved), media_type="image/png")


@router.get("/{job_id}/export/csv")
async def export_predictions_csv(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Export patch predictions as a CSV file."""
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")

    result = await db.execute(
        select(
            PatchPrediction.patch_id,
            Patch.x,
            Patch.y,
            PatchPrediction.predicted_class,
            PatchPrediction.predicted_label,
            PatchPrediction.probabilities,
        )
        .join(Patch, PatchPrediction.patch_id == Patch.id)
        .where(PatchPrediction.inference_job_id == job_id)
    )
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["patch_id", "x", "y", "predicted_class", "predicted_label", "confidence", "probabilities"])
    for row in rows:
        probs = row.probabilities if isinstance(row.probabilities, list) else list(row.probabilities.values()) if isinstance(row.probabilities, dict) else []
        confidence = max(probs) if probs else 0.0
        writer.writerow([
            str(row.patch_id),
            row.x,
            row.y,
            row.predicted_class,
            row.predicted_label,
            f"{confidence:.4f}",
            ";".join(f"{p:.4f}" for p in probs),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=predictions_{job_id}.csv"},
    )


@router.get("/{job_id}/export/pdf")
async def export_predictions_pdf(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Export a PDF report for inference results."""
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")

    slide = await db.get(Slide, job.slide_id)
    classifier = await db.get(Classifier, job.classifier_id)

    # Get prediction counts per class
    result = await db.execute(
        select(
            PatchPrediction.predicted_label,
            PatchPrediction.predicted_class,
            func.count().label("count"),
        )
        .where(PatchPrediction.inference_job_id == job_id)
        .group_by(PatchPrediction.predicted_label, PatchPrediction.predicted_class)
        .order_by(PatchPrediction.predicted_class)
    )
    class_counts = result.all()

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title2", parent=styles["Title"], fontSize=22, spaceAfter=12)
    heading_style = ParagraphStyle("Heading", parent=styles["Heading2"], fontSize=14, spaceAfter=6)

    elements: list = []

    # Title
    elements.append(Paragraph("PathVision Inference Report", title_style))
    elements.append(Spacer(1, 6 * mm))

    # Slide info
    elements.append(Paragraph("Slide Information", heading_style))
    slide_data = [
        ["Filename", slide.filename if slide else "N/A"],
        ["Dimensions", f"{slide.width} x {slide.height}" if slide and slide.width else "N/A"],
        ["Patch Count", str(slide.tile_count) if slide else "N/A"],
    ]
    t = Table(slide_data, colWidths=[120, 300])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # Classifier info
    elements.append(Paragraph("Classifier Information", heading_style))
    clf_auc = classifier.metrics.get("auc", "N/A") if classifier and classifier.metrics else "N/A"
    if isinstance(clf_auc, float):
        clf_auc = f"{clf_auc:.4f}"
    clf_data = [
        ["Name", classifier.name if classifier else "N/A"],
        ["AUC", str(clf_auc)],
        ["Classes", ", ".join(classifier.class_names) if classifier and classifier.class_names else "N/A"],
    ]
    t = Table(clf_data, colWidths=[120, 300])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # Summary — class distribution table
    elements.append(Paragraph("Class Distribution Summary", heading_style))
    total = sum(row.count for row in class_counts) if class_counts else 0
    summary_header = ["Class", "Predicted Label", "Count", "Percentage"]
    summary_rows = [summary_header]
    for row in class_counts:
        pct = f"{row.count / total * 100:.1f}%" if total else "0%"
        summary_rows.append([str(row.predicted_class), row.predicted_label, str(row.count), pct])
    summary_rows.append(["", "Total", str(total), "100%"])

    t = Table(summary_rows, colWidths=[60, 150, 80, 80])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e5e7eb")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (2, 0), (-1, -1), "CENTER"),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # Footer
    elements.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC &bull; Job ID: {job_id}",
        styles["Normal"],
    ))

    doc.build(elements)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{job_id}.pdf"},
    )


async def _build_report_data(
    job_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Gather all data needed for report generation."""
    from app.services.report_service import (
        _compute_confidence_stats,
        _count_tumor_regions,
        generate_report_json,
    )

    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    if job.status != "complete":
        raise HTTPException(status_code=400, detail="Inference job is not complete")

    slide = await db.get(Slide, job.slide_id)
    classifier = await db.get(Classifier, job.classifier_id)

    # Class distribution from aggregation
    result = await db.execute(
        select(
            PatchPrediction.predicted_label,
            PatchPrediction.predicted_class,
            func.count().label("count"),
        )
        .where(PatchPrediction.inference_job_id == job_id)
        .group_by(PatchPrediction.predicted_label, PatchPrediction.predicted_class)
        .order_by(PatchPrediction.predicted_class)
    )
    class_rows = result.all()
    total_patches = sum(r.count for r in class_rows)
    class_counts = [
        {"label": r.predicted_label, "class_idx": r.predicted_class, "count": r.count}
        for r in class_rows
    ]

    # Get all predictions for confidence stats and spatial analysis
    result = await db.execute(
        select(
            PatchPrediction.predicted_label,
            PatchPrediction.probabilities,
            Patch.x,
            Patch.y,
        )
        .join(Patch, PatchPrediction.patch_id == Patch.id)
        .where(PatchPrediction.inference_job_id == job_id)
    )
    all_preds = result.all()

    probabilities_list = [r.probabilities for r in all_preds]
    confidence_stats = _compute_confidence_stats(probabilities_list)

    pred_dicts = [
        {"predicted_label": r.predicted_label, "x": r.x, "y": r.y}
        for r in all_preds
    ]
    tumor_regions = _count_tumor_regions(pred_dicts)

    # Determine embedding model version
    embedding_model = "path-foundation-v1"

    slide_dict = {
        "filename": slide.filename if slide else "N/A",
        "width": slide.width if slide else None,
        "height": slide.height if slide else None,
        "magnification": slide.magnification if slide else None,
        "vendor": slide.vendor if slide else None,
    }

    classifier_dict = {
        "name": classifier.name if classifier else "N/A",
        "metrics": classifier.metrics if classifier else {},
    }

    report = generate_report_json(
        job_id=job_id,
        slide=slide_dict,
        classifier=classifier_dict,
        class_counts=class_counts,
        total_patches=total_patches,
        confidence_stats=confidence_stats,
        tumor_regions=tumor_regions,
        embedding_model=embedding_model,
    )
    return report


@router.get("/{job_id}/report")
async def get_inference_report(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return a structured AI-assisted pathology report as JSON."""
    return await _build_report_data(job_id, db)


@router.get("/{job_id}/export/report")
async def export_report_pdf(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate a professional AI-assisted pathology report as PDF."""
    report = await _build_report_data(job_id, db)

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=25 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=20,
        spaceAfter=4,
        textColor=colors.HexColor("#1e293b"),
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=12,
    )
    section_style = ParagraphStyle(
        "SectionHead",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=14,
        spaceAfter=6,
        borderWidth=0,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
    )
    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#94a3b8"),
        fontName="Helvetica-Oblique",
    )

    elements: list = []

    # ---- Header ----
    elements.append(Paragraph("PathVision", ParagraphStyle(
        "Logo", parent=styles["Normal"], fontSize=10,
        textColor=colors.HexColor("#4f46e5"), fontName="Helvetica-Bold",
    )))
    elements.append(Paragraph(report["title"], title_style))
    elements.append(Paragraph(
        f"Report ID: {report['report_id']} &bull; "
        f"Generated: {report['generated_at'][:19].replace('T', ' ')} UTC",
        subtitle_style,
    ))
    elements.append(Spacer(1, 2 * mm))

    # ---- Specimen Information ----
    elements.append(Paragraph("Specimen Information", section_style))
    sp = report["specimen"]
    spec_data = [
        ["Slide Filename", sp["filename"]],
        ["Image Dimensions", f"{sp['dimensions']} px"],
        ["Scanning Magnification", sp["magnification"]],
        ["Scanner Vendor", sp["vendor"]],
    ]
    t = Table(spec_data, colWidths=[150, 320])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334155")),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(t)

    # ---- AI Analysis Parameters ----
    elements.append(Paragraph("AI Analysis Parameters", section_style))
    an = report["analysis"]
    auc_str = f"{an['classifier_auc']:.4f}" if an.get("classifier_auc") else "N/A"
    analysis_data = [
        ["Classifier", an["classifier"]],
        ["Classifier AUC", auc_str],
        ["Patches Analyzed", str(an["total_patches"])],
        ["Embedding Model", an["embedding_model"]],
    ]
    t = Table(analysis_data, colWidths=[150, 320])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334155")),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(t)

    # ---- Findings ----
    elements.append(Paragraph("Findings", section_style))

    fd = report["findings"]
    elements.append(Paragraph(
        f"<b>Primary Assessment:</b> {fd['primary_diagnosis']}", body_style
    ))

    if fd.get("tumor_percentage") is not None:
        elements.append(Paragraph(
            f"<b>Overall Classification:</b> {fd['tumor_percentage']:.1f}% of analyzed "
            f"tissue classified as tumor.", body_style
        ))
        if fd.get("tumor_regions", 0) > 0:
            elements.append(Paragraph(
                f"<b>Spatial Distribution:</b> Tumor tissue distributed across "
                f"{fd['tumor_regions']} distinct region(s).", body_style
            ))

    elements.append(Spacer(1, 3 * mm))

    # Class distribution table
    elements.append(Paragraph("<b>Class Distribution</b>", body_style))
    dist_header = ["Class", "Patch Count", "Percentage"]
    dist_rows = [dist_header]
    for item in fd["class_distribution"]:
        dist_rows.append([
            item["class"].capitalize(),
            str(item["count"]),
            f"{item['percentage']:.1f}%",
        ])
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
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#334155")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 3 * mm))

    # Confidence statistics table
    elements.append(Paragraph("<b>Prediction Confidence</b>", body_style))
    conf = fd["confidence"]
    conf_data = [
        ["Statistic", "Value"],
        ["Mean Confidence", f"{conf['mean']:.4f}"],
        ["Median Confidence", f"{conf['median']:.4f}"],
        ["Minimum", f"{conf['min']:.4f}"],
        ["Maximum", f"{conf['max']:.4f}"],
        ["Standard Deviation", f"{conf['std']:.4f}"],
    ]
    t = Table(conf_data, colWidths=[200, 200])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#334155")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(t)

    # ---- Quality Metrics ----
    elements.append(Paragraph("Quality Metrics", section_style))
    qa = report["quality"]
    cm = qa["classifier_metrics"]
    qa_auc = f"{cm['auc']:.4f}" if cm.get("auc") else "N/A"
    qa_f1 = f"{cm['f1_weighted']:.4f}" if cm.get("f1_weighted") else "N/A"
    qa_data = [
        ["Embedding Model", qa["embedding_model"]],
        ["Classifier AUC", qa_auc],
        ["Weighted F1 Score", qa_f1],
    ]
    t = Table(qa_data, colWidths=[150, 320])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334155")),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(t)

    # ---- Disclaimer ----
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(report["disclaimer"], disclaimer_style))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(
        f"Report ID: {report['report_id']} &bull; "
        f"Generated: {report['generated_at'][:19].replace('T', ' ')} UTC &bull; "
        f"PathVision Digital Pathology Platform",
        disclaimer_style,
    ))

    doc.build(elements)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=pathology_report_{job_id}.pdf"
        },
    )


@router.get("", response_model=list[InferenceJobOut])
async def list_inference_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InferenceJob).order_by(InferenceJob.created_at.desc()).limit(50)
    )
    return result.scalars().all()
