.PHONY: up down test logs clean build

# Start application
up:
	docker-compose up -d --build
	@echo "App running at http://localhost:3000"

# Stop application
down:
	docker-compose down

# Run tests
test:
	docker-compose --profile test up --build --abort-on-container-exit tests

# View logs
logs:
	docker-compose logs -f

# Clean everything
clean:
	docker-compose down -v --rmi all
	docker system prune -f

# Build only
build:
	docker-compose build

# Backend logs only
logs-backend:
	docker-compose logs -f backend

# Shell into backend
shell:
	docker-compose exec backend sh

# API health check
health:
	curl -s http://localhost:3000/health | jq
