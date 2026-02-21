# 🎙️ Food Supply Inventory Voice AI - POC

Asian grocery food supply inventory system with voice-enabled AI assistant for sales agents.

## ✨ Features

- **🎤 Voice Interface** - Ask about inventory using natural speech (ElevenLabs ready)
- **📊 Dashboard** - View stats, low stock alerts, and recent activity
- **🔍 Smart Search** - Find products by name, category, or SKU
- **📦 Inventory Management** - Track stock across multiple warehouses
- **🔐 Simple Auth** - Login with test credentials

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + Express + WebSocket |
| Database | PostgreSQL |
| Voice AI | ElevenLabs Conversational AI (ready to configure) |
| Auth | JWT |

## 🚀 Quick Start

### 1. Clone & Setup

```bash
cd ~/projects/food-supply-voice-ai

# Copy environment variables
cp .env.example .env

# Edit .env with your settings (optional for POC)
nano .env
```

### 2. Start Database (Docker)

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for database to be ready (10 seconds)
sleep 10
```

### 3. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Initialize database schema
npm run db:init

# Seed with Asian grocery data (50+ products)
npm run seed

# Start development server
npm run dev
```

Backend runs on `http://localhost:3001`

### 4. Setup Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs on `http://localhost:5173`

## 🔑 Login Credentials

- **Username:** `testuser`
- **Password:** `123454321`

## 🗣️ Voice Commands

The AI understands natural language queries like:

- *"How many jasmine rice do we have?"*
- *"What's low on stock?"*
- *"Find all frozen foods"*
- *"Show me snacks inventory"*
- *"Search for soy sauce"*

## 📁 Project Structure

```
food-supply-voice-ai/
├── backend/              # Node.js API
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── db.ts        # Database connection
│   │   ├── index.ts     # Server + WebSocket
│   │   ├── seed.ts      # Asian grocery dummy data
│   │   └── init-db.ts   # Database initialization
│   └── package.json
├── frontend/            # React app
│   ├── src/
│   │   ├── pages/       # Login, Dashboard, Voice
│   │   ├── components/  # Layout, UI components
│   │   └── contexts/    # Auth context
│   └── package.json
├── database/
│   └── init.sql         # Database schema
├── docker-compose.yml   # PostgreSQL setup
└── .env.example         # Environment template
```

## 🥡 Asian Grocery Database

The POC includes 50+ authentic Asian grocery items:

- **Rice & Noodles:** Jasmine rice, Sushi rice, Ramen, Udon, Soba
- **Sauces:** Soy sauce, Fish sauce, Gochujang, Sriracha, Oyster sauce
- **Frozen Foods:** Dumplings, Spring rolls, Edamame, Gyoza
- **Snacks:** Pocky, Seaweed snacks, Rice crackers
- **Beverages:** Thai tea, Bubble tea supplies, Ramune
- **Spices:** Miso paste, Curry cubes, Sesame oil, Nori
- **Canned Goods:** Coconut milk, Bamboo shoots, Water chestnuts

## 🔌 ElevenLabs Integration (Optional)

To enable voice AI:

1. Get API key from [elevenlabs.io](https://elevenlabs.io)
2. Add to `.env`:
   ```
   ELEVENLABS_API_KEY=your-api-key
   ELEVENLABS_AGENT_ID=your-agent-id
   ```
3. Restart backend

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Login with credentials |
| `GET /api/dashboard/stats` | Dashboard statistics |
| `GET /api/dashboard/alerts` | Low stock alerts |
| `GET /api/inventory` | All inventory |
| `GET /api/inventory/low-stock` | Items needing reorder |
| `GET /api/products` | All products |
| `GET /api/products/category/:cat` | Products by category |
| `WS /ws/voice` | WebSocket for voice AI |

## 🐛 Troubleshooting

**Database connection error:**
```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose down
docker-compose up -d postgres
```

**Port already in use:**
```bash
# Kill processes on port 3001 or 5173
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

**Backend not connecting to DB:**
- Ensure `.env` has correct database credentials
- Check if PostgreSQL is healthy: `docker-compose logs postgres`

## 📝 Next Steps

1. ✅ Add ElevenLabs API key for voice AI
2. ✅ Customize product catalog for your business
3. ✅ Add multi-warehouse support
4. ✅ Integrate shipping APIs (FedEx, UPS)
5. ✅ Add user management

## 📄 License

MIT - POC for demonstration purposes