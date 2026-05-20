import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.classifier import Classifier
from app.models.patch_label import PatchLabel
from app.schemas.classifier import ClassifierCreate, ClassifierOut

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
