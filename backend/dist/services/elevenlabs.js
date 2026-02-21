"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupElevenLabsVoice = setupElevenLabsVoice;
const ELEVENLABS_AGENT_ID = 'agent_7901khz299zdfvcbhtk3c08vcps8';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
// Store active ElevenLabs connections
const activeSessions = new Map();
function setupElevenLabsVoice(ws, sessionId) {
    console.log(`Setting up ElevenLabs voice for session: ${sessionId}`);
    // Store the client WebSocket
    activeSessions.set(sessionId, ws);
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Food Supply Inventory Voice AI with ElevenLabs',
        agent_id: ELEVENLABS_AGENT_ID
    }));
    // Handle messages from client
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'voice_command' || message.type === 'text') {
                // Process the voice/text command
                const response = await processVoiceCommand(message.text);
                ws.send(JSON.stringify({
                    type: 'response',
                    text: response.text,
                    data: response.data
                }));
            }
            if (message.type === 'elevenlabs_audio') {
                // Handle audio from ElevenLabs
                // This would be implemented when we have the full ElevenLabs SDK integration
                ws.send(JSON.stringify({
                    type: 'elevenlabs_response',
                    status: 'received',
                    agent_id: ELEVENLABS_AGENT_ID
                }));
            }
        }
        catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process your request'
            }));
        }
    });
    // Cleanup on close
    ws.on('close', () => {
        console.log(`Session ${sessionId} closed`);
        activeSessions.delete(sessionId);
    });
}
async function processVoiceCommand(text) {
    const lowerText = text.toLowerCase();
    // Import database
    const { getDb } = require('../db');
    const db = await getDb();
    // Check stock levels
    if (lowerText.includes('stock') || lowerText.includes('inventory') || lowerText.includes('how many') || lowerText.includes('how much')) {
        // Extract product name
        const productMatch = lowerText.match(/(?:of|much|many|have|has|got|about|for)\s+([a-z\s]+?)(?:\s+(?:in|at|do|we|left|\?)|\?|$)/i);
        if (productMatch) {
            const searchTerm = productMatch[1].trim();
            const result = await db.all(`
        SELECT p.name, p.category, i.quantity_on_hand, i.reorder_point, w.name as warehouse
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        JOIN warehouses w ON i.warehouse_id = w.id
        WHERE p.name ILIKE ? OR p.category ILIKE ?
        LIMIT 5
      `, [`%${searchTerm}%`, `%${searchTerm}%`]);
            if (result.length > 0) {
                const item = result[0];
                const stockStatus = item.quantity_on_hand <= item.reorder_point ? 'low stock' : 'in stock';
                return {
                    text: `We have ${item.quantity_on_hand} units of ${item.name} at ${item.warehouse}. Status: ${stockStatus}.`,
                    data: result
                };
            }
        }
        // Get all low stock items
        const lowStock = await db.all(`
      SELECT p.name, i.quantity_on_hand, i.reorder_point
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY i.quantity_on_hand ASC
      LIMIT 5
    `);
        if (lowStock.length > 0) {
            const items = lowStock.map((r) => `${r.name} (${r.quantity_on_hand} units)`).join(', ');
            return {
                text: `Low stock alert: ${items}`,
                data: lowStock
            };
        }
        return {
            text: 'All items are well stocked.',
            data: []
        };
    }
    // Search products
    if (lowerText.includes('find') || lowerText.includes('search') || lowerText.includes('look for') || lowerText.includes('show me') || lowerText.includes('what do you have')) {
        const searchMatch = lowerText.match(/(?:find|search|look for|show me|what do you have)\s+([a-z\s]+)/i);
        if (searchMatch || lowerText.includes('all')) {
            const searchTerm = searchMatch ? searchMatch[1].trim() : '';
            const result = await db.all(`
        SELECT name, category, unit_price, sku, i.quantity_on_hand
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        WHERE (? = '' OR p.name ILIKE ? OR p.category ILIKE ?)
        ORDER BY p.category, p.name
        LIMIT 10
      `, [searchTerm, `%${searchTerm}%`, `%${searchTerm}%`]);
            if (result.length > 0) {
                const items = result.map((r) => `${r.name} (${r.quantity_on_hand || 0} in stock)`).join(', ');
                return {
                    text: `Found ${result.length} items: ${items}`,
                    data: result
                };
            }
            return {
                text: `No products found matching "${searchTerm}"`,
                data: []
            };
        }
    }
    // Category queries
    const categories = {
        'rice': 'Rice & Noodles',
        'noodles': 'Rice & Noodles',
        'sauce': 'Sauces & Condiments',
        'condiment': 'Sauces & Condiments',
        'frozen': 'Frozen Foods',
        'snack': 'Snacks',
        'beverage': 'Beverages',
        'drink': 'Beverages',
        'spice': 'Spices',
        'canned': 'Canned Goods'
    };
    for (const [keyword, category] of Object.entries(categories)) {
        if (lowerText.includes(keyword)) {
            const result = await db.all(`
        SELECT p.name, i.quantity_on_hand
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        WHERE p.category = ?
        ORDER BY i.quantity_on_hand ASC
        LIMIT 5
      `, [category]);
            if (result.length > 0) {
                const items = result.map((r) => `${r.name}: ${r.quantity_on_hand}`).join(', ');
                return {
                    text: `${category} inventory: ${items}`,
                    data: result
                };
            }
        }
    }
    // Greeting
    if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
        return {
            text: "Hello! I'm your inventory assistant. You can ask me about stock levels, find products, or check what's low on stock. What would you like to know?",
            data: null
        };
    }
    // Help
    if (lowerText.includes('help') || lowerText.includes('what can you do')) {
        return {
            text: "I can help you with:\n\n• Check stock levels - 'How much jasmine rice do we have?'\n• Find products - 'Show me all frozen foods'\n• Low stock alerts - 'What's low on stock?'\n• Search by category - 'Show me sauces'\n\nWhat would you like to know?",
            data: null
        };
    }
    // Default response
    return {
        text: "I can help you check inventory, find products, or get low stock alerts. Try asking 'How much jasmine rice do we have?' or 'What items are low on stock?'",
        data: null
    };
}
exports.default = { setupElevenLabsVoice, ELEVENLABS_AGENT_ID };
//# sourceMappingURL=elevenlabs.js.map