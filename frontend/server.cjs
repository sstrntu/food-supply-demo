const express = require('express');
const http = require('http');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.FRONTEND_PORT || 80;
const API_TARGET = process.env.API_URL || 'http://localhost:3001';

// Serve static files FIRST
app.use(express.static(path.join(__dirname, 'dist')));

// Proxy API requests
const apiProxy = createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  secure: false,
  pathFilter: (path) => path.startsWith('/api')
});

app.use(apiProxy);

// WebSocket proxy
const wsProxy = createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  secure: false,
  ws: true,
  pathFilter: (path) => path.startsWith('/ws')
});

app.use(wsProxy);

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);
server.on('upgrade', wsProxy.upgrade);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server running on port ${PORT}`);
});
