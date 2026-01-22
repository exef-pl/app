#!/bin/bash

# Storage Sync Tests Runner
# This script runs the storage synchronization tests against Docker mock services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ExeF Storage Sync Tests ==="
echo "Project dir: $PROJECT_DIR"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Function to wait for service health
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1

    echo "Waiting for $name to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
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

# Start services
echo ""
echo "Starting mock storage services..."
cd "$PROJECT_DIR"

docker-compose up -d --build mock-dropbox-api mock-gdrive-api mock-onedrive-api mock-nextcloud-api

# Wait for services to be healthy
echo ""
wait_for_service "http://localhost:8091/health" "Dropbox Mock API"
wait_for_service "http://localhost:8092/health" "Google Drive Mock API"
wait_for_service "http://localhost:8093/health" "OneDrive Mock API"
wait_for_service "http://localhost:8094/health" "Nextcloud Mock API"

# Run tests
echo ""
echo "Running storage sync tests..."
echo ""

export DROPBOX_API_URL=http://localhost:8091
export GDRIVE_API_URL=http://localhost:8092
export ONEDRIVE_API_URL=http://localhost:8093
export NEXTCLOUD_API_URL=http://localhost:8094
export NODE_ENV=test

# Run tests using Node.js test runner
node --test "$SCRIPT_DIR/storage-sync.test.js" 2>&1 | tee "$PROJECT_DIR/results/test-output.log"

TEST_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== Test Results ==="
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "All tests passed!"
else
    echo "Some tests failed. Exit code: $TEST_EXIT_CODE"
fi

# Cleanup option
if [ "$1" != "--keep" ]; then
    echo ""
    echo "Stopping mock services..."
    docker-compose down
fi

exit $TEST_EXIT_CODE
