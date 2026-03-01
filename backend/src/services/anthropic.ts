import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '../config';

export interface AiInsight {
  label: string;
  detail: string;
  type: 'revenue' | 'stock' | 'weee' | 'invoice' | 'opportunity';
}

export interface HotItemInput {
  rank: number;
  weeeName: string;
  ourProductName: string;
  sku: string;
  stockOnHand: number;
  reorderPoint: number;
  weeeWeeklySold: number;
  weeeRating: number;
  crossSellName: string;
  crossSellReason: string;
}

export interface HotItemScript {
  rank: number;
  whatToDo: string;
  crossSell: string;
  script: string;
}

export interface DashboardDataBundle {
  revenue30d: number;
  revenueChangePct: number;
  lowStockCount: number;
  lowStockNames: string[];
  backInStockCount: number;
  backInStockLostRevenue: number;
  backInStockHighPriorityCalls: number;
  overdueCount: number;
  overdueBalance: number;
  dueSoonCount: number;
  dueSoonBalance: number;
  hotItemsTotal: number;
  hotItemsMatched: number;
  summaryPitch: string;
  risingSignals: string;
  newSignals: string;
  recurringSignals: string;
  qualityWatchlist: string;
  weeeUnitsWeek: number;
  weeeUnitsWoWPct: number;
  weeeNegativePct: number;
  topOpportunity: string;
  activeAccounts: number;
  channelUnits30d: number;
  hotItems: HotItemInput[];
}

export interface AiResponse {
  insights: AiInsight[];
  hotItemScripts: HotItemScript[];
}

// In-memory cache (global, company-wide data)
let cache: { data: AiResponse; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(): AiResponse | null {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }
  return null;
}

function setCache(data: AiResponse): void {
  cache = { data, timestamp: Date.now() };
}

function buildPrompt(d: DashboardDataBundle): string {
  const hotItemsContext = d.hotItems.length > 0
    ? `\nTOP MATCHED HOT ITEMS (generate scripts for each):\n` +
      d.hotItems.map((item, i) => `
Item ${i + 1}: Weee rank #${item.rank} — ${item.weeeName}
  Our product: ${item.ourProductName} (${item.sku})
  Stock: ${item.stockOnHand} units on hand (reorder at ${item.reorderPoint}) — ${item.stockOnHand > item.reorderPoint ? 'ready to sell' : 'RESTOCK NEEDED'}
  Weee performance: ${item.weeeWeeklySold} units/week on Weee, ${item.weeeRating} star rating
  Cross-sell candidate: ${item.crossSellName || 'none'}${item.crossSellReason ? ` — ${item.crossSellReason}` : ''}`).join('\n')
    : '';

  return `You are a sales intelligence assistant for a U.S. Asian food distributor. Analyze this data and return a JSON object with two arrays.

DASHBOARD DATA:
- 30-day revenue: $${Math.round(d.revenue30d).toLocaleString()} (${d.revenueChangePct > 0 ? '+' : ''}${d.revenueChangePct}% vs prior 30 days)
- Low stock items (${d.lowStockCount}): ${d.lowStockNames.length > 0 ? d.lowStockNames.join(', ') : 'none'}
- Back-in-stock: ${d.backInStockCount} products, $${Math.round(d.backInStockLostRevenue).toLocaleString()} estimated lost revenue to recover, ${d.backInStockHighPriorityCalls} high-priority customer calls
- Overdue invoices: ${d.overdueCount} totaling $${Math.round(d.overdueBalance).toLocaleString()}
- Invoices due within 7 days: ${d.dueSoonCount} totaling $${Math.round(d.dueSoonBalance).toLocaleString()}
- Weee hot items today: ${d.hotItemsTotal} trending, ${d.hotItemsMatched} matched to our catalog
- Today's pitch context: ${d.summaryPitch || 'none'}
- Weee rising signals (gaining popularity): ${d.risingSignals || 'none'}
- New on Weee this week: ${d.newSignals || 'none'}
- Proven recurring sellers on Weee: ${d.recurringSignals || 'none'}
- Weee quality watchlist (negative reviews): ${d.qualityWatchlist || 'none'}
- Our Weee performance: ${d.weeeUnitsWeek} units sold this week (${d.weeeUnitsWoWPct > 0 ? '+' : ''}${d.weeeUnitsWoWPct}% vs last week), ${d.weeeNegativePct}% negative review rate
- Top sales opportunity: ${d.topOpportunity || 'none'}
- Our channels: ${d.activeAccounts} active accounts, ${d.channelUnits30d.toLocaleString()} units sold in 30 days
${hotItemsContext}

TASK 1 — insights array (8-10 items):
Identify the most actionable things for a field sales agent to do RIGHT NOW.
Rules: Prioritize calls, products to push, stock issues, invoices to collect. Lead with the most important. Each must reference specific numbers or product names. Skip categories with zero/none data. Assign type: revenue, stock, weee, invoice, or opportunity.

TASK 2 — hotItemScripts array (one per matched hot item above):
For each matched hot item, generate:
- whatToDo: 1 sentence — specific action (who to call, what to pitch, urgency reason)
- crossSell: 1 sentence — why to pair with the cross-sell product from the customer's buying perspective
- script: 2-3 natural sentences a sales rep says on a phone call, mentioning specific numbers (Weee rank, units sold, stock count)

If no cross-sell candidate is listed for an item, set crossSell to empty string.

Return ONLY this JSON object, no markdown, no explanation:
{"insights":[{"label":"...","detail":"...","type":"revenue|stock|weee|invoice|opportunity"}],"hotItemScripts":[{"rank":1,"whatToDo":"...","crossSell":"...","script":"..."}]}`;
}

export async function generateInsights(data: DashboardDataBundle): Promise<AiResponse> {
  const empty: AiResponse = { insights: [], hotItemScripts: [] };

  const cached = getCached();
  if (cached) {
    console.log('AI insights: serving from cache');
    return cached;
  }

  if (!ANTHROPIC_API_KEY) {
    console.warn('AI insights: ANTHROPIC_API_KEY not configured');
    return empty;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: buildPrompt(data) }],
  });

  let text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Strip markdown fences if present
  text = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();

  const parsed: AiResponse = JSON.parse(text);
  setCache(parsed);
  console.log(`AI insights: ${parsed.insights.length} insights, ${parsed.hotItemScripts.length} hot item scripts`);
  return parsed;
}
