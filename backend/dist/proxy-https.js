const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SSL_PORT = 3001;
const BACKEND_PORT = 3002; // HTTP backend will run here

// SSL certificates
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, '../../key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../../cert.pem'))
};

// Create HTTPS proxy server
const proxy = https.createServer(sslOptions, (req, res) => {
  // Proxy to HTTP backend
  const options = {
    hostname: 'localhost',
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${BACKEND_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
});

// WebSocket proxy
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: proxy, path: '/ws/voice' });

wss.on('connection', (ws) => {
  // Connect to backend WebSocket
  const backendWs = new WebSocket(`ws://localhost:${BACKEND_PORT}/ws/voice`);
  
  backendWs.on('open', () => {
    console.log('Backend WebSocket connected');
  });
  
  backendWs.on('message', (data) => {
    ws.send(data);
  });
  
  backendWs.on('close', () => {
    ws.close();
  });
  
  ws.on('message', (data) => {
    if (backendWs.readyState === WebSocket.OPEN) {
      backendWs.send(data);
    }
  });
  
  ws.on('close', () => {
    backendWs.close();
  });
});

proxy.listen(SSL_PORT, '0.0.0.0', () => {
  console.log(`🔒 HTTPS Proxy running on port ${SSL_PORT}`);
  console.log(`📡 Proxying to HTTP backend on port ${BACKEND_PORT}`);
});

// Handle errors
proxy.on('error', (err) => {
  console.error('Proxy server error:', err);
});