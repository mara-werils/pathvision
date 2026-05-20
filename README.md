# PathVision

Open-source computational pathology platform for whole slide image analysis, powered by Google Path Foundation embeddings and modern ML tooling.

---

## Key Features

- **WSI upload and automatic tiling** with tissue detection (supports SVS, TIFF, NDPI, MRXS formats)
- **Google Path Foundation embeddings** (384-dim ViT-S) generated on GPU
- **Linear probe classifier training** with ROC/AUC metrics and confusion matrix evaluation
- **Heatmap visualization** overlaid on whole slide images with confidence mapping
- **FAISS-based similar patch search** across 17K+ embedding vectors
- **Interactive demo** with real-time embedding visualization and similarity exploration
- **PDF/CSV export** of classification and inference results
- **Docker deployment** with dedicated GPU and CPU worker separation

---

## Architecture

```
                          +-------------------+
                          |    Frontend        |
                          |  (Next.js 14)      |
                          |  localhost:3000     |
                          +---------+----------+
                                    |
                                    | HTTP / REST
                                    v
                          +-------------------+
                          |    Backend         |
                          |  (FastAPI)         |
                          |  localhost:8000    |
                          +---------+----------+
                           /        |         \
                          /         |          \
                         v          v           v
              +-----------+  +------------+  +----------------+
              | PostgreSQL |  |   Redis    |  |  Celery Workers |
              |  (pg:16)   |  | (broker +  |  |                |
              |            |  |  backend)  |  | +------------+ |
              |  - slides  |  |            |  | | CPU worker | |
              |  - patches |  +------------+  | | (tiling,   | |
              |  - embeds  |                  | |  training)  | |
              |  - models  |                  | +------------+ |
              +-----------+                   | | GPU worker | |
                                              | | (embed,    | |
                                              | |  inference)| |
                                              | +------------+ |
                                              +----------------+
```

---

## Tech Stack

| Layer    | Technologies                                                     |
|----------|------------------------------------------------------------------|
| Backend  | FastAPI, SQLAlchemy (async), Celery, TensorFlow, OpenSlide       |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, OpenSeadragon    |
| ML       | Google Path Foundation (ViT-S/14), scikit-learn, FAISS           |
| Infra    | Docker Compose, PostgreSQL 16, Redis 7, NVIDIA GPU (CUDA)       |

---

## Screenshots

<!-- screenshot: dashboard -->
**Dashboard** -- system overview with slide, patch, and classifier statistics.

<!-- screenshot: slide-viewer -->
**Slide Viewer** -- browse extracted patches overlaid on the original WSI.

<!-- screenshot: classifier-metrics -->
**Classifier Metrics** -- ROC curve, confusion matrix, and per-class AUC after training.

<!-- screenshot: inference-heatmap -->
**Inference Heatmap** -- spatial prediction overlay with confidence mapping on the slide.

<!-- screenshot: demo-similarity -->
**Demo Page** -- similarity search with FAISS, showing nearest neighbor patches.

<!-- screenshot: api-docs -->
**API Documentation** -- interactive Swagger UI at `/api/docs`.

---

## Quick Start

```bash
git clone https://github.com/mara-werils/pathvision.git
cd pathvision
cp .env.example .env
docker compose up -d

# Run migrations
docker compose exec backend alembic upgrade head

# Open http://localhost:3000
```

Prerequisites:
- Docker and Docker Compose v2
- NVIDIA GPU with drivers installed (for embedding generation and inference)
- NVIDIA Container Toolkit (`nvidia-docker`)

---

## API Endpoints

### Slides

| Method   | Endpoint                                  | Description                        |
|----------|-------------------------------------------|------------------------------------|
| `POST`   | `/api/slides/upload`                      | Upload WSI file with auto-tiling   |
| `GET`    | `/api/slides`                             | List all slides                    |
| `GET`    | `/api/slides/{id}`                        | Get slide details                  |
| `GET`    | `/api/slides/{id}/patches`                | List patches (paginated)           |
| `GET`    | `/api/slides/{id}/patches/{pid}/image`    | Get patch image (PNG)              |
| `GET`    | `/api/slides/{id}/thumbnail`              | Get slide thumbnail                |
| `POST`   | `/api/slides/{id}/tile`                   | Trigger manual tiling              |
| `DELETE` | `/api/slides/{id}`                        | Delete slide and associated data   |

### Embeddings

| Method   | Endpoint                                  | Description                        |
|----------|-------------------------------------------|------------------------------------|
| `POST`   | `/api/embeddings/generate`                | Generate embeddings for a slide    |
| `GET`    | `/api/embeddings/status/{task_id}`        | Check embedding task progress      |
| `GET`    | `/api/embeddings/patch/{patch_id}`        | Get embedding vector for a patch   |
| `GET`    | `/api/embeddings/slide/{slide_id}/count`  | Count embeddings for a slide       |

### Classifiers

| Method   | Endpoint                                  | Description                        |
|----------|-------------------------------------------|------------------------------------|
| `POST`   | `/api/classifiers/train`                  | Train a new linear probe classifier|
| `POST`   | `/api/classifiers/labels/upload`          | Upload patch labels (CSV)          |
| `GET`    | `/api/classifiers`                        | List all classifiers               |
| `GET`    | `/api/classifiers/{id}`                   | Get classifier details and metrics |
| `DELETE` | `/api/classifiers/{id}`                   | Delete a classifier                |

### Inference

| Method   | Endpoint                                  | Description                        |
|----------|-------------------------------------------|------------------------------------|
| `POST`   | `/api/inference/run`                      | Run inference on a slide           |
| `GET`    | `/api/inference`                          | List recent inference jobs         |
| `GET`    | `/api/inference/{id}`                     | Get inference job status           |
| `GET`    | `/api/inference/{id}/predictions`         | Get patch-level predictions        |
| `GET`    | `/api/inference/{id}/heatmap`             | Get heatmap image (PNG)            |
| `GET`    | `/api/inference/{id}/heatmap/confidence`  | Get confidence map (PNG)           |

### Search

| Method   | Endpoint                                  | Description                        |
|----------|-------------------------------------------|------------------------------------|
| `POST`   | `/api/search/similar`                     | Find similar patches by patch ID   |
| `POST`   | `/api/search/similar/upload`              | Find similar patches by image      |
| `POST`   | `/api/search/index/rebuild`               | Rebuild FAISS index                |
| `GET`    | `/api/search/index/stats`                 | Get FAISS index statistics         |

### Dashboard

| Method   | Endpoint                                  | Description                        |
|----------|-------------------------------------------|------------------------------------|
| `GET`    | `/api/dashboard/stats`                    | System-wide statistics             |
| `GET`    | `/api/dashboard/recent`                   | Recent activity feed               |
| `GET`    | `/api/dashboard/health`                   | Health check (GPU, disk)           |

---

## Performance

| Metric                     | Value                              |
|----------------------------|------------------------------------|
| AUC (CAMELYON16)           | 0.8985 on real histopathology data |
| Patches per WSI            | 16,607 from a single slide         |
| Embedding throughput       | ~100 patches/sec on NVIDIA A10     |
| FAISS search latency       | <10ms for 17K vectors              |

---

## Market Context

Commercial digital pathology platforms such as PathAI, Paige, and Proscia typically require enterprise contracts ranging from $50K to $500K per year. PathVision provides a self-hosted, open-source alternative with comparable core functionality -- foundation model embeddings, classifier training, inference heatmaps, and similarity search -- at zero licensing cost.

---

## License

This project is licensed under the [MIT License](LICENSE).
