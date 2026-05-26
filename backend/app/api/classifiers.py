import csv
import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.classifier import Classifier
from app.models.patch import Patch
from app.models.patch_label import PatchLabel
from app.schemas.classifier import ActiveLearningRequest, ClassifierCreate, ClassifierOut

router = APIRouter()


@router.post("/train", response_model=ClassifierOut)
async def train_classifier(
    req: ClassifierCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a classifier and start training from existing labeled patches."""
    if len(req.class_names) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 classes")

    clf = Classifier(
        name=req.name,
        description=req.description,
        class_names=req.class_names,
        n_classes=len(req.class_names),
        label_source=req.label_source,
        status="training",
    )
    db.add(clf)
    await db.commit()
    await db.refresh(clf)

    from app.workers.train_worker import train_classifier as train_task

    train_task.delay(str(clf.id))
    return clf


@router.post("/labels/upload")
async def upload_labels(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload CSV with columns: patch_id, label."""
    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    count = 0
    for row in reader:
        patch_id = row.get("patch_id", "").strip()
        label = row.get("label", "").strip()
        if not patch_id or not label:
            continue
        try:
            pid = uuid.UUID(patch_id)
        except ValueError:
            continue

        existing = await db.execute(
            select(PatchLabel).where(
                PatchLabel.patch_id == pid, PatchLabel.label == label
            )
        )
        if existing.scalar_one_or_none():
            continue

        db.add(PatchLabel(patch_id=pid, label=label, label_source="csv_upload"))
        count += 1

    await db.commit()
    return {"labels_added": count}


@router.get("", response_model=list[ClassifierOut])
async def list_classifiers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Classifier).order_by(Classifier.created_at.desc()))
    return result.scalars().all()


@router.get("/{classifier_id}", response_model=ClassifierOut)
async def get_classifier(classifier_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    clf = await db.get(Classifier, classifier_id)
    if not clf:
        raise HTTPException(status_code=404, detail="Classifier not found")
    return clf


@router.delete("/{classifier_id}")
async def delete_classifier(classifier_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    clf = await db.get(Classifier, classifier_id)
    if not clf:
        raise HTTPException(status_code=404, detail="Classifier not found")
    await db.delete(clf)
    await db.commit()
    return {"status": "deleted"}


@router.get("/{classifier_id}/export/model")
async def export_model(classifier_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Download the trained .joblib model file."""
    clf = await db.get(Classifier, classifier_id)
    if not clf:
        raise HTTPException(status_code=404, detail="Classifier not found")
    if not clf.model_path:
        raise HTTPException(status_code=404, detail="Model file not available")

    model_path = Path(clf.model_path)
    if not model_path.exists():
        # Try Docker path mapping
        import os
        if "/pathvision/data/" in clf.model_path:
            alt = Path("/data/" + clf.model_path.split("/pathvision/data/", 1)[1])
            if alt.exists():
                model_path = alt
        elif clf.model_path.startswith("/data/"):
            data_dir = os.environ.get("DATA_DIR", "/data")
            alt = Path(data_dir) / clf.model_path[len("/data/"):]
            if alt.exists():
                model_path = alt

    if not model_path.exists():
        raise HTTPException(status_code=404, detail="Model file not found on disk")

    return FileResponse(
        str(model_path),
        media_type="application/octet-stream",
        filename=f"{clf.name}.joblib",
    )


@router.post("/{classifier_id}/active-learning")
async def suggest_uncertain_patches(
    classifier_id: uuid.UUID,
    req: ActiveLearningRequest,
    db: AsyncSession = Depends(get_db),
):
    """Return the most uncertain patches for active learning."""
    clf = await db.get(Classifier, classifier_id)
    if not clf or clf.status != "ready":
        raise HTTPException(status_code=404, detail="Classifier not ready")
    if not clf.model_path:
        raise HTTPException(status_code=404, detail="Model file not found")

    import joblib
    import numpy as np
    model = joblib.load(clf.model_path)

    # Get all embeddings for the slide
    from app.models.embedding import Embedding
    result = await db.execute(
        select(Embedding.patch_id, Embedding.vector)
        .where(Embedding.slide_id == req.slide_id)
    )
    embed_rows = result.all()
    if not embed_rows:
        return []

    # Get already labeled patch IDs to exclude
    labeled_result = await db.execute(
        select(PatchLabel.patch_id)
        .join(Patch, PatchLabel.patch_id == Patch.id)
        .where(Patch.slide_id == req.slide_id)
    )
    labeled_ids = {row.patch_id for row in labeled_result.all()}

    # Filter to unlabeled only
    unlabeled = [(r.patch_id, r.vector) for r in embed_rows if r.patch_id not in labeled_ids]
    if not unlabeled:
        return []

    patch_ids = [u[0] for u in unlabeled]
    vectors = np.array([u[1] for u in unlabeled])

    # Predict probabilities
    probs = model.predict_proba(vectors)
    max_probs = probs.max(axis=1)

    # Sort by uncertainty (lowest max_prob = most uncertain)
    indices = np.argsort(max_probs)[:req.top_n]

    # Get patch coordinates
    selected_ids = [patch_ids[i] for i in indices]
    coord_result = await db.execute(
        select(Patch.id, Patch.x, Patch.y).where(Patch.id.in_(selected_ids))
    )
    coord_map = {r.id: (r.x, r.y) for r in coord_result.all()}

    class_names = clf.class_names or [str(i) for i in range(probs.shape[1])]
    result_list = []
    for i in indices:
        pid = patch_ids[i]
        if pid in coord_map:
            x, y = coord_map[pid]
            pred_class = int(probs[i].argmax())
            result_list.append({
                "patch_id": str(pid),
                "x": x,
                "y": y,
                "max_probability": float(max_probs[i]),
                "predicted_label": class_names[pred_class],
            })

    return result_list
