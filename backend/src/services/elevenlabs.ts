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
    message: 'Connected to U.S. Trading Sales Voice AI',
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
  const today = new Date().toISOString().split('T')[0];

  // --- UC5: Universal pitch ---
  if (lowerText.match(/universal pitch|one sentence|one pitch|every store|today.*message/)) {
    const result = await db.get(`
      SELECT universal_pitch FROM hot_items
      WHERE weee_date = ? AND universal_pitch IS NOT NULL
      ORDER BY weee_rank ASC LIMIT 1
    `, [today]);
    return {
      text: (result as any)?.universal_pitch || 'Focus on trending Asian staples — coconut-based and snack items are surging on Weee right now.',
    };
  }

  // --- UC1: Hot items brief ---
  if (lowerText.match(/hot items|(?:weee|sayweee).*trending|what.*push|today.*brief|top.*(?:weee|sayweee)/)) {
    const items = await db.all(`
      SELECT h.weee_rank, h.weee_product_name, h.match_type, p.name as our_product
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC LIMIT 5
    `, [today]);

    if (!items.length) return { text: 'No hot items data for today. Please check back later.' };
    const list = (items as any[]).map(i => `${i.weee_rank}. ${i.weee_product_name}`).join(', ');
    return { text: `Today's top Weee (Sayweee) hot items: ${list}.`, data: items };
  }

  // --- UC2: Match to catalog ---
  if (lowerText.match(/do we carry|which.*carry|match.*catalog|closest alternative|what.*alternative/)) {
    const items = await db.all(`
      SELECT h.weee_product_name, h.match_type, h.match_notes, p.name as our_product
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
    `, [today]);

    const matched = (items as any[]).filter(i => i.match_type !== 'none');
    const unmatched = (items as any[]).filter(i => i.match_type === 'none');
    let response = `We match ${matched.length} of today's ${items.length} hot items. `;
    response += matched.slice(0, 3).map((i: any) => i.match_notes).join('. ');
    if (unmatched.length) response += ` No match for: ${unmatched.map((i: any) => i.weee_product_name).join(', ')}.`;
    return { text: response, data: items };
  }

  // --- UC3: Talking points ---
  if (lowerText.match(/talking point|what.*say|in.?store.*pitch|how.*pitch/)) {
    const items = await db.all(`
      SELECT weee_product_name, talking_point FROM hot_items
      WHERE weee_date = ? AND talking_point IS NOT NULL
      ORDER BY weee_rank ASC LIMIT 3
    `, [today]);

    const points = (items as any[]).map(i => `For ${i.weee_product_name}: ${i.talking_point}`).join(' | ');
    return { text: points || 'No talking points available for today.', data: items };
  }

  // --- UC4: Cross-sell ---
  if (lowerText.match(/cross.?sell|add.?on|pairs? with|complementary|what goes with|bundle/)) {
    const items = await db.all(`
      SELECT h.weee_product_name, p.name as our_product, p2.name as paired_product, pp.pairing_reason
      FROM hot_items h
      JOIN products p ON h.matched_product_id = p.id
      JOIN product_pairings pp ON p.id = pp.product_id
      JOIN products p2 ON pp.paired_product_id = p2.id
      WHERE h.weee_date = ? AND h.match_type != 'none'
      ORDER BY h.weee_rank ASC LIMIT 3
    `, [today]);

    if (!(items as any[]).length) return { text: "No cross-sell pairings found for today's hot items." };
    const recs = (items as any[]).map(i => `Pair ${i.our_product} with ${i.paired_product}: ${i.pairing_reason}`).join('. ');
    return { text: recs, data: items };
  }

  // --- UC6: Top SKUs by territory ---
  if (lowerText.match(/top sk|top sell|best sell|my accounts|territory.*sell|prioritize/)) {
    const territories = ['Chicago/Midwest', 'West Coast', 'East Coast', 'South'];
    const territory = territories.find(t => lowerText.includes(t.toLowerCase())) || 'Chicago/Midwest';
    const daysMatch = lowerText.match(/(\d+)\s*days?/);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;

    const topSkus = await db.all(`
      SELECT p.name, p.sku, SUM(sh.quantity_sold) as total_qty, SUM(sh.revenue) as revenue,
        i.quantity_on_hand, i.reorder_point
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      JOIN customers c ON sh.customer_id = c.id
      JOIN inventory i ON p.id = i.product_id
      WHERE c.territory = ? AND sh.sale_date >= date('now', '-' || ? || ' days') AND sh.was_out_of_stock = 0
      GROUP BY p.id ORDER BY revenue DESC LIMIT 3
    `, [territory, days]);

    if (!(topSkus as any[]).length) return { text: `No sales data for ${territory} in the last ${days} days.` };
    const list = (topSkus as any[]).map((p, i) => {
      const stockStatus = p.quantity_on_hand <= p.reorder_point ? 'RESTOCK NEEDED' : 'well stocked';
      return `${i + 1}. ${p.name}: ${p.total_qty} units, $${p.revenue.toFixed(0)} revenue, ${stockStatus}`;
    }).join('. ');
    return { text: `Top sellers in ${territory} (last ${days} days): ${list}.`, data: topSkus };
  }

  // --- UC7: Category trends ---
  if (lowerText.match(/category trend|trending up|trending down|compared to|similar customer|benchmark/)) {
    const customerRow = await db.get('SELECT id, name, store_type, territory FROM customers LIMIT 1') as any;
    if (!customerRow) return { text: 'No customer data available.' };

    const customerCategories = await db.all(`
      SELECT p.category, SUM(sh.revenue) as revenue
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.customer_id = ? AND sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
      GROUP BY p.category ORDER BY revenue DESC
    `, [customerRow.id]);

    const peerCategories = await db.all(`
      SELECT p.category, AVG(sub_revenue) as avg_revenue FROM (
        SELECT p2.category, SUM(sh2.revenue) as sub_revenue
        FROM sales_history sh2
        JOIN products p2 ON sh2.product_id = p2.id
        JOIN customers c2 ON sh2.customer_id = c2.id
        WHERE c2.store_type = ? AND c2.id != ? AND sh2.sale_date >= date('now', '-30 days') AND sh2.was_out_of_stock = 0
        GROUP BY sh2.customer_id, p2.category
      ) JOIN products p ON 1=1
      GROUP BY category
    `, [customerRow.store_type, customerRow.id]);

    const peerMap: Record<string, number> = {};
    for (const pc of peerCategories as any[]) { peerMap[pc.category] = pc.avg_revenue; }

    const trends = (customerCategories as any[]).map(cc => {
      const peerAvg = peerMap[cc.category] || cc.revenue;
      const pct = peerAvg > 0 ? ((cc.revenue - peerAvg) / peerAvg) * 100 : 0;
      return { category: cc.category, pct: Math.round(pct) };
    });

    const up = trends.filter(t => t.pct > 5).map(t => `${t.category} +${t.pct}%`).join(', ');
    const down = trends.filter(t => t.pct < -5).map(t => `${t.category} ${t.pct}%`).join(', ');

    return {
      text: `For ${customerRow.name}: Trending up — ${up || 'none'}. Trending down — ${down || 'none'}.`,
      data: trends,
    };
  }

  // --- UC8: Back-in-stock alerts ---
  if (lowerText.match(/back.*stock|out.*stock|sales.*drop|who.*call|restock alert|stockout/)) {
    const alerts = await db.all(`
      SELECT p.name as product_name, i.quantity_on_hand, c.name as customer_name,
        c.phone, c.territory, c.account_manager,
        SUM(CASE WHEN sh.was_out_of_stock = 1 THEN 1 ELSE 0 END) as oos_days
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      JOIN customers c ON sh.customer_id = c.id
      JOIN inventory i ON p.id = i.product_id
      WHERE sh.sale_date >= date('now', '-14 days')
        AND i.quantity_on_hand > 0
      GROUP BY p.id, c.id
      HAVING oos_days > 0
      ORDER BY oos_days DESC LIMIT 4
    `);

    if (!(alerts as any[]).length) return { text: 'No back-in-stock situations to report.' };

    const calls = (alerts as any[]).map(a =>
      `${a.product_name} is back (${a.quantity_on_hand} units). Call ${a.customer_name} at ${a.phone} — they lost ${a.oos_days} days of sales.`
    ).join(' Next: ');
    return { text: calls, data: alerts };
  }

  // --- Weee reviews ---
  if (lowerText.match(/review|feedback|rating|what.*customer.*say|(?:weee|sayweee).*comment/)) {
    const productMatch = lowerText.match(/(?:for|about|on)\s+([a-z\s]+?)(?:\s+on|\s+from|\?|$)/i);
    let productName = productMatch ? productMatch[1].trim() : '';

    let reviews;
    if (productName) {
      reviews = await db.all(`
        SELECT p.name, wr.reviewer_name, wr.rating, wr.comment, wr.review_date
        FROM weee_reviews wr
        JOIN products p ON wr.product_id = p.id
        WHERE p.name LIKE ?
        ORDER BY wr.review_date DESC LIMIT 3
      `, [`%${productName}%`]);
    } else {
      reviews = await db.all(`
        SELECT p.name, wr.reviewer_name, wr.rating, wr.comment, wr.review_date
        FROM weee_reviews wr
        JOIN products p ON wr.product_id = p.id
        ORDER BY wr.review_date DESC LIMIT 5
      `);
    }

    if (!(reviews as any[]).length) return { text: 'No reviews found.' };
    const reviewText = (reviews as any[]).map(r =>
      `${r.name} — ${r.reviewer_name} (${r.rating}/5): "${r.comment}"`
    ).join('. ');
    return { text: `Recent Weee (Sayweee) reviews: ${reviewText}`, data: reviews };
  }

  // --- Weee performance ---
  if (lowerText.match(/(?:weee|sayweee).*sales|(?:weee|sayweee).*performance|(?:weee|sayweee).*listing|how.*doing.*(?:weee|sayweee)|our.*(?:weee|sayweee)/)) {
    const topProducts = await db.all(`
      SELECT name, sku, weee_rating, weee_review_count, weee_weekly_sold
      FROM products
      WHERE weee_listed = 1
      ORDER BY weee_weekly_sold DESC LIMIT 5
    `);

    const stats = await db.get(`
      SELECT COUNT(*) as total, AVG(weee_rating) as avg_rating, SUM(weee_weekly_sold) as total_sold
      FROM products WHERE weee_listed = 1
    `) as any;

    const list = (topProducts as any[]).map(p =>
      `${p.name}: ${p.weee_weekly_sold} sold, ${p.weee_rating} stars`
    ).join(', ');

    return {
      text: `We have ${stats.total} products on Weee (Sayweee) with an average rating of ${stats.avg_rating.toFixed(1)}. Top sellers this week: ${list}.`,
      data: topProducts,
    };
  }

  // --- Existing: Check stock levels ---
  if (lowerText.match(/stock|inventory|how many|how much/)) {
    const productMatch = lowerText.match(/(?:of|much|many|have|has|got|about|for)\s+([a-z\s]+?)(?:\s+(?:in|at|do|we|left|\?)|\?|$)/i);

    if (productMatch) {
      const searchTerm = productMatch[1].trim();
      const result = await db.all(`
        SELECT p.name, p.category, i.quantity_on_hand, i.reorder_point, w.name as warehouse
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        JOIN warehouses w ON i.warehouse_id = w.id
        WHERE p.name LIKE ? OR p.category LIKE ?
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

  // --- Existing: Search products ---
  if (lowerText.match(/find|search|look for|show me|what do you have/)) {
    const searchMatch = lowerText.match(/(?:find|search|look for|show me|what do you have)\s+([a-z\s]+)/i);
    const searchTerm = searchMatch ? searchMatch[1].trim() : '';

    const result = await db.all(`
      SELECT name, category, unit_price, sku, i.quantity_on_hand
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE (? = '' OR p.name LIKE ? OR p.category LIKE ?)
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

  // --- Category queries ---
  const categories: Record<string, string> = {
    'rice': 'Rice & Grains',
    'noodles': 'Noodles',
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
      text: "Hello! I'm your U.S. Trading sales assistant. Ask me about today's hot items, top sellers by territory, back-in-stock alerts, Weee or Sayweee reviews, or inventory levels.",
      data: null
    };
  }

  // Help
  if (lowerText.match(/help|what can you do/)) {
    return {
      text: "I can help with: today's Weee/Sayweee hot items, talking points, cross-sell pairings, top sellers by territory, category trends, back-in-stock alerts, Weee reviews, and inventory checks. What would you like to know?",
      data: null
    };
  }

  return {
    text: "I can help with hot items, top sellers, back-in-stock alerts, Weee reviews, and inventory. Try asking 'What are today's hot items?' or 'Any back-in-stock alerts?'",
    data: null
  };
}

export default { setupElevenLabsVoice, ELEVENLABS_AGENT_ID };
