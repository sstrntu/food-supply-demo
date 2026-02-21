"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const ws_1 = require("ws");
const db_1 = require("./db");
const auth_1 = __importDefault(require("./routes/auth"));
const inventory_1 = __importDefault(require("./routes/inventory"));
const products_1 = __importDefault(require("./routes/products"));
const orders_1 = __importDefault(require("./routes/orders"));
const warehouses_1 = __importDefault(require("./routes/warehouses"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const elevenlabs_1 = __importDefault(require("./services/elevenlabs"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)({
    origin: ['https://139.59.102.60:5443', 'http://139.59.102.60:5173', '*'],
    credentials: true
}));
app.use(express_1.default.json());
// SSL certificates
const sslOptions = {
    key: fs_1.default.readFileSync(path_1.default.join(__dirname, '../../key.pem')),
    cert: fs_1.default.readFileSync(path_1.default.join(__dirname, '../../cert.pem'))
};
// Initialize database on startup
async function startServer() {
    try {
        console.log('Initializing database...');
        await (0, db_1.initDb)();
        console.log('✅ Database ready');
        // Routes
        app.use('/api/auth', auth_1.default);
        app.use('/api/inventory', inventory_1.default);
        app.use('/api/products', products_1.default);
        app.use('/api/orders', orders_1.default);
        app.use('/api/warehouses', warehouses_1.default);
        app.use('/api/dashboard', dashboard_1.default);
        // Health check
        app.get('/health', async (req, res) => {
            try {
                const db = await (0, db_1.getDb)();
                await db.get('SELECT 1');
                res.json({ status: 'ok', database: 'connected' });
            }
            catch (error) {
                res.status(500).json({ status: 'error', database: 'disconnected' });
            }
        });
        // Create HTTPS server
        const server = https_1.default.createServer(sslOptions, app);
        // WebSocket server
        const wss = new ws_1.WebSocketServer({ server, path: '/ws/voice' });
        wss.on('connection', (ws) => {
            console.log('WebSocket client connected');
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'voice_command') {
                        // Process voice command with ElevenLabs
                        const response = await elevenlabs_1.default.processCommand(data.text);
                        ws.send(JSON.stringify({
                            type: 'response',
                            text: response
                        }));
                    }
                }
                catch (error) {
                    console.error('WebSocket error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        text: 'Sorry, I did not understand that.'
                    }));
                }
            });
            ws.on('close', () => {
                console.log('WebSocket client disconnected');
            });
        });
        server.listen(PORT, () => {
            console.log(`✅ HTTPS API server running on port ${PORT}`);
            console.log(`📊 Dashboard: https://139.59.102.60:${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index-https.js.map