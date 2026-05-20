"""Train sklearn linear probe classifiers on Path Foundation embeddings."""

from __future__ import annotations

import logging

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)


class ClassifierService:
    def train(
        self,
        embeddings: np.ndarray,
        labels: np.ndarray,
        class_names: list[str],
        save_path: str,
    ) -> dict:
        """Train a linear probe and return metrics.

        Args:
            embeddings: (n, 384) float32
            labels: (n,) int (class indices)
            class_names: e.g. ["normal", "tumor"]
            save_path: path to save .joblib
        """
        n_classes = len(class_names)

        clf = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "logreg",
                    LogisticRegression(
                        solver="lbfgs",
                        max_iter=1000,
                        class_weight="balanced",
                        C=1.0,
                        multi_class="multinomial" if n_classes > 2 else "auto",
                    ),
                ),
            ]
        )

        # Cross-validated predictions for honest metrics
        n_splits = min(5, min(np.bincount(labels)))
        n_splits = max(2, n_splits)
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

        y_proba = cross_val_predict(
            clf, embeddings, labels, cv=cv, method="predict_proba"
        )
        y_pred = np.argmax(y_proba, axis=1)

        # Metrics
        metrics: dict = {}

        if n_classes == 2:
            metrics["auc"] = round(roc_auc_score(labels, y_proba[:, 1]), 4)
            fpr, tpr, _ = roc_curve(labels, y_proba[:, 1])
            metrics["roc_data"] = {
                "fpr": [round(float(v), 4) for v in fpr],
                "tpr": [round(float(v), 4) for v in tpr],
            }
        else:
            try:
                metrics["auc"] = round(
                    roc_auc_score(labels, y_proba, multi_class="ovr", average="macro"),
                    4,
                )
            except ValueError:
                metrics["auc"] = None
            metrics["roc_data"] = {}

        cm = confusion_matrix(labels, y_pred).tolist()
        report = classification_report(
            labels, y_pred, target_names=class_names, output_dict=True
        )

        metrics["confusion_matrix"] = cm
        metrics["classification_report"] = report
        metrics["n_samples"] = int(len(labels))
        metrics["class_distribution"] = {
            name: int(count)
            for name, count in zip(class_names, np.bincount(labels, minlength=n_classes))
        }

        # Train final model on ALL data
        clf.fit(embeddings, labels)
        joblib.dump(clf, save_path)
        logger.info(
            "Classifier saved to %s — AUC: %s, samples: %d",
            save_path,
            metrics.get("auc"),
            len(labels),
        )

        return metrics

    def predict(
        self, classifier_path: str, embeddings: np.ndarray
    ) -> dict:
        clf = joblib.load(classifier_path)
        predictions = clf.predict(embeddings)
        probabilities = clf.predict_proba(embeddings)
        return {
            "predictions": predictions.tolist(),
            "probabilities": probabilities.tolist(),
        }
