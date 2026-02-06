# DOC Document ID Generator Makefile

SHELL := /bin/bash

.PHONY: help install install-dev install-all test test-coverage lint format clean run-demo run-complete-demo build upload publish

# Default target
help:
	@echo "DOC Document ID Generator - Available commands:"
	@echo ""
	@echo "  install          Install basic dependencies"
	@echo "  install-dev      Install with dev dependencies"
	@echo "  install-all      Install with all OCR engines"
	@echo "  test             Run tests"
	@echo "  test-coverage    Run tests with coverage"
	@echo "  lint             Run linting (ruff, mypy)"
	@echo "  format           Format code (black, ruff)"
	@echo "  clean            Clean cache files"
	@echo "  run-demo         Run basic demo"
	@echo "  run-complete-demo Run complete demo"
	@echo "  build            Build package"
	@echo "  upload           Upload to PyPI (requires twine)"
	@echo "  publish          Alias for 'upload' - build and publish to PyPI"
	@echo ""
	@echo "Quick start:"
	@echo "  make install-dev"
	@echo "  make test"
	@echo "  make run-demo"

# Installation
install:
	python3 -m venv venv
	source venv/bin/activate && pip install -e .

install-dev:
	python3 -m venv venv
	source venv/bin/activate && pip install -e ".[dev]"

install-all:
	python3 -m venv venv
	source venv/bin/activate && pip install -e ".[all]"

# Testing
test:
	source venv/bin/activate && pytest

test-coverage:
	source venv/bin/activate && pytest --cov=docid --cov-report=html --cov-report=term

# Code quality
lint:
	source venv/bin/activate && ruff check docid tests examples
	source venv/bin/activate && mypy docid

format:
	source venv/bin/activate && black docid tests examples
	source venv/bin/activate && ruff format docid tests examples

# Cleanup
clean:
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf .pytest_cache/
	rm -rf .coverage
	rm -rf htmlcov/
	rm -rf .mypy_cache/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

# Demos
run-demo:
	source venv/bin/activate && python examples/demo.py

run-complete-demo:
	source venv/bin/activate && python examples/complete_demo.py

# Sample tests
test-samples:
	source venv/bin/activate && python test_final_consistency.py

test-samples-mock:
	source venv/bin/activate && python test_samples_mock_ocr.py

test-samples-improved:
	source venv/bin/activate && python test_samples_improved.py

# All formats tests
test-all-formats:
	source venv/bin/activate && python test_all_formats_consistency.py

test-formats-basic:
	source venv/bin/activate && python test_all_formats.py

test-complete-formats:
	source venv/bin/activate && python test_all_complete_formats.py

# Generate samples
generate-samples:
	source venv/bin/activate && python generate_samples.py

generate-image-samples:
	source venv/bin/activate && python generate_image_samples.py

generate-universal-samples:
	source venv/bin/activate && python generate_universal_samples.py

# Universal document tests
test-universal:
	source venv/bin/activate && python test_universal_documents.py

test-cli:
	source venv/bin/activate && python test_cli.py

# Web Service
run-web:
	source venv/bin/activate && python examples/web_service.py

# Quality Tests
test-quality:
	source venv/bin/activate && python examples/quality_test.py $(FILE) --all

# Package management
bump:
	@current_version=$$(cat VERSION); \
	major=$$(echo $$current_version | cut -d. -f1); \
	minor=$$(echo $$current_version | cut -d. -f2); \
	patch=$$(echo $$current_version | cut -d. -f3); \
	new_patch=$$((patch + 1)); \
	new_version="$${major}.$${minor}.$${new_patch}"; \
	echo "$$new_version" > VERSION; \
	sed -i "s/version = \"$$current_version\"/version = \"$$new_version\"/" pyproject.toml; \
	echo "Version bumped: $$current_version -> $$new_version"

build:
	source venv/bin/activate && ./venv/bin/python -m build

upload: build
	source venv/bin/activate && ./venv/bin/python -m twine upload dist/*

# Publish: bump version, clean, build and upload
publish: bump clean build upload
	@echo "Package published successfully!"

# Development helpers
check: lint test
	@echo "All checks passed!"

dev-setup: install-dev
	@echo "Development environment ready!"
	@echo "Run 'source venv/bin/activate' to activate the virtual environment"
