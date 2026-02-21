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

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy SSL certificates
COPY *.pem ./

# Create database directory
RUN mkdir -p database

WORKDIR /app/backend

EXPOSE 3001

CMD ["node", "dist/index.js"]