# Deployment Guide — Digital Ocean Droplet

Deploy the Food Supply Voice AI app on a Digital Ocean droplet via Docker.

**Live URL:** https://139.59.102.60:8443/

## Prerequisites

- **Droplet OS:** Ubuntu 24.04
- **Node.js:** v22+ (for local builds)
- **Docker:** v28+
- **docker-compose:** v1.29+

Install Docker and docker-compose if not already present:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose
sudo systemctl enable docker && sudo systemctl start docker
```

Install Node.js:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 1. Clone the Repository

```bash
git clone git@github.com:sstrntu/food-supply-demo.git ~/projects/food-supply-voice-ai
cd ~/projects/food-supply-voice-ai
```

## 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and set the required values:

| Variable | Description | Required |
|---|---|---|
| `JWT_SECRET` | Secret key for JWT auth — use a strong random string | Yes |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for voice features | Yes |
| `ELEVENLABS_AGENT_ID` | ElevenLabs agent ID (default provided) | No |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (AI insights + ElevenLabs custom LLM endpoint) | Yes |
| `CORS_ORIGINS` | Allowed CORS origins (e.g. `https://139.59.102.60:8443`) | Yes |

## 3. Generate SSL Certificates

The app serves over HTTPS on port 8443. Generate a self-signed certificate (or use your own):

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=139.59.102.60"
```

This creates `key.pem` and `cert.pem` in the project root, which are mounted into the frontend container.

## 4. Build Host Artifacts

The Docker images use pre-built artifacts from the host (avoids network/memory issues during Docker build). You must build both frontend and backend before running `docker-compose build`.

```bash
# Install dependencies and build backend
cd backend && npm install && npm run build && cd ..

# Install dependencies and build frontend
cd frontend && npm install && npm run build && cd ..
```

## 5. Build and Start Docker Containers

```bash
docker-compose build --no-cache
docker-compose up -d
```

This starts two containers:

| Container | Role | Port |
|---|---|---|
| `food-supply-api` | Backend API (Node.js/Express) | 3001 (host network) |
| `food-supply-frontend` | Frontend HTTPS server (Vite build + Node server) | 8443 (host network, public) |

## 6. Verify Deployment

```bash
# Check containers are running
docker ps

# Check backend logs
docker logs food-supply-api

# Check frontend logs
docker logs food-supply-frontend
```

Expected output:
- Backend: `Server running on port 3001`
- Frontend: `HTTPS Server running on https://0.0.0.0:8443`

Visit https://139.59.102.60:8443/ in your browser (accept the self-signed certificate warning).

## Updating to Latest Code

```bash
cd ~/projects/food-supply-voice-ai

# Pull latest code
git pull origin master

# Rebuild artifacts
cd backend && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..

# Rebuild and restart containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Useful Commands

```bash
# View live logs
docker logs -f food-supply-api
docker logs -f food-supply-frontend

# Restart containers without rebuilding
docker-compose restart

# Stop everything
docker-compose down

# Reset database (remove persisted data)
rm -rf database/food_supply.db
docker-compose down && docker-compose up -d
```

## Architecture

```
Browser (HTTPS :8443)
  └─► food-supply-frontend (Node HTTPS server)
        ├── Serves static Vite build (React SPA)
        └── Proxies /api/* and /auth/* ──► food-supply-api (:3001)
                                              └── SQLite database (./database/)
```

Both containers use `network_mode: host`, sharing the host's network namespace directly. This avoids a DigitalOcean droplet iptables rule that intercepts outbound port 443 traffic from Docker bridge networks (which would break the Anthropic API calls). Port 8443 is the only public-facing port.
