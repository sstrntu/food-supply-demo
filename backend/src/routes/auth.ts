import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, TEST_USER } from '../config';

const router = Router();

interface LoginRequest {
  username?: string;
  password?: string;
}

router.post('/login', (req: Request, res: Response) => {
  const { username, password }: LoginRequest = req.body;
  
  if (!username || !password) {
    res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
    return;
  }
  
  if (username === TEST_USER.username && password === TEST_USER.password) {
    const token = jwt.sign(
      { username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: { username, role: 'admin' }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ valid: false, message: 'No token provided' });
    return;
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
