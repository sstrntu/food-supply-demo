const https = require('https');
const fs = require('fs');
const path = require('path');

// Import the existing app
const { app } = require('./index-wrapper');

const PORT = process.env.PORT || 3001;

// SSL certificates
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, '../../key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../../cert.pem'))
};

// Create HTTPS server
const server = https.createServer(sslOptions, app);

server.listen(PORT, () => {
  console.log(`✅ HTTPS API server running on port ${PORT}`);
  console.log(`📊 API: https://139.59.102.60:${PORT}`);
});

// Handle errors
server.on('error', (err) => {
  console.error('Server error:', err);
});