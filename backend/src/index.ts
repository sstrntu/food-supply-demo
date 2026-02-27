import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { getDb, initDb, seedData } from './db';
import { PORT, CORS_ORIGINS } from './config';

// Import routes
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import warehouseRoutes from './routes/warehouses';
import dashboardRoutes from './routes/dashboard';

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
    app.use('/api/orders', orderRoutes);
    app.use('/api/warehouses', warehouseRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    
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
    
    // WebSocket server
    const wss = new WebSocketServer({ server, path: '/ws/voice' });
    
    wss.on('connection', (ws, _req) => {
      const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      elevenlabsService.setupElevenLabsVoice(ws, sessionId);
    });
    
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
