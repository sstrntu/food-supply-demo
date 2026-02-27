#!/bin/bash

# Food Supply Voice AI - Unified Startup Script
# Usage: ./start.sh [dev|prod|docker]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Kill existing processes
cleanup() {
  log_info "Cleaning up existing processes..."
  pkill -f "node.*index.js" 2>/dev/null || true
  pkill -f "node.*server" 2>/dev/null || true
  fuser -k 3001/tcp 2>/dev/null || true
  fuser -k 8443/tcp 2>/dev/null || true
  sleep 2
}

# Check dependencies
check_dependencies() {
  local deps=("node" "npm")
  for dep in "${deps[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
      log_error "$dep is required but not installed"
      exit 1
    fi
  done
}

# Generate SSL certs if missing
ensure_ssl_certs() {
  if [ ! -f "$SCRIPT_DIR/key.pem" ] || [ ! -f "$SCRIPT_DIR/cert.pem" ]; then
    log_info "Generating self-signed SSL certificates..."
    openssl req -x509 -newkey rsa:4096 -keyout "$SCRIPT_DIR/key.pem" -out "$SCRIPT_DIR/cert.pem" -days 365 -nodes -subj '/CN=localhost'
    log_success "SSL certificates generated"
  fi
}

# Build backend
build_backend() {
  log_info "Building backend..."
  cd "$SCRIPT_DIR/backend"
  npm install
  npm run build
  log_success "Backend built"
}

# Build frontend
build_frontend() {
  log_info "Building frontend..."
  cd "$SCRIPT_DIR/frontend"
  npm install
  npm run build
  log_success "Frontend built"
}

# Start development mode
start_dev() {
  log_info "Starting in DEVELOPMENT mode..."
  cleanup
  check_dependencies

  # Start backend
  log_info "Starting backend..."
  cd "$SCRIPT_DIR/backend"
  npm install
  npm run dev &
  BACKEND_PID=$!

  # Start frontend (Vite with HTTPS)
  log_info "Starting frontend..."
  cd "$SCRIPT_DIR/frontend"
  npm install
  npm run dev &
  FRONTEND_PID=$!

  log_success "Development servers started!"
  log_info "Backend: http://localhost:3001"
  log_info "Frontend: https://localhost:5173"

  # Wait for processes
  wait $BACKEND_PID $FRONTEND_PID
}

# Start production mode
start_prod() {
  log_info "Starting in PRODUCTION mode..."
  cleanup
  check_dependencies
  ensure_ssl_certs

  # Build if needed
  if [ ! -d "$SCRIPT_DIR/backend/dist" ]; then
    build_backend
  fi

  if [ ! -d "$SCRIPT_DIR/frontend/dist/assets" ]; then
    build_frontend
  fi

  # Start backend (HTTP only, internal)
  log_info "Starting backend (HTTP, internal)..."
  cd "$SCRIPT_DIR/backend/dist"
  NODE_ENV=production node index.js &
  BACKEND_PID=$!

  sleep 3

  # Start frontend (HTTPS)
  log_info "Starting frontend (HTTPS)..."
  cd "$SCRIPT_DIR/frontend"
  API_URL=http://localhost:3001 node server-https.cjs &
  FRONTEND_PID=$!

  sleep 2

  log_success "Production servers started!"
  log_info "Access: https://localhost:8443"

  # Health check
  sleep 3
  log_info "Running health checks..."

  if curl -sk --max-time 5 https://localhost:8443/ > /dev/null 2>&1; then
    log_success "Frontend HTTPS is responding"
  else
    log_warn "Frontend may not be ready yet"
  fi

  if curl -s --max-time 5 http://localhost:3001/health > /dev/null 2>&1; then
    log_success "Backend API is responding"
  else
    log_warn "Backend API may not be ready yet"
  fi

  # Wait for processes
  wait $BACKEND_PID $FRONTEND_PID
}

# Start with Docker
start_docker() {
  log_info "Starting with Docker..."

  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
  fi

  if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed"
    exit 1
  fi

  ensure_ssl_certs

  # Build and start
  docker-compose down 2>/dev/null || true
  docker-compose build
  docker-compose up -d

  log_success "Docker containers started!"
  log_info "Access: https://localhost:8443"

  # Show logs
  sleep 3
  docker-compose ps
}

# Stop all
stop_all() {
  log_info "Stopping all services..."
  cleanup
  docker-compose down 2>/dev/null || true
  log_success "All services stopped"
}

# Show status
show_status() {
  log_info "Service Status:"
  echo ""

  # Check processes
  echo "Node Processes:"
  ps aux | grep -E "node.*(index|server)" | grep -v grep || echo "  No node processes running"
  echo ""

  # Check ports
  echo "Port Status:"
  for port in 3001 8443; do
    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
      echo "  Port $port: LISTENING"
    else
      echo "  Port $port: NOT LISTENING"
    fi
  done
  echo ""

  # Docker status
  if command -v docker-compose &> /dev/null; then
    echo "Docker Containers:"
    docker-compose ps 2>/dev/null || echo "  Docker not running"
  fi
}

# Main command handler
case "${1:-prod}" in
  dev)
    start_dev
    ;;
  prod)
    start_prod
    ;;
  docker)
    start_docker
    ;;
  build)
    build_backend
    build_frontend
    ;;
  stop)
    stop_all
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 [dev|prod|docker|build|stop|status]"
    echo ""
    echo "Commands:"
    echo "  dev     - Start in development mode (with hot reload)"
    echo "  prod    - Start in production mode (default)"
    echo "  docker  - Start using Docker Compose"
    echo "  build   - Build all components"
    echo "  stop    - Stop all services"
    echo "  status  - Show service status"
    exit 1
    ;;
esac
