import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Server configuration
export const PORT = parseInt(process.env.PORT || '3001', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const isProduction = NODE_ENV === 'production';

// Database
export const DATABASE_PATH = process.env.DATABASE_PATH || './database/food_supply.db';

// JWT
export const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key';

// Test credentials
export const TEST_USER = {
  username: process.env.TEST_USER_USERNAME || 'testuser',
  password: process.env.TEST_USER_PASSWORD || '123454321'
};

// ElevenLabs
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
export const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_7901khz299zdfvcbhtk3c08vcps8';

// CORS origins
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://localhost:8443,https://139.59.102.60:8443')
  .split(',')
  .map(origin => origin.trim());

// Database path resolution
export function resolveDbPath(): string {
  const paths = [
    path.resolve(DATABASE_PATH),
    path.join(__dirname, '../../database/food_supply.db'),
    path.join(process.cwd(), 'database/food_supply.db'),
    '/app/database/food_supply.db'
  ];
  
  for (const p of paths) {
    const dir = path.dirname(p);
    try {
      if (fs.existsSync(dir)) {
        return p;
      }
    } catch {
      // Continue to next path
    }
  }
  
  // Return first path and let it create directory
  return paths[0];
}
