#!/bin/bash

# Food Supply Voice AI - Production Startup Script
# HTTPS on port 8443 (single entry point), Backend API on port 3001 (internal)

cd "$(dirname "$0")"

echo "=========================================="
echo "Food Supply Voice AI - Starting Services"
echo "=========================================="

# Kill any existing processes
pkill -f "node.*index.js" 2>/dev/null
pkill -f "node.*server" 2>/dev/null
fuser -k 3001/tcp 2>/dev/null
fuser -k 8443/tcp 2>/dev/null

sleep 2

# Generate SSL certs if missing
if [ ! -f key.pem ] || [ ! -f cert.pem ]; then
    echo "Generating self-signed SSL certificates..."
    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'
fi

# Start Backend (HTTP only, internal)
echo ""
echo "Starting Backend API (port 3001, HTTP internal)..."
cd backend/dist
NODE_ENV=production \
PORT=3001 \
DATABASE_PATH=./database/food_supply.db \
nohup node index.js > ../../backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
cd ../..

sleep 3

# Start Frontend (HTTPS)
echo ""
echo "Starting Frontend Server (HTTPS:8443)..."
cd frontend
API_URL=http://localhost:3001 \
nohup node server-https.cjs > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
cd ..

sleep 3

echo ""
echo "=========================================="
echo "Services Started!"
echo "=========================================="
echo ""
echo "Health Check:"
echo -n "Backend API:  "
curl -s --max-time 3 http://localhost:3001/health 2>&1 | head -1 || echo "Not ready yet"

echo ""
echo "Access URL:"
echo "  https://localhost:8443"
echo ""
echo "Logs:"
echo "  Backend:  tail -f backend.log"
echo "  Frontend: tail -f frontend.log"
echo ""
