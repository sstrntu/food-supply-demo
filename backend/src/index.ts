import https from 'https';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { getDb, initDb } from './db';
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import warehouseRoutes from './routes/warehouses';
import dashboardRoutes from './routes/dashboard';
import elevenlabsService from './services/elevenlabs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['https://139.59.102.60:8443', 'https://139.59.102.60:5443', 'http://139.59.102.60:5173', '*'],
  credentials: true
}));
app.use(express.json());

// SSL certificates - Docker paths
const sslOptions = {
    key: fs.readFileSync('/app/key.pem'),
    cert: fs.readFileSync('/app/cert.pem')
};

// Initialize database on startup
async function startServer() {
  try {
    console.log('Initializing database...');
    await initDb();
    console.log('✅ Database ready');
    
    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/inventory', inventoryRoutes);
    app.use('/api/products', productRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/warehouses', warehouseRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    
    // Health check
    app.get('/health', async (req, res) => {
      try {
        const db = await getDb();
        await db.get('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
      } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
      }
    });
    
    // Create HTTPS server
    const server = https.createServer(sslOptions, app);
    
    // WebSocket server for voice AI
    const wss = new WebSocketServer({ server, path: '/ws/voice' });
    
    wss.on('connection', (ws, req) => {
      const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`Voice AI client connected: ${sessionId}`);
      
      // Use ElevenLabs service for this connection
      elevenlabsService.setupElevenLabsVoice(ws, sessionId);
    });
    
    // Log ElevenLabs agent ID
    console.log(`🤖 ElevenLabs Agent ID: ${elevenlabsService.ELEVENLABS_AGENT_ID}`);
    
    const portNum = parseInt(PORT as string, 10);
    server.listen(portNum, '0.0.0.0', () => {
      console.log(`✅ HTTPS Server running on https://0.0.0.0:${portNum}`);
      console.log(`🎙️  WebSocket server ready for voice AI connections`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();