#!/bin/bash

# Food Supply Voice AI - Startup Script

cd ~/projects/food-supply-voice-ai

echo "Starting Food Supply Voice AI services..."

# Kill any existing processes
pkill -f "node.*index.js" 2>/dev/null
pkill -f "https_server.py" 2>/dev/null
fuser -k 3001/tcp 2>/dev/null
fuser -k 8443/tcp 2>/dev/null

sleep 2

# Start Backend
echo "Starting Backend (HTTPS on 3001)..."
cd ~/projects/food-supply-voice-ai/backend/dist
nohup node index.js > ~/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 5

# Start Frontend
echo "Starting Frontend (HTTPS on 8443)..."
cd ~/projects/food-supply-voice-ai/frontend/dist
nohup python3 ~/projects/food-supply-voice-ai/https_server.py > ~/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

sleep 3

echo ""
echo "Testing services..."
echo -n "Backend: "
curl -k -s --max-time 3 https://139.59.102.60:3001/health 2>&1 | head -1

echo -n "Frontend: "
curl -k -s --max-time 3 https://139.59.102.60:8443/ 2>&1 | head -1

echo ""
echo "Services started!"
echo "Backend: https://139.59.102.60:3001"
echo "Frontend: https://139.59.102.60:8443"