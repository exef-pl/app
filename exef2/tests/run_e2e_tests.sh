#!/bin/bash
# EXEF E2E Tests with Mock Services

set -e

echo "🚀 Starting EXEF E2E Tests with Mock Services..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    exit 1
fi

# Clean up any existing containers
echo -e "${YELLOW}🧹 Cleaning up existing containers...${NC}"
docker-compose -f docker-compose.yml --profile test down -v

# Build and start services
echo -e "${YELLOW}🏗️ Building services...${NC}"
docker-compose -f docker-compose.yml --profile test build

echo -e "${YELLOW}🚀 Starting mock services...${NC}"
docker-compose -f docker-compose.yml --profile test up -d mock-services

# Wait for mock services
echo -e "${YELLOW}⏳ Waiting for mock services to be ready...${NC}"
for i in {1..30}; do
    if curl -f http://localhost:8888/status > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Mock services are ready!${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Mock services failed to start!${NC}"
        docker-compose -f docker-compose.yml --profile test logs mock-services
        exit 1
    fi
done

# Start backend and frontend
echo -e "${YELLOW}🚀 Starting backend and frontend...${NC}"
docker-compose -f docker-compose.yml --profile test up -d backend frontend

# Wait for backend
echo -e "${YELLOW}⏳ Waiting for backend to be ready...${NC}"
for i in {1..30}; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is ready!${NC}"
        break
    fi
    sleep 2
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Backend failed to start!${NC}"
        docker-compose -f docker-compose.yml --profile test logs backend
        exit 1
    fi
done

# Wait for frontend
echo -e "${YELLOW}⏳ Waiting for frontend to be ready...${NC}"
for i in {1..30}; do
    if curl -f http://localhost:8002 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Frontend is ready!${NC}"
        break
    fi
    sleep 2
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Frontend failed to start!${NC}"
        docker-compose -f docker-compose.yml --profile test logs frontend
        exit 1
    fi
done

# Show mock services status
echo -e "${YELLOW}📊 Mock Services Status:${NC}"
curl -s http://localhost:8888/status | python3 -m json.tool

# Run tests
echo -e "${YELLOW}🧪 Running E2E tests...${NC}"
docker-compose -f docker-compose.yml --profile test up --abort-on-container-exit --exit-code-from tests tests

# Capture test results
TEST_RESULT=$?

# Show logs if tests failed
if [ $TEST_RESULT -ne 0 ]; then
    echo -e "${RED}❌ Tests failed! Showing logs...${NC}"
    echo -e "${YELLOW}--- Backend Logs ---${NC}"
    docker-compose -f docker-compose.yml --profile test logs --tail 50 backend
    echo -e "${YELLOW}--- Mock Services Logs ---${NC}"
    docker-compose -f docker-compose.yml --profile test logs --tail 50 mock-services
fi

# Cleanup
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
docker-compose -f docker-compose.yml --profile test down -v

# Report results
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo -e "${RED}❌ Tests failed!${NC}"
fi

exit $TEST_RESULT
