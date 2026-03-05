import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db';
import { ANTHROPIC_API_KEY } from '../config';

const router = Router();

// --- System prompt: Claude as the voice brain ---

const VOICE_SYSTEM = `You are the voice AI sales assistant for U.S. Trading, an Asian food distributor. You help field sales reps via voice conversation.

RULES FOR VOICE RESPONSES:
- Keep responses SHORT: 1-3 sentences max. You are being read aloud by text-to-speech.
- Lead with the most important fact first.
- Use natural conversational language, not lists or bullet points.
- Round numbers for speech: say "about twelve hundred" not "$1,247.53".
- Never say "I don't have that data" without calling a tool first.
- Always call the appropriate tool before answering any data question.
- Handle slang, informal speech, and mispronunciations gracefully.
- If the user references a customer vaguely ("my biggest account", "that Korean place"), pass whatever context you have to customer_hint.
- For follow-up questions, use conversation context to fill in missing parameters.`;

// --- Tool definitions: Claude calls these to get real data ---

const dataTools: Anthropic.Tool[] = [
  {
    name: 'query_hot_items',
    description: 'Get today\'s trending hot items from Weee/Sayweee marketplace with match info',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_catalog_matches',
    description: 'Check which Weee hot items we carry or have close alternatives for',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_talking_points',
    description: 'Get sales talking points for today\'s hot items',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_cross_sell',
    description: 'Get cross-sell and bundle pairing recommendations for hot items',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_universal_pitch',
    description: 'Get a universal one-sentence sales pitch for all stores today',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_top_skus',
    description: 'Get top selling products by territory/region',
    input_schema: {
      type: 'object' as const,
      properties: {
        territory: {
          type: 'string',
          enum: ['Chicago/Midwest', 'West Coast', 'East Coast', 'South'],
          description: 'Sales territory. Map: chi-town/midwest→Chicago/Midwest, cali/LA→West Coast, NY→East Coast, TX/FL→South',
        },
        days: { type: 'number', description: 'Lookback days (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'query_customer_trends',
    description: 'Get category trend analysis for a customer vs peer stores of the same type',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_hint: {
          type: 'string',
          description: 'Customer name, store type, or context phrase ("biggest account", "Korean grocery", "most active buyer")',
        },
        sort_by: {
          type: 'string',
          enum: ['top_revenue', 'most_active', 'alphabetical'],
          description: 'How to pick the customer if name doesn\'t match. Default: top_revenue',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_back_in_stock',
    description: 'Get back-in-stock alerts: products now available again with customers to call',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_reviews',
    description: 'Get Weee/Sayweee customer reviews for a product or overall',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: { type: 'string', description: 'Product name to search reviews for (fuzzy match)' },
      },
      required: [],
    },
  },
  {
    name: 'query_weee_performance',
    description: 'Get our overall Weee/Sayweee marketplace performance and top sellers',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_stock',
    description: 'Check inventory/stock levels for a product or get all low-stock alerts',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: { type: 'string', description: 'Product name or category to check (fuzzy match). Omit to get low-stock alerts.' },
      },
      required: [],
    },
  },
  {
    name: 'query_products',
    description: 'Search products in our catalog by name or category',
    input_schema: {
      type: 'object' as const,
      properties: {
        search_term: { type: 'string', description: 'Product name, SKU, or category to search' },
      },
      required: ['search_term'],
    },
  },
];

