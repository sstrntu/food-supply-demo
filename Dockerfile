# Backend-only production image

# Stage 1: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS production
WORKDIR /app

# Install dependencies for sqlite3
RUN apk add --no-cache python3 make g++

# Copy backend
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/package*.json ./backend/
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules

# Create database directory
RUN mkdir -p database

EXPOSE 3001

# Start backend API
CMD ["sh", "-c", "cd /app/backend && node dist/index.js"]
