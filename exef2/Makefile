.PHONY: up down test logs clean build migrate release

# ==================
# Development
# ==================

# Start application
up:
	docker-compose up -d --build
	@echo "App running at http://localhost:8002"

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

# Run E2E tests with mock services
test-e2e:
	@echo "Running E2E tests with mock services..."
	@cd tests && ./run_e2e_tests.sh

# Run API tests only
test-api:
	docker-compose exec backend pytest -v

# Run signature tests
test-signature:
	docker-compose exec backend pytest tests/test_signature.py -v

# Run complete E2E tests
test-complete:
	docker-compose --profile test up --build --abort-on-container-exit tests

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
	@curl -s http://localhost:8002/health | python -m json.tool

# Stats
stats:
	@curl -s http://localhost:8002/api/stats | python -m json.tool

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
	@echo "  make test-e2e    - Run E2E tests with mock services"
	@echo "  make test-api    - Run API tests only"
	@echo "  make test-signature - Run signature tests"
	@echo "  make test-complete - Run complete E2E tests"
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
