from fastapi import APIRouter

from app.api import slides, embeddings, classifiers, inference, search, dashboard

api_router = APIRouter()

api_router.include_router(slides.router, prefix="/slides", tags=["slides"])
api_router.include_router(embeddings.router, prefix="/embeddings", tags=["embeddings"])
api_router.include_router(classifiers.router, prefix="/classifiers", tags=["classifiers"])
api_router.include_router(inference.router, prefix="/inference", tags=["inference"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
