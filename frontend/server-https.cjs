const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const HTTPS_PORT = process.env.FRONTEND_HTTPS_PORT || 8443;
const API_TARGET = process.env.API_URL || 'http://localhost:3001';

// SSL certificate paths
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, '../key.pem');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, '../cert.pem');

// Serve static files from dist folder
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

// Fallback to index.html
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Load SSL certificates
let sslOptions = null;
try {
  if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH)
    };
  }
} catch (err) {
  console.error('SSL certificates not found:', err.message);
}

if (!sslOptions) {
  console.error('ERROR: SSL certificates are required. Generate them with:');
  console.error('  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"');
  process.exit(1);
}

// Start HTTPS server
const httpsServer = https.createServer(sslOptions, app);
httpsServer.on('upgrade', wsProxy.upgrade);
httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log(`HTTPS Server running on https://0.0.0.0:${HTTPS_PORT}`);
});
