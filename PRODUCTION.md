# Food Supply Voice AI - Production Setup

## Quick Start

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

2. **Start the server:**
   ```bash
   ./start-production.sh
   ```

## Architecture

- **HTTP Port 80**: General frontend access (serves static files, proxies API)
- **HTTPS Port 8443**: Secure frontend access (required for voice/microphone features)
- **Backend Port 3001**: API and WebSocket server

## Configuration

Key environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend API port | 3001 |
| `FRONTEND_PORT` | HTTP frontend port | 80 |
| `FRONTEND_HTTPS_PORT` | HTTPS frontend port | 8443 |
| `JWT_SECRET` | Secret for JWT tokens | (required) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | (optional) |
| `ELEVENLABS_AGENT_ID` | ElevenLabs agent ID | (set in .env) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (custom LLM + insights) | (required for AI responses) |
| `CORS_ORIGINS` | Allowed CORS origins | http://localhost |
| `DATABASE_PATH` | SQLite database path | ./database/food_supply.db |

## Docker Deployment

```bash
docker-compose up --build -d
```

## Manual Deployment

### Backend Only
```bash
cd backend
npm install
npm run build
NODE_ENV=production npm start
```

### Frontend Server
```bash
cd frontend/dist
npm install
API_URL=http://localhost:3001 node server-https.cjs
```

## SSL Certificates

The server looks for SSL certificates at:
- `./key.pem` (private key)
- `./cert.pem` (certificate)

For production, use proper certificates from Let's Encrypt or your provider.

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/login` - Authentication
- `GET /api/auth/verify` - Token verification
- `GET /api/products` - List products
- `GET /api/inventory` - Inventory data
- `GET /api/dashboard/stats` - Dashboard statistics
- `POST /api/voice-llm/v1/chat/completions` - OpenAI-compatible endpoint for ElevenLabs Custom LLM mode
- `WS /ws/voice` - WebSocket for voice AI

## Troubleshooting

### CORS Errors
Update `CORS_ORIGINS` in `.env` to include your frontend URL.

### Database Issues
Ensure the `database/` directory exists and is writable.

### SSL Errors
For development, the server will generate self-signed certificates.
For production, replace with valid certificates.
