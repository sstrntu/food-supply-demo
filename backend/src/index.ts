import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb, initDb, seedData } from './db';
import { PORT, CORS_ORIGINS, RESET_DB_ON_START } from './config';

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
import orderRoutes from './routes/orders';

const app = express();

// Middleware
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));
app.use(express.json());

// Lightweight endpoint timing for high-impact routes.
const TIMED_ENDPOINT_PREFIXES = [
  '/api/dashboard/ai-insights',
  '/api/dashboard/weee-vs-channels',
  '/api/hot-items/today',
];
app.use((req: Request, res: Response, next) => {
  const shouldTime = TIMED_ENDPOINT_PREFIXES.some((prefix) =>
    req.path === prefix || req.path.startsWith(`${prefix}/`)
  );
  if (!shouldTime) {
    next();
    return;
  }

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`[perf] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs.toFixed(1)}ms`);
  });
  next();
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer(): Promise<void> {
  try {
    // Initialize database
    await initDb({ reset: RESET_DB_ON_START });
    if (RESET_DB_ON_START) {
      console.warn('⚠ Database reset was requested via RESET_DB_ON_START');
    }
    console.log('✓ Database schema ready');
    
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
    app.use('/api/orders', orderRoutes);
    app.use('/api/dashboard/ai-insights', aiInsightsRoutes);
    
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
