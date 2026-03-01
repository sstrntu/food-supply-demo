# Backend-only production image
# Uses pre-built artifacts from host (avoids network issues in build environment)

FROM node:20-slim
WORKDIR /app

# Copy pre-built backend
COPY backend/dist ./backend/dist
COPY backend/package*.json ./backend/
COPY backend/node_modules ./backend/node_modules

# Create database directory
RUN mkdir -p database

EXPOSE 3001

# Start backend API
CMD ["node", "/app/backend/dist/index.js"]
