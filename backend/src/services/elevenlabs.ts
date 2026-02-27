import { WebSocket } from 'ws';
import { getDb } from '../db';
import { ELEVENLABS_AGENT_ID } from '../config';

export { ELEVENLABS_AGENT_ID };

// Store active sessions
const activeSessions = new Map<string, WebSocket>();

export function setupElevenLabsVoice(ws: WebSocket, sessionId: string): void {
  activeSessions.set(sessionId, ws);
  
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Food Supply Inventory Voice AI',
    agent_id: ELEVENLABS_AGENT_ID
  }));
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'voice_command' || message.type === 'text') {
        const response = await processVoiceCommand(message.text);
        ws.send(JSON.stringify({ type: 'response', ...response }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process your request'
      }));
    }
  });
  
  ws.on('close', () => {
    activeSessions.delete(sessionId);
  });
}

async function processVoiceCommand(text: string): Promise<{ text: string; data?: unknown }> {
  const lowerText = text.toLowerCase();
  const db = await getDb();
  
  // Check stock levels
  if (lowerText.match(/stock|inventory|how many|how much/)) {
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
        const item = result[0] as Record<string, unknown>;
        const stockStatus = (item.quantity_on_hand as number) <= (item.reorder_point as number) 
          ? 'low stock' 
          : 'in stock';
        return {
          text: `We have ${item.quantity_on_hand} units of ${item.name} at ${item.warehouse}. Status: ${stockStatus}.`,
          data: result
        };
      }
    }
    
    const lowStock = await db.all(`
      SELECT p.name, i.quantity_on_hand, i.reorder_point
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY i.quantity_on_hand ASC
      LIMIT 5
    `);
    
    if (lowStock.length > 0) {
      const items = lowStock.map((r: Record<string, unknown>) => 
        `${r.name} (${r.quantity_on_hand} units)`
      ).join(', ');
      return { text: `Low stock alert: ${items}`, data: lowStock };
    }
    
    return { text: 'All items are well stocked.', data: [] };
  }
  
  // Search products
  if (lowerText.match(/find|search|look for|show me|what do you have/)) {
    const searchMatch = lowerText.match(/(?:find|search|look for|show me|what do you have)\s+([a-z\s]+)/i);
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
      const items = result.map((r: Record<string, unknown>) => 
        `${r.name} (${r.quantity_on_hand || 0} in stock)`
      ).join(', ');
      return { text: `Found ${result.length} items: ${items}`, data: result };
    }
    return { text: `No products found matching "${searchTerm}"`, data: [] };
  }
  
  // Category queries
  const categories: Record<string, string> = {
    'rice': 'Rice & Grains',
    'noodles': 'Rice & Grains',
    'sauce': 'Sauces',
    'frozen': 'Frozen',
    'snack': 'Snacks',
    'beverage': 'Beverages',
    'spice': 'Spices'
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
        const items = result.map((r: Record<string, unknown>) => 
          `${r.name}: ${r.quantity_on_hand}`
        ).join(', ');
        return { text: `${category} inventory: ${items}`, data: result };
      }
    }
  }
  
  // Greeting
  if (lowerText.match(/hello|hi|hey/)) {
    return {
      text: "Hello! I'm your inventory assistant. You can ask me about stock levels, find products, or check what's low on stock.",
      data: null
    };
  }
  
  // Help
  if (lowerText.match(/help|what can you do/)) {
    return {
      text: "I can help you check inventory, find products, or get low stock alerts. Try asking 'How much rice do we have?' or 'What's low on stock?'",
      data: null
    };
  }
  
  return {
    text: "I can help you check inventory, find products, or get low stock alerts. What would you like to know?",
    data: null
  };
}

export default { setupElevenLabsVoice, ELEVENLABS_AGENT_ID };
