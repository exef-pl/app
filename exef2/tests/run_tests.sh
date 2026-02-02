#!/bin/bash

# EXEF E2E Test Runner
# Usage: ./run_tests.sh [test_type]
# test_type can be: all, api, gui, views

set -e

echo "🚀 EXEF E2E Test Runner"
echo "========================"

# Default to GUI tests if no argument provided
TEST_TYPE=${1:-gui}

# Build and start services if not running
if ! docker compose ps | grep -q "Up"; then
    echo "📦 Starting services..."
    docker compose up -d
    echo "⏳ Waiting for services to be ready..."
    sleep 10
fi

# Check if services are healthy
echo "🔍 Checking service health..."
while ! docker compose ps backend | grep -q "healthy"; do
    echo "   Waiting for backend to be healthy..."
    sleep 2
done

echo "✅ Services are ready!"
echo ""

case $TEST_TYPE in
    "all")
        echo "🧪 Running ALL tests..."
        docker compose run --rm tests pytest test_e2e.py test_all_views_gui.py -v
        ;;
    "api")
        echo "🔌 Running API tests..."
        docker compose run --rm tests pytest test_e2e.py::TestProfileAPI -v
        docker compose run --rm tests pytest test_e2e.py::TestDocumentAPI -v
        ;;
    "gui")
        echo "🖥️  Running GUI tests for all views..."
        docker compose run --rm tests pytest test_all_views_gui.py -v
        ;;
    "views")
        echo "👁️  Running view-specific tests..."
        docker compose run --rm tests pytest test_all_views_gui.py::TestAllViewsGUI -v
        ;;
    "features")
        echo "⚙️  Running feature-specific tests..."
        docker compose run --rm tests pytest test_all_views_gui.py::TestViewSpecificFeatures -v
        ;;
    "errors")
        echo "❌ Running error handling tests..."
        docker compose run --rm tests pytest test_all_views_gui.py::TestErrorHandling -v
        ;;
    *)
        echo "❌ Unknown test type: $TEST_TYPE"
        echo "Usage: $0 [all|api|gui|views|features|errors]"
        exit 1
        ;;
esac

echo ""
echo "✅ Tests completed!"
echo ""
echo "📊 To view test coverage and results:"
echo "   docker compose logs tests"
