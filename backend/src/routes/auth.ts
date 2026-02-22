import { Router } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Test user credentials
const TEST_USER = {
  username: 'testuser',
  password: '123454321'
};

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('[BACKEND] Login request received');
  console.log('[BACKEND] Request body:', req.body);
  console.log('[BACKEND] Username:', username);
  console.log('[BACKEND] Password provided:', !!password);
  console.log('[BACKEND] Content-Type:', req.headers['content-type']);
  
  if (username === TEST_USER.username && password === TEST_USER.password) {
    console.log('[BACKEND] Credentials MATCH - Login SUCCESS');
    const token = jwt.sign(
      { username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        username,
        role: 'admin'
      }
    });
  } else {
    console.log('[BACKEND] Credentials MISMATCH - Login FAILED');
    console.log('[BACKEND] Expected:', TEST_USER.username, TEST_USER.password);
    console.log('[BACKEND] Received:', username, password);
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, message: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});

export default router;