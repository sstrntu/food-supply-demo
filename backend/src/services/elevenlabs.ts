import { WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db';
import { ELEVENLABS_AGENT_ID, ANTHROPIC_API_KEY } from '../config';

export { ELEVENLABS_AGENT_ID };

// Store active sessions
const activeSessions = new Map<string, WebSocket>();

const QUERY_TIMEOUT_MS = 12000; // increased to accommodate AI classification + DB query

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Query timeout')), ms);
    }),
  ]);
}

// Cached active weee date (only changes once per day)
let cachedWeeeDate: { value: string; expiry: number } | null = null;
const WEEE_DATE_CACHE_MS = 60 * 60 * 1000; // 1 hour

// --- AI Intent Classification via Claude tool_use ---

const voiceTools: Anthropic.Tool[] = [
  {
    name: 'get_hot_items',
    description: 'Get trending hot items from Weee/Sayweee marketplace today',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'match_catalog',
    description: 'Check which Weee hot items we carry or have close alternatives for',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_talking_points',
    description: 'Get in-store sales talking points or pitch scripts for today\'s hot items',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_cross_sell',
    description: 'Get cross-sell, bundle, or add-on pairing recommendations',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_universal_pitch',
    description: 'Get a single universal pitch sentence for every store today',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_top_skus',
    description: 'Get top selling products/SKUs by sales territory or region',
    input_schema: {
      type: 'object' as const,
      properties: {
        territory: {
          type: 'string',
          enum: ['Chicago/Midwest', 'West Coast', 'East Coast', 'South'],
          description: 'Sales territory. Map informal: chi-town/midwest→Chicago/Midwest, cali/LA/west→West Coast, NY/east→East Coast, TX/FL→South',
        },
        days: { type: 'number', description: 'Lookback in days (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'get_category_trends',
    description: 'Category performance trends for a customer vs peer stores',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_hint: {
          type: 'string',
          description: 'Any identifying info: name, store type, or context phrase ("biggest account", "top buyer", "Korean grocery on Clark")',
        },
        sort_context: {
          type: 'string',
          enum: ['top_revenue', 'most_active', 'alphabetical'],
          description: 'How to pick customer when no name given. "biggest/top"→top_revenue, "recent/active"→most_active',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_back_in_stock',
    description: 'Back-in-stock alerts — products now available again, with customers to call',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_reviews',
    description: 'Get Weee/Sayweee customer reviews and ratings for products',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_hint: {
          type: 'string',
          description: 'Product name even if misspelled or informal ("pocky sticks", "that coconut milk", "ramyun")',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_weee_performance',
    description: 'Our overall Weee/Sayweee marketplace sales performance and stats',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'check_stock',
    description: 'Check inventory/stock levels for a product, or get low stock alerts if no product specified',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_hint: { type: 'string', description: 'Product name or category to check' },
      },
      required: [],
    },
  },
  {
    name: 'search_products',
    description: 'Search/find products in our catalog by name or category',
    input_schema: {
      type: 'object' as const,
      properties: {
        search_term: { type: 'string', description: 'What to search for' },
      },
      required: ['search_term'],
    },
  },
  {
    name: 'get_category_inventory',
    description: 'Get inventory for a product category (rice, noodles, sauces, frozen, snacks, beverages, spices)',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['Rice & Grains', 'Noodles', 'Sauces', 'Frozen', 'Snacks', 'Beverages', 'Spices'],
          description: 'Product category. Map informal: "pasta/ramen"→Noodles, "drinks/juice/tea"→Beverages, "chips/cookies"→Snacks',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'greeting',
    description: 'User is just saying hello/hi/hey',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'help',
    description: 'User wants to know what this assistant can do',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
];

const AI_ROUTER_SYSTEM = `You are a voice command router for a U.S. Asian food distributor's sales team. Parse the user's spoken command and call the single most appropriate tool.

Handle slang, mispronunciations, informal speech, and ambiguous phrasing:
- "yo what's poppin on weee" → get_hot_items
- "gimme the pitch" → get_universal_pitch
- "how's Kim's mart doing vs others" → get_category_trends {customer_hint:"Kim's mart"}
- "chi-town numbers" → get_top_skus {territory:"Chicago/Midwest"}
- "any coconut milk reviews" → get_reviews {product_hint:"coconut milk"}
- "who do I need to call" → get_back_in_stock
- "what should I push today" → get_hot_items
- "how's my biggest account" → get_category_trends {sort_context:"top_revenue"}
- "what drinks do we have" → get_category_inventory {category:"Beverages"}`;

async function classifyWithAI(text: string): Promise<{ tool: string; params: Record<string, any> } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: AI_ROUTER_SYSTEM,
      tools: voiceTools,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: text }],
    });

    const toolUse = response.content.find((c) => c.type === 'tool_use');
    if (toolUse && toolUse.type === 'tool_use') {
      console.log(`AI router: "${text}" → ${toolUse.name}`, toolUse.input);
      return { tool: toolUse.name, params: (toolUse.input as Record<string, any>) || {} };
    }
  } catch (e) {
    console.warn('AI classification failed, falling back to regex:', (e as Error).message);
  }
  return null;
}

