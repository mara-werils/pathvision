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
from app.schemas.inference import (
    InferenceJobOut,
    InferenceRequest,
    PatchPredictionOut,
    RegionsResponse,
    SlideDiagnosisOut,
)
from app.services.mil_service import MILService, PatchInfo as MILPatchInfo
from app.services.spatial_service import PatchInfo as SpatialPatchInfo, SpatialService

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
        f"Generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC &#8226; Job ID: {job_id}",
        styles["Normal"],
    ))

    doc.build(elements)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{job_id}.pdf"},
    )


@router.get("/{job_id}/slide-diagnosis", response_model=SlideDiagnosisOut)
async def get_slide_diagnosis(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Compute slide-level diagnosis using MIL attention aggregation."""
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    if job.status != "complete":
        raise HTTPException(status_code=400, detail="Inference job is not complete yet")

    classifier = await db.get(Classifier, job.classifier_id)
    class_names = list(classifier.class_names) if classifier and classifier.class_names else None

    result = await db.execute(
        select(
            PatchPrediction.patch_id, Patch.x, Patch.y,
            PatchPrediction.predicted_class, PatchPrediction.predicted_label,
            PatchPrediction.probabilities,
        )
        .join(Patch, PatchPrediction.patch_id == Patch.id)
        .where(PatchPrediction.inference_job_id == job_id)
    )
    rows = result.all()
    if not rows:
        raise HTTPException(status_code=404, detail="No predictions found for this job")

    patches = [
        MILPatchInfo(
            patch_id=row.patch_id, x=row.x, y=row.y,
            predicted_class=row.predicted_class,
            predicted_label=row.predicted_label,
            probabilities=row.probabilities,
        )
        for row in rows
    ]

    mil = MILService()
    diagnosis = mil.aggregate(slide_id=job.slide_id, patches=patches, class_names=class_names)
    return SlideDiagnosisOut(
        slide_id=str(diagnosis.slide_id),
        diagnosis=diagnosis.diagnosis,
        confidence=diagnosis.confidence,
        class_probabilities=diagnosis.class_probabilities,
        total_patches=diagnosis.total_patches,
        tumor_patches=diagnosis.tumor_patches,
        tumor_percentage=diagnosis.tumor_percentage,
        top_attention_patches=diagnosis.top_attention_patches,
        spatial_summary=diagnosis.spatial_summary,
    )


@router.post("/{job_id}/regions", response_model=RegionsResponse)
async def detect_regions(
    job_id: uuid.UUID, target_label: str = "tumor",
    db: AsyncSession = Depends(get_db),
):
    """Detect spatially coherent tumor regions using DBSCAN clustering."""
    job = await db.get(InferenceJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found")
    if job.status != "complete":
        raise HTTPException(status_code=400, detail="Inference job is not complete")

    result = await db.execute(
        select(
            PatchPrediction.patch_id, Patch.x, Patch.y, Patch.magnification,
            PatchPrediction.predicted_class, PatchPrediction.predicted_label,
            PatchPrediction.probabilities,
        )
        .join(Patch, PatchPrediction.patch_id == Patch.id)
        .where(PatchPrediction.inference_job_id == job_id)
    )
    rows = result.all()
    if not rows:
        return RegionsResponse(
            regions=[],
            summary={"total_regions": 0, "total_tumor_area_mm2": 0.0, "slide_tumor_percentage": 0.0},
        )

    magnification = rows[0].magnification or 40.0
    patch_infos = []
    for row in rows:
        probs = row.probabilities
        if isinstance(probs, dict):
            probs = list(probs.values())
        patch_infos.append(SpatialPatchInfo(
            patch_id=str(row.patch_id), x=row.x, y=row.y,
            predicted_class=row.predicted_class,
            predicted_label=row.predicted_label,
            confidence=max(probs) if probs else 0.0,
        ))

    slide = await db.get(Slide, job.slide_id)
    total_slide_patches = slide.tile_count if slide and slide.tile_count else len(rows)

    service = SpatialService()
    spatial_result = service.detect_regions(
        patches=patch_infos, target_label=target_label,
        magnification=magnification, total_slide_patches=total_slide_patches,
    )
    return RegionsResponse(
        regions=[
            {"id": r.id, "label": r.label, "patch_count": r.patch_count,
             "area_mm2": r.area_mm2, "avg_confidence": r.avg_confidence,
             "centroid": r.centroid, "boundary": r.boundary, "top_patches": r.top_patches}
            for r in spatial_result.regions
        ],
        summary={
            "total_regions": spatial_result.summary.total_regions,
            "total_tumor_area_mm2": spatial_result.summary.total_tumor_area_mm2,
            "slide_tumor_percentage": spatial_result.summary.slide_tumor_percentage,
        },
    )


async def _build_report_data(job_id: uuid.UUID, db: AsyncSession) -> dict:
    """Gather all data needed for AI report generation."""
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

    result = await db.execute(
        select(PatchPrediction.predicted_label, PatchPrediction.predicted_class, func.count().label("count"))
        .where(PatchPrediction.inference_job_id == job_id)
        .group_by(PatchPrediction.predicted_label, PatchPrediction.predicted_class)
        .order_by(PatchPrediction.predicted_class)
    )
    class_rows = result.all()
    total_patches = sum(r.count for r in class_rows)
    class_counts = [{"label": r.predicted_label, "class_idx": r.predicted_class, "count": r.count} for r in class_rows]

    result = await db.execute(
        select(PatchPrediction.predicted_label, PatchPrediction.probabilities, Patch.x, Patch.y)
        .join(Patch, PatchPrediction.patch_id == Patch.id)
        .where(PatchPrediction.inference_job_id == job_id)
    )
    all_preds = result.all()
    confidence_stats = _compute_confidence_stats([r.probabilities for r in all_preds])
    tumor_regions = _count_tumor_regions([{"predicted_label": r.predicted_label, "x": r.x, "y": r.y} for r in all_preds])

    return generate_report_json(
        job_id=job_id,
        slide={"filename": slide.filename if slide else "N/A", "width": slide.width if slide else None,
               "height": slide.height if slide else None, "magnification": slide.magnification if slide else None,
               "vendor": slide.vendor if slide else None},
        classifier={"name": classifier.name if classifier else "N/A", "metrics": classifier.metrics if classifier else {}},
        class_counts=class_counts, total_patches=total_patches,
        confidence_stats=confidence_stats, tumor_regions=tumor_regions,
        embedding_model="path-foundation-v1",
    )


@router.get("/{job_id}/report")
async def get_inference_report(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return a structured AI-assisted pathology report as JSON."""
    return await _build_report_data(job_id, db)


@router.get("/{job_id}/export/report")
async def export_report_pdf(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Generate a professional AI-assisted pathology report as PDF."""
    from app.services.report_service import generate_report_pdf
    report = await _build_report_data(job_id, db)
    buf = generate_report_pdf(report)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=pathology_report_{job_id}.pdf"},
    )


@router.get("", response_model=list[InferenceJobOut])
async def list_inference_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InferenceJob).order_by(InferenceJob.created_at.desc()).limit(50)
    )
    return result.scalars().all()
