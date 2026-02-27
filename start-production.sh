#!/bin/bash

# Food Supply Voice AI - Production Startup Script
# Usage: ./start-production.sh

set -e

echo "Starting Food Supply Voice AI Production Server..."

# Check for .env file
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "Created .env file. Please edit it with your actual values."
fi

# Check for SSL certificates
if [ ! -f key.pem ] || [ ! -f cert.pem ]; then
    echo "SSL certificates not found. Generating self-signed certificates..."
    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'
    echo "Self-signed certificates generated."
    echo "For production use, replace with proper SSL certificates."
fi

# Create database directory
mkdir -p database

# Load environment variables
export $(grep -v '^#' .env | xargs) 2>/dev/null || true

echo ""
echo "Configuration:"
echo "  - Backend API (internal): http://localhost:${PORT:-3001}"
echo "  - Frontend HTTPS: https://localhost:${FRONTEND_HTTPS_PORT:-8443}"
echo ""

# Check if we should use Docker
if command -v docker-compose &> /dev/null && [ -f docker-compose.yml ]; then
    echo "Using Docker Compose..."
    docker-compose up --build -d
    echo ""
    echo "Services started with Docker Compose!"
    echo "  Access: https://localhost:${FRONTEND_HTTPS_PORT:-8443}"
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
else
    echo "Running without Docker..."

    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo "Error: Node.js is not installed. Please install Node.js 20+ first."
        exit 1
    fi

    # Build backend if needed
    if [ ! -d backend/dist ] || [ backend/src/index.ts -nt backend/dist/index.js ]; then
        echo "Building backend..."
        cd backend
        npm install
        npm run build
        cd ..
    fi

    # Install frontend server dependencies if needed
    if [ ! -d frontend/node_modules ]; then
        echo "Installing frontend server dependencies..."
        cd frontend
        npm install
        cd ..
    fi

    # Start backend (HTTP only, internal)
    echo "Starting API server on port ${PORT:-3001} (HTTP, internal)..."
    cd backend
    NODE_ENV=production node dist/index.js &
    API_PID=$!
    cd ..

    # Start HTTPS frontend
    echo "Starting HTTPS frontend on port ${FRONTEND_HTTPS_PORT:-8443}..."
    cd frontend
    API_URL=http://localhost:${PORT:-3001} node server-https.cjs &
    FRONTEND_PID=$!
    cd ..

    echo ""
    echo "Services started!"
    echo "  Access: https://localhost:${FRONTEND_HTTPS_PORT:-8443}"
    echo ""
    echo "Press Ctrl+C to stop all services"

    # Wait for interrupt
    trap "kill $API_PID $FRONTEND_PID 2>/dev/null; exit" INT
    wait
fi
