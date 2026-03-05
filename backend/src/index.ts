import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';
import { getDb, initDb, seedData } from './db';
import { PORT, CORS_ORIGINS, JWT_SECRET } from './config';

// Import routes
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import productRoutes from './routes/products';
import warehouseRoutes from './routes/warehouses';
import dashboardRoutes from './routes/dashboard';
import hotItemsRoutes from './routes/hot-items';
import salesRoutes from './routes/sales';
import customerRoutes from './routes/customers';
import weeeRoutes from './routes/weee';
import aiInsightsRoutes from './routes/ai-insights';
import voiceLlmRoutes from './routes/voice-llm';

// Import services
import elevenlabsService from './services/elevenlabs';

const app = express();

// Middleware
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));
app.use(express.json());

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer(): Promise<void> {
  try {
    // Initialize database
    await initDb();
    console.log('✓ Database initialized');
    
    // Seed data
    const db = await getDb();
    await seedData(db);
    console.log('✓ Sample data seeded');
    
    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/inventory', inventoryRoutes);
    app.use('/api/products', productRoutes);
    app.use('/api/warehouses', warehouseRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/hot-items', hotItemsRoutes);
    app.use('/api/sales', salesRoutes);
    app.use('/api/customers', customerRoutes);
    app.use('/api/weee', weeeRoutes);
    app.use('/api/dashboard/ai-insights', aiInsightsRoutes);
    app.use('/api/voice-llm', voiceLlmRoutes);
    
    // Health check
    app.get('/health', async (_req: Request, res: Response) => {
      try {
        const db = await getDb();
        await db.get('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
      }
    });
    
    // 404 handler
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
    
    const server = http.createServer(app);
    
    // WebSocket server with JWT auth
    const wss = new WebSocketServer({ server, path: '/ws/voice' });

    wss.on('connection', (ws, req) => {
      // Verify JWT from query string (?token=...)
      const query = url.parse(req.url || '', true).query;
      const token = typeof query.token === 'string' ? query.token : '';

      if (token) {
        try {
          jwt.verify(token, JWT_SECRET);
        } catch {
          ws.close(4001, 'Invalid token');
          return;
        }
      }
      // Allow unauthenticated connections in development for the ElevenLabs widget

      const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      elevenlabsService.setupElevenLabsVoice(ws, sessionId);
    });

    // Heartbeat: clean up dead WebSocket connections every 30s
    const heartbeatInterval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if ((ws as any).__isAlive === false) { ws.terminate(); return; }
        (ws as any).__isAlive = false;
        ws.ping();
      });
    }, 30000);

    wss.on('connection', (ws) => {
      (ws as any).__isAlive = true;
      ws.on('pong', () => { (ws as any).__isAlive = true; });
    });

    wss.on('close', () => clearInterval(heartbeatInterval));
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Server running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

startServer();
