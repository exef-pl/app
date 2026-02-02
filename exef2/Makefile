.PHONY: up down test logs clean build migrate release

# ==================
# Development
# ==================

# Start application
up:
	docker-compose up -d --build
	@echo "App running at http://localhost:3000"

# Stop application
down:
	docker-compose down

# Restart
restart: down up

# View logs
logs:
	docker-compose logs -f

# Backend logs only
logs-backend:
	docker-compose logs -f backend

# Shell into backend
shell:
	docker-compose exec backend sh

# ==================
# Testing
# ==================

# Run all tests
test:
	docker-compose --profile test up --build --abort-on-container-exit tests

# Run API tests only
test-api:
	docker-compose exec backend pytest -v

# Lint code
lint:
	docker-compose exec backend ruff check .

# ==================
# Database
# ==================

# Run migrations
migrate:
	docker-compose exec backend python migrations.py upgrade

# Migration status
migrate-status:
	docker-compose exec backend python migrations.py status

# Rollback migration
migrate-down:
	docker-compose exec backend python migrations.py downgrade

# Backup database
backup:
	@mkdir -p backups
	docker-compose exec backend cp /data/exef.db /data/exef_backup.db
	docker cp $$(docker-compose ps -q backend):/data/exef_backup.db backups/exef_$$(date +%Y%m%d_%H%M%S).db
	@echo "Backup saved to backups/"

# ==================
# Build & Release
# ==================

# Build images
build:
	docker-compose build

# Build for production (no cache)
build-prod:
	docker-compose build --no-cache

# Tag release
release:
	@read -p "Version (e.g., 1.1.0): " VERSION; \
	git tag -a v$$VERSION -m "Release v$$VERSION"; \
	echo "Tagged v$$VERSION. Run 'git push origin v$$VERSION' to trigger release."

# ==================
# Deployment
# ==================

# Deploy to staging
deploy-staging:
	@echo "Deploying to staging..."
	# kubectl apply -f k8s/staging/

# Deploy to production
deploy-prod:
	@echo "Deploying to production..."
	# kubectl apply -f k8s/prod/

# ==================
# Utilities
# ==================

# Health check
health:
	@curl -s http://localhost:3000/health | python -m json.tool

# Stats
stats:
	@curl -s http://localhost:3000/api/stats | python -m json.tool

# Clean everything
clean:
	docker-compose down -v --rmi all
	docker system prune -f

# Clean database
clean-db:
	docker-compose exec backend rm -f /data/exef.db
	@echo "Database cleared. Run 'make migrate' to recreate."

# Generate docs
docs:
	docker-compose exec backend python -c "from main import app; import json; print(json.dumps(app.openapi(), indent=2))" > docs/openapi.json

# ==================
# Help
# ==================

help:
	@echo "EXEF Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make up          - Start application"
	@echo "  make down        - Stop application"
	@echo "  make logs        - View logs"
	@echo "  make shell       - Shell into backend"
	@echo ""
	@echo "Testing:"
	@echo "  make test        - Run all tests"
	@echo "  make lint        - Lint code"
	@echo ""
	@echo "Database:"
	@echo "  make migrate     - Run migrations"
	@echo "  make backup      - Backup database"
	@echo ""
	@echo "Release:"
	@echo "  make build       - Build images"
	@echo "  make release     - Tag new release"
	@echo ""
	@echo "Utilities:"
	@echo "  make health      - Check health"
	@echo "  make stats       - Show stats"
	@echo "  make clean       - Clean everything"
