#!/bin/bash
set -e

# Happy Server Deployment Script
# Usage: ./deploy.sh [--fresh]
#   --fresh: Force rebuild without cache

cd "$(dirname "$0")"

echo "=============================================="
echo "Happy Server Deployment"
echo "$(date)"
echo "=============================================="

# Pull latest code
echo "[1/5] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# Build options
BUILD_OPTS=""
if [ "$1" == "--fresh" ]; then
    echo "[2/5] Building fresh (no cache)..."
    BUILD_OPTS="--no-cache"
else
    echo "[2/5] Building with cache..."
fi

docker compose build $BUILD_OPTS happy-server

# Start/restart services
echo "[3/5] Starting database services..."
docker compose up -d db redis minio
sleep 5

echo "[4/5] Starting Happy server..."
docker compose up -d happy-server

echo "[5/5] Verifying deployment..."
sleep 3

# Health check
if curl -sf http://localhost:3005/health > /dev/null; then
    echo ""
    echo "=============================================="
    echo "SUCCESS: Happy server is healthy!"
    echo "=============================================="
    docker compose logs --tail=20 happy-server
else
    echo ""
    echo "=============================================="
    echo "WARNING: Health check failed. Showing logs..."
    echo "=============================================="
    docker compose logs --tail=50 happy-server
    exit 1
fi