// --- Tool executors: run DB queries and return raw data ---

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];

  // Get most recent weee date with data
  async function activeDate(): Promise<string> {
    const row = await db.get('SELECT weee_date FROM hot_items ORDER BY weee_date DESC LIMIT 1') as any;
    return row?.weee_date || today;
  }

  // Smart customer resolution
  async function findCustomer(hint?: string, sortBy?: string): Promise<any> {
    if (hint) {
      for (const col of ['name', 'store_type', 'territory']) {
        const row = await db.get(
          `SELECT id, name, store_type, territory FROM customers WHERE ${col} LIKE ? LIMIT 1`,
          [`%${hint}%`]
        );
        if (row) return row;
      }
    }
    const order = sortBy === 'most_active' ? 'MAX(sh.sale_date) DESC'
      : sortBy === 'alphabetical' ? 'c.name ASC'
      : 'SUM(sh.revenue) DESC';
    return db.get(`
      SELECT c.id, c.name, c.store_type, c.territory FROM customers c
      JOIN sales_history sh ON c.id = sh.customer_id
      WHERE sh.sale_date >= date('now', '-30 days')
      GROUP BY c.id ORDER BY ${order} LIMIT 1
    `);
  }

  try {
    switch (name) {
      case 'query_hot_items': {
        const d = await activeDate();
        const items = await db.all(`
          SELECT h.weee_rank, h.weee_product_name, h.match_type, p.name as our_product
          FROM hot_items h LEFT JOIN products p ON h.matched_product_id = p.id
          WHERE h.weee_date = ? ORDER BY h.weee_rank ASC LIMIT 5
        `, [d]);
        return JSON.stringify({ date: d, items });
      }

      case 'query_catalog_matches': {
        const d = await activeDate();
        const items = await db.all(`
          SELECT h.weee_product_name, h.match_type, h.match_notes, p.name as our_product
          FROM hot_items h LEFT JOIN products p ON h.matched_product_id = p.id
          WHERE h.weee_date = ? ORDER BY h.weee_rank ASC
        `, [d]);
        const matched = items.filter((i: any) => i.match_type !== 'none').length;
        return JSON.stringify({ total: items.length, matched, items });
      }

      case 'query_talking_points': {
        const d = await activeDate();
        const items = await db.all(`
          SELECT weee_product_name, talking_point FROM hot_items
          WHERE weee_date = ? AND talking_point IS NOT NULL
          ORDER BY weee_rank ASC LIMIT 3
        `, [d]);
        return JSON.stringify({ items });
      }

      case 'query_cross_sell': {
        const d = await activeDate();
        const items = await db.all(`
          SELECT h.weee_product_name, p.name as our_product, p2.name as paired_product, pp.pairing_reason
          FROM hot_items h
          JOIN products p ON h.matched_product_id = p.id
          JOIN product_pairings pp ON p.id = pp.product_id
          JOIN products p2 ON pp.paired_product_id = p2.id
          WHERE h.weee_date = ? AND h.match_type != 'none'
          ORDER BY h.weee_rank ASC LIMIT 3
        `, [d]);
        return JSON.stringify({ items });
      }

      case 'query_universal_pitch': {
        const d = await activeDate();
        const row = await db.get(`
          SELECT universal_pitch FROM hot_items
          WHERE weee_date = ? AND universal_pitch IS NOT NULL
          ORDER BY weee_rank ASC LIMIT 1
        `, [d]);
        return JSON.stringify({ pitch: (row as any)?.universal_pitch || null });
      }

      case 'query_top_skus': {
        const territory = input.territory || 'Chicago/Midwest';
        const days = input.days || 30;
        const items = await db.all(`
          SELECT p.name, p.sku, SUM(sh.quantity_sold) as total_qty,
            SUM(sh.revenue) as revenue, i.quantity_on_hand, i.reorder_point
          FROM sales_history sh
          JOIN products p ON sh.product_id = p.id
          JOIN customers c ON sh.customer_id = c.id
          JOIN inventory i ON p.id = i.product_id
          WHERE c.territory = ? AND sh.sale_date >= date('now', '-' || ? || ' days') AND sh.was_out_of_stock = 0
          GROUP BY p.id ORDER BY revenue DESC LIMIT 5
        `, [territory, days]);
        return JSON.stringify({ territory, days, items });
      }

      case 'query_customer_trends': {
        const customer = await findCustomer(input.customer_hint, input.sort_by);
        if (!customer) return JSON.stringify({ error: 'No customer found' });

        const [categories, peers] = await Promise.all([
          db.all(`
            SELECT p.category, SUM(sh.revenue) as revenue
            FROM sales_history sh JOIN products p ON sh.product_id = p.id
            WHERE sh.customer_id = ? AND sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
            GROUP BY p.category ORDER BY revenue DESC
          `, [customer.id]),
          db.all(`
            SELECT category, AVG(sub_revenue) as avg_revenue FROM (
              SELECT p2.category, SUM(sh2.revenue) as sub_revenue
              FROM sales_history sh2
              JOIN products p2 ON sh2.product_id = p2.id
              JOIN customers c2 ON sh2.customer_id = c2.id
              WHERE c2.store_type = ? AND c2.id != ? AND sh2.sale_date >= date('now', '-30 days') AND sh2.was_out_of_stock = 0
              GROUP BY sh2.customer_id, p2.category
            ) GROUP BY category
          `, [customer.store_type, customer.id]),
        ]);

        const peerMap: Record<string, number> = {};
        (peers as any[]).forEach(p => { peerMap[p.category] = p.avg_revenue; });
        const trends = (categories as any[]).map(c => {
          const peerAvg = peerMap[c.category] || c.revenue;
          const pct = peerAvg > 0 ? Math.round(((c.revenue - peerAvg) / peerAvg) * 100) : 0;
          return { category: c.category, revenue: Math.round(c.revenue), vs_peers_pct: pct };
        });

        return JSON.stringify({ customer: { name: customer.name, store_type: customer.store_type, territory: customer.territory }, trends });
      }

      case 'query_back_in_stock': {
        const alerts = await db.all(`
          SELECT p.name as product, i.quantity_on_hand as stock, c.name as customer,
            c.phone, c.account_manager,
            SUM(CASE WHEN sh.was_out_of_stock = 1 THEN 1 ELSE 0 END) as oos_days
          FROM sales_history sh
          JOIN products p ON sh.product_id = p.id
          JOIN customers c ON sh.customer_id = c.id
          JOIN inventory i ON p.id = i.product_id
          WHERE sh.sale_date >= date('now', '-14 days') AND i.quantity_on_hand > 0
          GROUP BY p.id, c.id HAVING oos_days > 0
          ORDER BY oos_days DESC LIMIT 5
        `);
        return JSON.stringify({ alerts });
      }

      case 'query_reviews': {
        const productName = input.product_name;
        let reviews;
        if (productName) {
          reviews = await db.all(`
            SELECT p.name, wr.reviewer_name, wr.rating, wr.comment, wr.review_date
            FROM weee_reviews wr JOIN products p ON wr.product_id = p.id
            WHERE p.name LIKE ? ORDER BY wr.review_date DESC LIMIT 5
          `, [`%${productName}%`]);
        } else {
          reviews = await db.all(`
            SELECT p.name, wr.reviewer_name, wr.rating, wr.comment, wr.review_date
            FROM weee_reviews wr JOIN products p ON wr.product_id = p.id
            ORDER BY wr.review_date DESC LIMIT 5
          `);
        }
        return JSON.stringify({ search: productName || 'all', reviews });
      }

      case 'query_weee_performance': {
        const [top, stats] = await Promise.all([
          db.all(`SELECT name, weee_rating, weee_weekly_sold FROM products WHERE weee_listed = 1 ORDER BY weee_weekly_sold DESC LIMIT 5`),
          db.get(`SELECT COUNT(*) as total, AVG(weee_rating) as avg_rating, SUM(weee_weekly_sold) as total_sold FROM products WHERE weee_listed = 1`),
        ]);
        return JSON.stringify({ stats, top_sellers: top });
      }

      case 'query_stock': {
        const productName = input.product_name;
        if (productName) {
          const items = await db.all(`
            SELECT p.name, p.category, i.quantity_on_hand, i.reorder_point, w.name as warehouse
            FROM products p
            JOIN inventory i ON p.id = i.product_id
            JOIN warehouses w ON i.warehouse_id = w.id
            WHERE p.name LIKE ? OR p.category LIKE ? LIMIT 5
          `, [`%${productName}%`, `%${productName}%`]);
          return JSON.stringify({ search: productName, items });
        }
        const lowStock = await db.all(`
          SELECT p.name, i.quantity_on_hand, i.reorder_point
          FROM products p JOIN inventory i ON p.id = i.product_id
          WHERE i.quantity_on_hand <= i.reorder_point
          ORDER BY i.quantity_on_hand ASC LIMIT 5
        `);
        return JSON.stringify({ low_stock_alerts: lowStock });
      }

      case 'query_products': {
        const term = input.search_term || '';
        const items = await db.all(`
          SELECT p.name, p.category, p.unit_price, p.sku, i.quantity_on_hand
          FROM products p LEFT JOIN inventory i ON p.id = i.product_id
          WHERE p.name LIKE ? OR p.category LIKE ?
          ORDER BY p.name LIMIT 10
        `, [`%${term}%`, `%${term}%`]);
        return JSON.stringify({ search: term, items });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message });
  }
}

