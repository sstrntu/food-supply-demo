#!/bin/bash

# Deploy Food Supply Voice AI to DigitalOcean Droplet

echo "🚀 Deploying Food Supply Voice AI..."

cd ~/projects/food-supply-voice-ai

# 1. Start PostgreSQL
echo "📦 Starting PostgreSQL..."
docker-compose up -d postgres
sleep 10

# 2. Setup Backend
echo "⚙️ Setting up backend..."
cd backend

# Install backend dependencies
npm install

# Initialize database
npm run db:init

# Seed with Asian grocery data
npm run seed

# Build backend for production
npm run build

# Start backend with PM2 or nohup
echo "🚀 Starting backend server..."
pkill -f "node dist/index.js" 2>/dev/null
nohup node dist/index.js > ../backend.log 2>&1 &

echo "✅ Backend running on http://localhost:3001"

cd ..

# 3. Build Frontend
echo "🎨 Building frontend..."
cd frontend

# Install dependencies (this may take a while)
npm install

# Build for production
npm run build

# Serve frontend with a simple HTTP server
echo "🌐 Starting frontend server..."
npx serve -s dist -l 5173 > ../frontend.log 2>&1 &

echo "✅ Frontend running on http://localhost:5173"

cd ..

echo ""
echo "🎉 Deployment complete!"
echo "📊 Dashboard: http://$(curl -s ifconfig.me):5173"
echo "🔑 Login: testuser / 123454321"
echo ""
echo "To check logs:"
echo "  Backend: tail -f ~/projects/food-supply-voice-ai/backend.log"
echo "  Frontend: tail -f ~/projects/food-supply-voice-ai/frontend.log"