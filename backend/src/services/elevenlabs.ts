import { WebSocket } from 'ws';
import { getDb } from '../db';
import { ELEVENLABS_AGENT_ID } from '../config';
import { resolveHotDate } from '../utils/hot-date';

export { ELEVENLABS_AGENT_ID };

// Store active sessions
const activeSessions = new Map<string, WebSocket>();
const sessionContexts = new Map<string, SessionContext>();

type SessionRole = 'user' | 'assistant';

interface SessionTurn {
  role: SessionRole;
  text: string;
  timestamp: number;
}

interface SessionContext {
  history: SessionTurn[];
  recentProducts: string[];
  recentCategories: string[];
  lastIntent?: string;
  lastTerritory?: string;
  lastDays?: number;
  updatedAt: number;
}

interface ResponseContextHints {
  territory?: string;
  days?: number;
  products?: string[];
  categories?: string[];
}

const TERRITORIES = ['Chicago/Midwest', 'West Coast', 'East Coast', 'South'] as const;
const FOLLOW_UP_REFERENCE_RE = /\b(those|them|that|it|these|this|ones?|previous|above|same)\b/i;
const REFERENCE_SEARCH_TERMS = new Set([
  'it', 'them', 'those', 'that', 'this', 'these', 'one', 'ones',
  'item', 'items', 'product', 'products', 'stock', 'inventory',
  'inventories', 'same', 'previous', 'above'
]);

function readPositiveConfigNumber(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const VOICE_CONTEXT_TTL_MS = readPositiveConfigNumber(process.env.VOICE_CONTEXT_TTL_MS, 60 * 60 * 1000);
const VOICE_CONTEXT_MAX_TURNS = readPositiveConfigNumber(process.env.VOICE_CONTEXT_MAX_TURNS, 24);
const VOICE_CONTEXT_MAX_ENTITIES = readPositiveConfigNumber(process.env.VOICE_CONTEXT_MAX_ENTITIES, 8);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeVoiceText(rawText: string): string {
  return rawText
    .replace(/\[\d+~?/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function pushRecent(target: string[], values: string[]): void {
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const existingIdx = target.findIndex((item) => item.toLowerCase() === value.toLowerCase());
    if (existingIdx >= 0) {
      target.splice(existingIdx, 1);
    }
    target.unshift(value);
  }

  if (target.length > VOICE_CONTEXT_MAX_ENTITIES) {
    target.splice(VOICE_CONTEXT_MAX_ENTITIES);
  }
}

function pruneExpiredSessionContexts(now: number = Date.now()): void {
  for (const [key, context] of sessionContexts.entries()) {
    if (now - context.updatedAt > VOICE_CONTEXT_TTL_MS) {
      sessionContexts.delete(key);
    }
  }
}

function getSessionContext(sessionId: string): SessionContext {
  pruneExpiredSessionContexts();
  const existing = sessionContexts.get(sessionId);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const created: SessionContext = {
    history: [],
    recentProducts: [],
    recentCategories: [],
    updatedAt: Date.now(),
  };
  sessionContexts.set(sessionId, created);
  return created;
}

function rememberTurn(context: SessionContext, role: SessionRole, text: string): void {
  context.history.push({
    role,
    text,
    timestamp: Date.now(),
  });

  if (context.history.length > VOICE_CONTEXT_MAX_TURNS) {
    context.history.splice(0, context.history.length - VOICE_CONTEXT_MAX_TURNS);
  }
  context.updatedAt = Date.now();
}

function collectStringFields(data: unknown, keys: string[]): string[] {
  const values: string[] = [];
  const stack: unknown[] = [data];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    const row = asRecord(current);
    if (!row) continue;
    if (seen.has(row)) continue;
    seen.add(row);

    for (const key of keys) {
      const fieldValue = row[key];
      if (typeof fieldValue === 'string' && fieldValue.trim()) {
        values.push(fieldValue.trim());
      }
    }

    for (const fieldValue of Object.values(row)) {
      if (Array.isArray(fieldValue) || (typeof fieldValue === 'object' && fieldValue !== null)) {
        stack.push(fieldValue);
      }
    }
  }

  return dedupeCaseInsensitive(values);
}

function extractProductsFromData(data: unknown): string[] {
  return collectStringFields(data, ['name', 'product_name', 'our_product', 'paired_product']);
}

function extractCategoriesFromData(data: unknown): string[] {
  return collectStringFields(data, ['category']);
}

function isReferenceSearchTerm(term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return true;
  return REFERENCE_SEARCH_TERMS.has(normalized);
}

function updateContextFromResponse(
  context: SessionContext,
  intent: string,
  responseText: string,
  data: unknown,
  hints?: ResponseContextHints,
): void {
  rememberTurn(context, 'assistant', responseText);
  context.lastIntent = intent;

  if (hints?.territory) context.lastTerritory = hints.territory;
  if (typeof hints?.days === 'number' && Number.isFinite(hints.days) && hints.days > 0) {
    context.lastDays = hints.days;
  }

  const productsFromData = extractProductsFromData(data);
  const categoriesFromData = extractCategoriesFromData(data);
  const hintedProducts = hints?.products || [];
  const hintedCategories = hints?.categories || [];

  pushRecent(context.recentProducts, dedupeCaseInsensitive([...hintedProducts, ...productsFromData]));
  pushRecent(context.recentCategories, dedupeCaseInsensitive([...hintedCategories, ...categoriesFromData]));
}

function resolveConversationKey(baseSessionId: string, payload: Record<string, unknown>): string {
  const candidateKeys = ['conversation_id', 'session_id', 'context_id'];
  for (const key of candidateKeys) {
    const raw = payload[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return baseSessionId;
}

export function setupElevenLabsVoice(ws: WebSocket, sessionId: string): void {
  activeSessions.set(sessionId, ws);

  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to U.S. Trading Sales Voice AI',
    agent_id: ELEVENLABS_AGENT_ID
  }));

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      const message = asRecord(parsed);
      if (!message) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid request payload'
        }));
        return;
      }

      const messageType = typeof message.type === 'string' ? message.type : '';
      const rawText = typeof message.text === 'string' ? message.text : '';
      const conversationKey = resolveConversationKey(sessionId, message);

      if (messageType === 'voice_command' || messageType === 'text') {
        const response = await processVoiceCommand(rawText, conversationKey);
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
    pruneExpiredSessionContexts();
  });
}

