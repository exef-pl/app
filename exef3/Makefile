# EXEF3 Makefile

.PHONY: help install up down restart logs clean test lint format shell

# Default target
help:
	@echo "EXEF3 - Document Flow Engine"
	@echo ""
	@echo "Available commands:"
	@echo "  make install      - Install dependencies for backend and frontend"
	@echo "  make up           - Start all services with docker-compose"
	@echo "  make down         - Stop all services"
	@echo "  make restart      - Restart all services"
	@echo "  make logs         - Show logs from all services"
	@echo "  make logs-backend - Show logs from backend only"
	@echo "  make logs-frontend- Show logs from frontend only"
	@echo "  make clean        - Remove containers, images, and volumes"
	@echo "  make test         - Run API tests"
	@echo "  make lint         - Run linting (backend only)"
	@echo "  make format       - Format code (backend only)"
	@echo "  make shell        - Open shell in backend container"
	@echo "  make db-init      - Initialize database"
	@echo "  make db-reset     - Reset database (WARNING: deletes all data)"
	@echo "  make build        - Build containers without starting"

# Install dependencies
install:
	@echo "Installing backend dependencies..."
	cd backend && python -m venv venv || true
	cd backend && source venv/bin/activate && pip install --upgrade pip
	cd backend && source venv/bin/activate && pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# Docker commands
up:
	@echo "Starting EXEF3 services..."
	docker-compose up -d
	@echo "Services started!"
	@echo "Backend: http://localhost:$(shell grep HOST_PORT .env | cut -d'=' -f2)"
	@echo "Frontend: http://localhost:$(shell grep FRONTEND_HOST_PORT .env | cut -d'=' -f2)"
	@echo "API Docs: http://localhost:$(shell grep HOST_PORT .env | cut -d'=' -f2)/docs"

down:
	@echo "Stopping EXEF3 services..."
	docker-compose down

restart:
	@echo "Restarting EXEF3 services..."
	docker-compose restart

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

clean:
	@echo "Cleaning up..."
	docker-compose down -v --rmi all --remove-orphans
	docker system prune -f

# Build without starting
build:
	docker-compose build

# Development commands
shell:
	docker-compose exec backend bash

test:
	python3 test_api.py

lint:
	cd backend && python -m flake8 app/ --max-line-length=100 --ignore=E203,W503 || true
	cd backend && python -m mypy app/ --ignore-missing-imports || true

format:
	cd backend && python -m black app/ --line-length=100
	cd backend && python -m isort app/ --profile black

# Database commands
db-init:
	@echo "Initializing database..."
	docker-compose exec backend python -c "from app.core.database import init_db; init_db()"

db-reset:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker-compose down -v
	docker-compose up -d
	sleep 5
	make db-init

# Development shortcuts
dev: install up
	@echo "Development environment ready!"

dev-backend:
	cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port $(shell grep HOST_PORT .env | cut -d'=' -f2)

dev-frontend:
	cd frontend && npm run dev

# Production commands
prod-build:
	docker-compose -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.prod.yml up -d

# Check ports
check-ports:
	@echo "Checking ports..."
	@netstat -tulpn | grep :$(shell grep HOST_PORT .env | cut -d'=' -f2) || echo "Backend port $(shell grep HOST_PORT .env | cut -d'=' -f2) is free"
	@netstat -tulpn | grep :$(shell grep FRONTEND_HOST_PORT .env | cut -d'=' -f2) || echo "Frontend port $(shell grep FRONTEND_HOST_PORT .env | cut -d'=' -f2) is free"