// --- Smart Customer Resolution ---

async function resolveCustomer(db: any, hint?: string, sortContext?: string): Promise<any> {
  if (hint) {
    // Try name match
    let row = await db.get(
      'SELECT id, name, store_type, territory FROM customers WHERE name LIKE ? LIMIT 1',
      [`%${hint}%`]
    );
    if (row) return row;

    // Try store_type match
    row = await db.get(
      'SELECT id, name, store_type, territory FROM customers WHERE store_type LIKE ? LIMIT 1',
      [`%${hint}%`]
    );
    if (row) return row;

    // Try territory match
    row = await db.get(
      'SELECT id, name, store_type, territory FROM customers WHERE territory LIKE ? LIMIT 1',
      [`%${hint}%`]
    );
    if (row) return row;
  }

  // Context-aware default sorting
  const orderClause =
    sortContext === 'most_active'
      ? 'MAX(sh.sale_date) DESC'
      : sortContext === 'alphabetical'
        ? 'c.name ASC'
        : 'SUM(sh.revenue) DESC'; // top_revenue is default

  return await db.get(`
    SELECT c.id, c.name, c.store_type, c.territory
    FROM customers c
    JOIN sales_history sh ON c.id = sh.customer_id
    WHERE sh.sale_date >= date('now', '-30 days')
    GROUP BY c.id ORDER BY ${orderClause} LIMIT 1
  `);
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
      const message = JSON.parse(data.toString());

      if (message.type === 'voice_command' || message.type === 'text') {
        const response = await withTimeout(processVoiceCommand(message.text), QUERY_TIMEOUT_MS);
        ws.send(JSON.stringify({ type: 'response', ...response }));
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'Query timeout';
      ws.send(JSON.stringify({
        type: 'error',
        message: isTimeout ? 'Request timed out, please try again' : 'Failed to process your request'
      }));
    }
  });

  ws.on('close', () => {
    activeSessions.delete(sessionId);
  });
}

