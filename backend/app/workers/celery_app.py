from celery import Celery

from app.config import settings

celery = Celery(
    "pathvision",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_routes={
        "app.workers.tile_worker.*": {"queue": "cpu"},
        "app.workers.train_worker.*": {"queue": "cpu"},
        "app.workers.embed_worker.*": {"queue": "gpu"},
        "app.workers.inference_worker.*": {"queue": "gpu"},
    },
)

celery.autodiscover_tasks([
    "app.workers.tile_worker",
    "app.workers.embed_worker",
    "app.workers.train_worker",
    "app.workers.inference_worker",
])
