# Multi-stage build for production

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# Install dependencies for sqlite3
RUN apk add --no-cache python3 make g++

# Copy backend
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/package*.json ./backend/
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules

# Copy frontend build, node_modules and server
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY --from=frontend-build /app/frontend/node_modules ./frontend/node_modules
COPY frontend/server-https.cjs ./frontend/server-https.cjs

# Create database directory
RUN mkdir -p database

EXPOSE 8443

# Start both backend (HTTP) and frontend (HTTPS)
CMD ["sh", "-c", "cd /app/backend && node dist/index.js & cd /app/frontend && API_URL=http://localhost:3001 node server-https.cjs"]