async function processVoiceCommand(text: string): Promise<{ text: string; data?: unknown }> {
  const lowerText = text.toLowerCase();
  const [db, today] = await Promise.all([getDb(), Promise.resolve(new Date().toISOString().split('T')[0])]);

  // --- AI Classification (try first, fall back to regex) ---
  const intent = await classifyWithAI(text);
  const toolName = intent?.tool;
  const params = intent?.params || {};

  // Routes to a handler if AI matched the tool OR regex matches (fallback)
  const isMatch = (tool: string, regex: RegExp) =>
    toolName === tool || (!toolName && regex.test(lowerText));

  // Returns most recent date with hot items data, cached for 1 hour
  async function getActiveWeeeDate(): Promise<string> {
    if (cachedWeeeDate && Date.now() < cachedWeeeDate.expiry) return cachedWeeeDate.value;
    const row = await db.get(`SELECT weee_date FROM hot_items ORDER BY weee_date DESC LIMIT 1`) as any;
    const value = row?.weee_date || today;
    cachedWeeeDate = { value, expiry: Date.now() + WEEE_DATE_CACHE_MS };
    return value;
  }

  // Regex fallback for product name extraction
  function extractProductName(phrase: string): string {
    const patterns = [
      /(?:for|about|on|of)\s+([a-z][a-z\s]{1,30}?)(?:\s+(?:reviews?|stock|inventory|on weee|from weee)|\?|$)/i,
      /(?:have|got|carry|do we have|check)\s+(?:any\s+)?([a-z][a-z\s]{1,30}?)(?:\s+(?:left|in stock|available)|\?|$)/i,
      /(?:levels?|units?|quantity)\s+(?:for|of)\s+([a-z][a-z\s]{1,30}?)(?:\?|$)/i,
    ];
    for (const p of patterns) {
      const m = phrase.match(p);
      if (m) return m[1].trim();
    }
    return '';
  }

  // Regex fallback for territory
  function resolveTerritory(phrase: string): string {
    const aliases: [string, string][] = [
      ['west coast', 'West Coast'], ['east coast', 'East Coast'],
      ['chicago/midwest', 'Chicago/Midwest'], ['chicago', 'Chicago/Midwest'],
      ['midwest', 'Chicago/Midwest'], ['california', 'West Coast'],
      ['west', 'West Coast'], ['new york', 'East Coast'], ['east', 'East Coast'],
      ['florida', 'South'], ['texas', 'South'], ['south', 'South'],
    ];
    for (const [alias, territory] of aliases) {
      if (phrase.includes(alias)) return territory;
    }
    return 'Chicago/Midwest';
  }

  // --- Greeting ---
  if (isMatch('greeting', /^(hello|hi+|hey)[,!.\s]*$/)) {
    return {
      text: "Hello! I'm your U.S. Trading sales assistant. Ask me about today's hot items, top sellers by territory, back-in-stock alerts, Weee or Sayweee reviews, or inventory levels.",
      data: null
    };
  }

  // --- Help ---
  if (isMatch('help', /\bhelp\b|what can you do/)) {
    return {
      text: "I can help with: today's Weee/Sayweee hot items, talking points, cross-sell pairings, top sellers by territory, category trends, back-in-stock alerts, Weee reviews, and inventory checks. What would you like to know?",
      data: null
    };
  }

  // --- UC5: Universal pitch ---
  if (isMatch('get_universal_pitch', /universal pitch|one sentence|one pitch|every store|today.*message/)) {
    const activeDate = await getActiveWeeeDate();
    const result = await db.get(`
      SELECT universal_pitch FROM hot_items
      WHERE weee_date = ? AND universal_pitch IS NOT NULL
      ORDER BY weee_rank ASC LIMIT 1
    `, [activeDate]);
    return {
      text: (result as any)?.universal_pitch || 'Focus on trending Asian staples — coconut-based and snack items are surging on Weee right now.',
    };
  }

  // --- UC1: Hot items brief ---
  if (isMatch('get_hot_items', /hot items?|(?:weee|sayweee).*trending|what.*push|today.*brief|top.*(?:weee|sayweee)/)) {
    const activeDate = await getActiveWeeeDate();
    const items = await db.all(`
      SELECT h.weee_rank, h.weee_product_name, h.match_type, p.name as our_product
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC LIMIT 5
    `, [activeDate]);

    if (!items.length) return { text: 'No hot items data available. Please check back later.' };
    const list = (items as any[]).map(i => `${i.weee_rank}. ${i.weee_product_name}`).join(', ');
    return { text: `Today's top Weee (Sayweee) hot items: ${list}.`, data: items };
  }

  // --- UC2: Match to catalog ---
  if (isMatch('match_catalog', /do we carry|which.*carry|match.*catalog|closest alternative|what.*alternative/)) {
    const activeDate = await getActiveWeeeDate();
    const items = await db.all(`
      SELECT h.weee_product_name, h.match_type, h.match_notes, p.name as our_product
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
    `, [activeDate]);

    const matched = (items as any[]).filter(i => i.match_type !== 'none');
    const unmatched = (items as any[]).filter(i => i.match_type === 'none');
    let response = `We match ${matched.length} of today's ${items.length} hot items. `;
    response += matched.slice(0, 3).map((i: any) => i.match_notes).join('. ');
    if (unmatched.length) response += ` No match for: ${unmatched.map((i: any) => i.weee_product_name).join(', ')}.`;
    return { text: response, data: items };
  }

  // --- Reviews ---
  if (isMatch('get_reviews', /\b(reviews?|feedback|rating|comment)\b|what.*customers?.*say|(?:weee|sayweee).*comment/)) {
    const productName = params.product_hint || extractProductName(lowerText);
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

  // --- UC3: Talking points ---
  if (isMatch('get_talking_points', /talking point|what should.*say|in.?store.*pitch|how.*pitch/)) {
    const activeDate = await getActiveWeeeDate();
    const items = await db.all(`
      SELECT weee_product_name, talking_point FROM hot_items
      WHERE weee_date = ? AND talking_point IS NOT NULL
      ORDER BY weee_rank ASC LIMIT 3
    `, [activeDate]);

    const points = (items as any[]).map(i => `For ${i.weee_product_name}: ${i.talking_point}`).join(' | ');
    return { text: points || 'No talking points available for today.', data: items };
  }

  // --- UC4: Cross-sell ---
  if (isMatch('get_cross_sell', /cross.?sell|add.?on|pairs? with|complementary|what goes with|bundle/)) {
    const activeDate = await getActiveWeeeDate();
    const items = await db.all(`
      SELECT h.weee_product_name, p.name as our_product, p2.name as paired_product, pp.pairing_reason
      FROM hot_items h
      JOIN products p ON h.matched_product_id = p.id
      JOIN product_pairings pp ON p.id = pp.product_id
      JOIN products p2 ON pp.paired_product_id = p2.id
      WHERE h.weee_date = ? AND h.match_type != 'none'
      ORDER BY h.weee_rank ASC LIMIT 3
    `, [activeDate]);

    if (!(items as any[]).length) return { text: "No cross-sell pairings found for today's hot items." };
    const recs = (items as any[]).map(i => `Pair ${i.our_product} with ${i.paired_product}: ${i.pairing_reason}`).join('. ');
    return { text: recs, data: items };
  }

  // --- UC6: Top SKUs by territory ---
  if (isMatch('get_top_skus', /top sk|top sell|best sell|my accounts|territory.*sell|prioritize/)) {
    // AI extracts territory directly; regex uses alias mapping
    const territory = params.territory || resolveTerritory(lowerText);
    const daysMatch = lowerText.match(/(\d+)\s*days?/);
    const days = params.days || (daysMatch ? parseInt(daysMatch[1]) : 30);

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

  // --- UC7: Category trends (AI-powered customer resolution) ---
  if (isMatch('get_category_trends', /category trend|trending up|trending down|compared to|similar customer|benchmark/)) {
    // AI provides customer_hint + sort_context; regex falls back to name extraction
    let customerRow: any;
    if (toolName) {
      // AI path: smart resolution with hint and context
      customerRow = await resolveCustomer(db, params.customer_hint, params.sort_context);
    } else {
      // Regex fallback
      const nameMatch = lowerText.match(/(?:for|about)\s+([a-z][a-z\s]{1,30}?)(?:\s+(?:store|customer|account|vs|compared)|\?|$)/i);
      if (nameMatch) {
        customerRow = await resolveCustomer(db, nameMatch[1].trim());
      }
      if (!customerRow) {
        customerRow = await resolveCustomer(db);
      }
    }
    if (!customerRow) return { text: 'No customer data available.' };

    const [customerCategories, peerCategories] = await Promise.all([
      db.all(`
        SELECT p.category, SUM(sh.revenue) as revenue
        FROM sales_history sh
        JOIN products p ON sh.product_id = p.id
        WHERE sh.customer_id = ? AND sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
        GROUP BY p.category ORDER BY revenue DESC
      `, [customerRow.id]),
      db.all(`
        SELECT category, AVG(sub_revenue) as avg_revenue FROM (
          SELECT p2.category, SUM(sh2.revenue) as sub_revenue
          FROM sales_history sh2
          JOIN products p2 ON sh2.product_id = p2.id
          JOIN customers c2 ON sh2.customer_id = c2.id
          WHERE c2.store_type = ? AND c2.id != ? AND sh2.sale_date >= date('now', '-30 days') AND sh2.was_out_of_stock = 0
          GROUP BY sh2.customer_id, p2.category
        ) GROUP BY category
      `, [customerRow.store_type, customerRow.id]),
    ]);

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
  if (isMatch('get_back_in_stock', /back.*stock|out.*stock|sales.*drop|who.*call|restock alert|stockout/)) {
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

  // --- Weee performance ---
  if (isMatch('get_weee_performance', /(?:weee|sayweee).*sales|(?:weee|sayweee).*performance|(?:weee|sayweee).*listing|how.*doing.*(?:weee|sayweee)|our.*(?:weee|sayweee)/)) {
    const [topProducts, stats] = await Promise.all([
      db.all(`
        SELECT name, sku, weee_rating, weee_review_count, weee_weekly_sold
        FROM products WHERE weee_listed = 1
        ORDER BY weee_weekly_sold DESC LIMIT 5
      `),
      db.get(`
        SELECT COUNT(*) as total, AVG(weee_rating) as avg_rating, SUM(weee_weekly_sold) as total_sold
        FROM products WHERE weee_listed = 1
      `),
    ]);

    const s = stats as any;
    const list = (topProducts as any[]).map(p =>
      `${p.name}: ${p.weee_weekly_sold} sold, ${p.weee_rating} stars`
    ).join(', ');
    return {
      text: `We have ${s.total} products on Weee (Sayweee) with an average rating of ${s.avg_rating.toFixed(1)}. Top sellers this week: ${list}.`,
      data: topProducts,
    };
  }

  // --- Stock levels ---
  if (isMatch('check_stock', /\b(stock|inventory|units)\b|how (many|much).*(have|left|carry|got)/)) {
    // AI extracts product_hint; regex uses pattern extraction
    const productName = params.product_hint || extractProductName(lowerText);

    if (productName) {
      const result = await db.all(`
        SELECT p.name, p.category, i.quantity_on_hand, i.reorder_point, w.name as warehouse
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        JOIN warehouses w ON i.warehouse_id = w.id
        WHERE p.name LIKE ? OR p.category LIKE ?
        LIMIT 5
      `, [`%${productName}%`, `%${productName}%`]);

      if (result.length > 0) {
        if (result.length === 1) {
          const item = result[0] as Record<string, unknown>;
          const stockStatus = (item.quantity_on_hand as number) <= (item.reorder_point as number)
            ? 'low stock' : 'in stock';
          return {
            text: `We have ${item.quantity_on_hand} units of ${item.name} at ${item.warehouse}. Status: ${stockStatus}.`,
            data: result
          };
        }
        const summary = result.slice(0, 3).map((r: Record<string, unknown>) => {
          const status = (r.quantity_on_hand as number) <= (r.reorder_point as number) ? 'LOW' : 'ok';
          return `${r.name}: ${r.quantity_on_hand} units (${status})`;
        }).join(', ');
        return {
          text: `Found ${result.length} matches: ${summary}.`,
          data: result
        };
      }
    }

    const lowStock = await db.all(`
      SELECT p.name, i.quantity_on_hand, i.reorder_point
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY i.quantity_on_hand ASC LIMIT 5
    `);

    if (lowStock.length > 0) {
      const items = lowStock.map((r: Record<string, unknown>) =>
        `${r.name} (${r.quantity_on_hand} units)`
      ).join(', ');
      return { text: `Low stock alert: ${items}`, data: lowStock };
    }

    return { text: 'All items are well stocked.', data: [] };
  }

  // --- Search products ---
  if (isMatch('search_products', /find|search|look for|show me|what do you have/)) {
    const searchTerm = params.search_term || (() => {
      const m = lowerText.match(/(?:find|search|look for|show me|what do you have)\s+([a-z\s]+)/i);
      return m ? m[1].trim() : '';
    })();

    const result = await db.all(`
      SELECT name, category, unit_price, sku, i.quantity_on_hand
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE (? = '' OR p.name LIKE ? OR p.category LIKE ?)
      ORDER BY p.category, p.name LIMIT 10
    `, [searchTerm, `%${searchTerm}%`, `%${searchTerm}%`]);

    if (result.length > 0) {
      const items = result.map((r: Record<string, unknown>) =>
        `${r.name} (${r.quantity_on_hand || 0} in stock)`
      ).join(', ');
      return { text: `Found ${result.length} items: ${items}`, data: result };
    }
    return { text: `No products found matching "${searchTerm}"`, data: [] };
  }

  // --- Category inventory ---
  if (isMatch('get_category_inventory', /\b(rice|grain|noodle|pasta|ramen|sauce|condiment|frozen|freezer|snack|chip|cracker|cookie|beverage|drink|juice|tea|spice|herb|seasoning)s?\b/)) {
    // AI extracts the exact category name; regex maps aliases
    let category = params.category;
    if (!category) {
      const categoryAliases: Record<string, string> = {
        'rice': 'Rice & Grains', 'grain': 'Rice & Grains',
        'noodle': 'Noodles', 'pasta': 'Noodles', 'ramen': 'Noodles',
        'sauce': 'Sauces', 'condiment': 'Sauces',
        'frozen': 'Frozen', 'freezer': 'Frozen',
        'snack': 'Snacks', 'chip': 'Snacks', 'cracker': 'Snacks', 'cookie': 'Snacks',
        'beverage': 'Beverages', 'drink': 'Beverages', 'juice': 'Beverages', 'tea': 'Beverages',
        'spice': 'Spices', 'herb': 'Spices', 'seasoning': 'Spices',
      };
      for (const [keyword, cat] of Object.entries(categoryAliases)) {
        if (new RegExp(`\\b${keyword}s?\\b`).test(lowerText)) { category = cat; break; }
      }
    }

    if (category) {
      const result = await db.all(`
        SELECT p.name, i.quantity_on_hand
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        WHERE p.category = ?
        ORDER BY i.quantity_on_hand ASC LIMIT 5
      `, [category]);

      if (result.length > 0) {
        const items = result.map((r: Record<string, unknown>) =>
          `${r.name}: ${r.quantity_on_hand}`
        ).join(', ');
        return { text: `${category} inventory: ${items}`, data: result };
      }
    }
  }

  return {
    text: "I can help with hot items, top sellers, back-in-stock alerts, Weee reviews, and inventory. Try asking 'What are today's hot items?' or 'Any back-in-stock alerts?'",
    data: null
  };
}

export default { setupElevenLabsVoice, ELEVENLABS_AGENT_ID };