async function processVoiceCommand(rawText: string, sessionId: string): Promise<{ text: string; data?: unknown }> {
  const cleanedText = normalizeVoiceText(rawText);
  const lowerText = cleanedText.toLowerCase();
  const db = await getDb();
  const session = getSessionContext(sessionId);
  rememberTurn(session, 'user', cleanedText);

  const respond = (
    intent: string,
    responseText: string,
    data: unknown = null,
    hints?: ResponseContextHints,
  ): { text: string; data?: unknown } => {
    updateContextFromResponse(session, intent, responseText, data, hints);
    return { text: responseText, data };
  };

  if (!cleanedText) {
    return respond('empty', 'I did not catch that. Please repeat your request.');
  }

  const today = new Date().toISOString().split('T')[0];
  let resolvedHotDate: string | null | undefined;
  const getHotDate = async (): Promise<string | null> => {
    if (resolvedHotDate !== undefined) return resolvedHotDate;
    resolvedHotDate = await resolveHotDate(db, today);
    return resolvedHotDate;
  };

  // --- UC5: Universal pitch ---
  if (lowerText.match(/universal pitch|one sentence|one pitch|every store|today.*message/)) {
    const hotDate = await getHotDate();
    if (!hotDate) {
      return respond('universal_pitch', 'Focus on trending Asian staples — coconut-based and snack items are surging on Weee right now.');
    }

    const result = await db.get(`
      SELECT universal_pitch FROM hot_items
      WHERE weee_date = ? AND universal_pitch IS NOT NULL
      ORDER BY weee_rank ASC LIMIT 1
    `, [hotDate]);
    return respond(
      'universal_pitch',
      (result as any)?.universal_pitch || 'Focus on trending Asian staples — coconut-based and snack items are surging on Weee right now.',
      result
    );
  }

  // --- UC1: Hot items brief ---
  if (lowerText.match(/hot items|(?:weee|sayweee).*trending|what.*push|today.*brief|top.*(?:weee|sayweee)/)) {
    const hotDate = await getHotDate();
    if (!hotDate) return respond('hot_items', 'No hot items data available yet.');

    const items = await db.all(`
      SELECT h.weee_rank, h.weee_product_name, h.match_type, p.name as our_product
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC LIMIT 5
    `, [hotDate]);

    if (!items.length) return respond('hot_items', 'No hot items data available yet. Please check back later.');
    const list = (items as any[]).map(i => `${i.weee_rank}. ${i.weee_product_name}`).join(', ');
    const intro = hotDate === today
      ? 'Today\'s top Weee (Sayweee) hot items'
      : `Latest available Weee (Sayweee) hot items for ${hotDate}`;
    return respond('hot_items', `${intro}: ${list}.`, items);
  }

  // --- UC2: Match to catalog ---
  if (lowerText.match(/do we carry|which.*carry|match.*catalog|closest alternative|what.*alternative/)) {
    const hotDate = await getHotDate();
    if (!hotDate) return respond('catalog_match', 'No hot-item catalog matching data available yet.');

    const items = await db.all(`
      SELECT h.weee_product_name, h.match_type, h.match_notes, p.name as our_product
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
    `, [hotDate]);

    if (!(items as any[]).length) {
      return respond('catalog_match', 'No hot-item catalog matching data available yet.');
    }

    const matched = (items as any[]).filter(i => i.match_type !== 'none');
    const unmatched = (items as any[]).filter(i => i.match_type === 'none');
    let response = `We match ${matched.length} of ${items.length} hot items${hotDate === today ? ' today' : ` from ${hotDate}`}. `;
    response += matched.slice(0, 3).map((i: any) => i.match_notes).join('. ');
    if (unmatched.length) response += ` No match for: ${unmatched.map((i: any) => i.weee_product_name).join(', ')}.`;
    return respond('catalog_match', response, items);
  }

  // --- UC3: Talking points ---
  if (lowerText.match(/talking point|what.*say|in.?store.*pitch|how.*pitch/)) {
    const hotDate = await getHotDate();
    if (!hotDate) return respond('talking_points', 'No talking points available right now.');

    const items = await db.all(`
      SELECT weee_product_name, talking_point FROM hot_items
      WHERE weee_date = ? AND talking_point IS NOT NULL
      ORDER BY weee_rank ASC LIMIT 3
    `, [hotDate]);

    const points = (items as any[]).map(i => `For ${i.weee_product_name}: ${i.talking_point}`).join(' | ');
    return respond('talking_points', points || 'No talking points available for today.', items);
  }

  // --- UC4: Cross-sell ---
  if (lowerText.match(/cross.?sell|add.?on|pairs? with|complementary|what goes with|bundle/)) {
    const hotDate = await getHotDate();
    if (!hotDate) return respond('cross_sell', 'No cross-sell pairings found for hot items yet.');

    const items = await db.all(`
      SELECT h.weee_product_name, p.name as our_product, p2.name as paired_product, pp.pairing_reason
      FROM hot_items h
      JOIN products p ON h.matched_product_id = p.id
      JOIN product_pairings pp ON p.id = pp.product_id
      JOIN products p2 ON pp.paired_product_id = p2.id
      WHERE h.weee_date = ? AND h.match_type != 'none'
      ORDER BY h.weee_rank ASC LIMIT 3
    `, [hotDate]);

    if (!(items as any[]).length) return respond('cross_sell', "No cross-sell pairings found for today's hot items.");
    const recs = (items as any[]).map(i => `Pair ${i.our_product} with ${i.paired_product}: ${i.pairing_reason}`).join('. ');
    return respond('cross_sell', recs, items);
  }

  // --- UC6: Top SKUs by territory ---
  if (lowerText.match(/top sk|top sell|best sell|my accounts|territory.*sell|prioritize/)) {
    const territory = TERRITORIES.find(t => lowerText.includes(t.toLowerCase())) || session.lastTerritory || 'Chicago/Midwest';
    const daysMatch = lowerText.match(/(\d+)\s*days?/);
    const days = daysMatch ? parseInt(daysMatch[1], 10) : (session.lastDays || 30);

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

    if (!(topSkus as any[]).length) return respond('top_skus', `No sales data for ${territory} in the last ${days} days.`, topSkus, { territory, days });
    const list = (topSkus as any[]).map((p, i) => {
      const stockStatus = p.quantity_on_hand <= p.reorder_point ? 'RESTOCK NEEDED' : 'well stocked';
      return `${i + 1}. ${p.name}: ${p.total_qty} units, $${p.revenue.toFixed(0)} revenue, ${stockStatus}`;
    }).join('. ');
    return respond('top_skus', `Top sellers in ${territory} (last ${days} days): ${list}.`, topSkus, { territory, days });
  }

  // --- UC7: Category trends ---
  if (lowerText.match(/category trend|trending up|trending down|compared to|similar customer|benchmark/)) {
    const customerRow = await db.get('SELECT id, name, store_type, territory FROM customers LIMIT 1') as any;
    if (!customerRow) return respond('category_trends', 'No customer data available.');

    const customerCategories = await db.all(`
      SELECT p.category, SUM(sh.revenue) as revenue
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.customer_id = ? AND sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
      GROUP BY p.category ORDER BY revenue DESC
    `, [customerRow.id]);

    const peerCategories = await db.all(`
      SELECT sub.category, AVG(sub.sub_revenue) as avg_revenue
      FROM (
        SELECT p2.category, SUM(sh2.revenue) as sub_revenue
        FROM sales_history sh2
        JOIN products p2 ON sh2.product_id = p2.id
        JOIN customers c2 ON sh2.customer_id = c2.id
        WHERE c2.store_type = ? AND c2.id != ? AND sh2.sale_date >= date('now', '-30 days') AND sh2.was_out_of_stock = 0
        GROUP BY sh2.customer_id, p2.category
      ) sub
      GROUP BY sub.category
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

    return respond(
      'category_trends',
      `For ${customerRow.name}: Trending up — ${up || 'none'}. Trending down — ${down || 'none'}.`,
      trends
    );
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

    if (!(alerts as any[]).length) return respond('back_in_stock', 'No back-in-stock situations to report.', alerts);

    const calls = (alerts as any[]).map(a =>
      `${a.product_name} is back (${a.quantity_on_hand} units). Call ${a.customer_name} at ${a.phone} — they lost ${a.oos_days} days of sales.`
    ).join(' Next: ');
    return respond('back_in_stock', calls, alerts);
  }

  // --- Weee reviews ---
  if (lowerText.match(/review|feedback|rating|what.*customer.*say|(?:weee|sayweee).*comment/)) {
    const productMatch = cleanedText.match(/(?:for|about|on)\s+([a-z\s]+?)(?:\s+on|\s+from|\?|$)/i);
    let productName = productMatch ? productMatch[1].trim() : '';
    if (!productName && FOLLOW_UP_REFERENCE_RE.test(lowerText) && session.recentProducts.length > 0) {
      productName = session.recentProducts[0];
    }

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

    if (!(reviews as any[]).length) return respond('reviews', 'No reviews found.', reviews);
    const reviewText = (reviews as any[]).map(r =>
      `${r.name} — ${r.reviewer_name} (${r.rating}/5): "${r.comment}"`
    ).join('. ');
    return respond('reviews', `Recent Weee (Sayweee) reviews: ${reviewText}`, reviews);
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

    return respond(
      'weee_performance',
      `We have ${stats.total} products on Weee (Sayweee) with an average rating of ${stats.avg_rating.toFixed(1)}. Top sellers this week: ${list}.`,
      topProducts
    );
  }

  // --- Existing: Check stock levels ---
  if (lowerText.match(/stock|inventory|how many|how much/)) {
    const productMatch = cleanedText.match(/(?:of|much|many|have|has|got|about|for)\s+([a-z\s]+?)(?:\s+(?:in|at|do|we|left|\?)|\?|$)/i);
    const searchTerm = productMatch ? productMatch[1].trim() : '';
    const isFollowUpReference = FOLLOW_UP_REFERENCE_RE.test(lowerText);

    if (isFollowUpReference && isReferenceSearchTerm(searchTerm)) {
      const recentProducts = session.recentProducts.slice(0, 3);
      if (recentProducts.length > 0) {
        const where = recentProducts.map(() => 'p.name LIKE ?').join(' OR ');
        const likeParams = recentProducts.map((name) => `%${name}%`);
        const result = await db.all(`
          SELECT p.name, p.category, i.quantity_on_hand, i.reorder_point, w.name as warehouse
          FROM products p
          JOIN inventory i ON p.id = i.product_id
          JOIN warehouses w ON i.warehouse_id = w.id
          WHERE ${where}
          ORDER BY i.quantity_on_hand ASC
          LIMIT 5
        `, likeParams);

        if (result.length > 0) {
          const summary = result.map((item: Record<string, unknown>) => {
            const qty = item.quantity_on_hand as number;
            const reorder = item.reorder_point as number;
            const status = qty <= reorder ? 'low stock' : 'in stock';
            return `${item.name} has ${qty} units (${status})`;
          }).join('. ');
          return respond(
            'stock_follow_up',
            `For those items: ${summary}.`,
            result,
            { products: recentProducts }
          );
        }
      }

      const recentCategories = session.recentCategories.slice(0, 3);
      if (recentCategories.length > 0) {
        const placeholders = recentCategories.map(() => '?').join(', ');
        const categorySummary = await db.all(`
          SELECT
            p.category,
            SUM(i.quantity_on_hand) as total_quantity,
            SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) as low_stock_skus
          FROM products p
          JOIN inventory i ON p.id = i.product_id
          WHERE p.category IN (${placeholders})
          GROUP BY p.category
          ORDER BY total_quantity DESC
        `, recentCategories);

        if (categorySummary.length > 0) {
          const summary = categorySummary.map((row: Record<string, unknown>) =>
            `${row.category}: ${row.total_quantity} units total, ${row.low_stock_skus} low-stock SKUs`
          ).join('; ');
          return respond(
            'stock_follow_up',
            `For those categories: ${summary}.`,
            categorySummary,
            { categories: recentCategories }
          );
        }
      }
    }

    if (searchTerm && !isReferenceSearchTerm(searchTerm)) {
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
        return respond(
          'stock',
          `We have ${item.quantity_on_hand} units of ${item.name} at ${item.warehouse}. Status: ${stockStatus}.`,
          result
        );
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
      return respond('stock', `Low stock alert: ${items}`, lowStock);
    }

    return respond('stock', 'All items are well stocked.', []);
  }

  // --- Existing: Search products ---
  if (lowerText.match(/find|search|look for|show me|what do you have/)) {
    const searchMatch = lowerText.match(/(?:find|search|look for|show me|what do you have)\s+([a-z\s]+)/i);
    let searchTerm = searchMatch ? searchMatch[1].trim() : '';
    if (isReferenceSearchTerm(searchTerm) && FOLLOW_UP_REFERENCE_RE.test(lowerText)) {
      searchTerm = session.recentProducts[0] || session.recentCategories[0] || '';
    }

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
      return respond('search_products', `Found ${result.length} items: ${items}`, result);
    }
    return respond('search_products', `No products found matching "${searchTerm}"`, []);
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
        return respond('category_inventory', `${category} inventory: ${items}`, result, { categories: [category] });
      }
    }
  }

  // Greeting
  if (lowerText.match(/hello|hi|hey/)) {
    return respond(
      'greeting',
      "Hello! I'm your U.S. Trading sales assistant. Ask me about today's hot items, top sellers by territory, back-in-stock alerts, Weee or Sayweee reviews, or inventory levels.",
      null
    );
  }

  // Help
  if (lowerText.match(/help|what can you do/)) {
    return respond(
      'help',
      "I can help with: today's Weee/Sayweee hot items, talking points, cross-sell pairings, top sellers by territory, category trends, back-in-stock alerts, Weee reviews, and inventory checks. What would you like to know?",
      null
    );
  }

  return respond(
    'fallback',
    "I can help with hot items, top sellers, back-in-stock alerts, Weee reviews, and inventory. Try asking 'What are today's hot items?' or 'Any back-in-stock alerts?'",
    null
  );
}

export default { setupElevenLabsVoice, ELEVENLABS_AGENT_ID };
