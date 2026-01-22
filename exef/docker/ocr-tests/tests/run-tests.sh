#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ExeF OCR REST Tests ==="
echo "Project dir: $PROJECT_DIR"

if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Docker is not running. Please start Docker and try again."
  exit 1
fi

wait_for_service() {
  local name=$2
  local max_attempts=30
  local attempt=1

  echo "Waiting for $name to be ready..."
  while [ $attempt -le $max_attempts ]; do
    if docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null | grep -q healthy; then
      echo "$name is ready!"
      return 0
    fi
    echo "  Attempt $attempt/$max_attempts - waiting..."
    sleep 2
    attempt=$((attempt + 1))
  done

  echo "ERROR: $name failed to start after $max_attempts attempts"
  return 1
}

cd "$PROJECT_DIR"

mkdir -p "$PROJECT_DIR/results"

echo ""
echo "Starting mock OCR + local service..."
docker-compose up -d mock-google-vision-api exef-local-service

echo ""
wait_for_service "" "exef-mock-google-vision"
wait_for_service "" "exef-ocr-local-service"

echo ""
echo "Running OCR tests in Docker..."
echo ""

docker-compose up --build --abort-on-container-exit --exit-code-from test-runner test-runner 2>&1 | tee "$PROJECT_DIR/results/test-output.log"

TEST_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== Test Results ==="
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "All tests passed!"
else
  echo "Some tests failed. Exit code: $TEST_EXIT_CODE"
fi

if [ "$1" != "--keep" ]; then
  echo ""
  echo "Stopping services..."
  docker-compose down
fi

exit $TEST_EXIT_CODE