// --- OpenAI-compatible Chat Completions endpoint ---
// ElevenLabs Custom LLM sends requests here in OpenAI format.
// We translate to Claude, run tool loops, and return OpenAI format.

router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  try {
    const { messages: openaiMessages, stream } = req.body;

    // Convert OpenAI messages to Claude format
    const claudeMessages: Anthropic.MessageParam[] = [];
    for (const msg of openaiMessages) {
      if (msg.role === 'system') continue; // We use our own system prompt
      if (msg.role === 'user' || msg.role === 'assistant') {
        claudeMessages.push({ role: msg.role, content: msg.content });
      }
    }

    if (claudeMessages.length === 0) {
      claudeMessages.push({ role: 'user', content: 'Hello' });
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Claude tool loop: call tools until Claude gives a final text response
    let response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: VOICE_SYSTEM,
      tools: dataTools,
      messages: claudeMessages,
    });

    // Process tool calls (Claude may call tools, see results, then respond)
    while (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(c => c.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolBlocks) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input as Record<string, any>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      claudeMessages.push({ role: 'assistant', content: response.content });
      claudeMessages.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: VOICE_SYSTEM,
        tools: dataTools,
        messages: claudeMessages,
      });
    }

    // Extract final text response
    const textBlock = response.content.find(c => c.type === 'text');
    const responseText = textBlock && textBlock.type === 'text' ? textBlock.text : "Sorry, I couldn't process that.";

    if (stream) {
      // Streaming response (SSE) for ElevenLabs
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunk = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        choices: [{
          delta: { role: 'assistant', content: responseText },
          index: 0,
          finish_reason: null,
        }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);

      const done = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(done)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'claude-sonnet-4-6',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: responseText },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
  } catch (error) {
    console.error('Voice LLM error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
});

export default router;
