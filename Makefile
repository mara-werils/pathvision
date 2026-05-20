.PHONY: up down dev logs migrate seed test

# Start all services
up:
	docker compose up -d

# Stop all services
down:
	docker compose down

# Start with logs
dev:
	docker compose up

# View logs
logs:
	docker compose logs -f

# Run alembic migration (auto-generate from models)
migrate:
	cd backend && alembic revision --autogenerate -m "$(msg)" && alembic upgrade head

# Run seed script
seed:
	python scripts/seed_camelyon.py

# Backend shell
shell:
	docker compose exec backend python

# Rebuild backend
rebuild:
	docker compose build backend celery-cpu
	docker compose up -d backend celery-cpu

# Rebuild GPU worker
rebuild-gpu:
	docker compose build celery-gpu
	docker compose up -d celery-gpu
