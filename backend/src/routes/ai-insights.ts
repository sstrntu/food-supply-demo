import { Router } from 'express';
import { getDb } from '../db';
import { generateInsights, DashboardDataBundle, HotItemInput } from '../services/anthropic';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];

    // Run all queries in parallel
    const [
      revenue30d,
      revenuePrior,
      lowStockItems,
      invoiceSummary,
      bisRaw,
      hotItemCounts,
      summaryPitchRow,
      channelStats,
      weeeWeekRows,
      hotItemsRaw,
    ] = await Promise.all([
      // Revenue 30d
      db.get(`SELECT COALESCE(SUM(revenue), 0) as total FROM sales_history WHERE sale_date >= date('now', '-30 days') AND was_out_of_stock = 0`),

      // Revenue prior 30d
      db.get(`SELECT COALESCE(SUM(revenue), 0) as total FROM sales_history WHERE sale_date >= date('now', '-60 days') AND sale_date < date('now', '-30 days') AND was_out_of_stock = 0`),

      // Low stock items (names)
      db.all(`SELECT p.name FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.quantity_on_hand <= i.reorder_point ORDER BY CAST(i.quantity_on_hand AS FLOAT) / NULLIF(i.reorder_point, 0) ASC LIMIT 5`),

      // Invoice summary
      db.get(`
        SELECT
          COUNT(CASE WHEN balance_due > 0 AND due_date < date('now') THEN 1 END) as overdue_count,
          COALESCE(SUM(CASE WHEN balance_due > 0 AND due_date < date('now') THEN balance_due ELSE 0 END), 0) as overdue_balance,
          COUNT(CASE WHEN balance_due > 0 AND due_date >= date('now') AND due_date <= date('now', '+7 days') THEN 1 END) as due_soon_count,
          COALESCE(SUM(CASE WHEN balance_due > 0 AND due_date >= date('now') AND due_date <= date('now', '+7 days') THEN balance_due ELSE 0 END), 0) as due_soon_balance
        FROM invoices
      `),

      // Back-in-stock raw data (for lost revenue calc)
      db.all(`
        SELECT
          p.id as product_id, p.name as product_name,
          c.name as customer_name,
          SUM(CASE WHEN sh.was_out_of_stock = 1 THEN 1 ELSE 0 END) as oos_days,
          SUM(CASE WHEN sh.was_out_of_stock = 0 THEN sh.revenue ELSE 0 END) as normal_revenue,
          COUNT(CASE WHEN sh.was_out_of_stock = 0 THEN 1 END) as normal_days
        FROM sales_history sh
        JOIN products p ON sh.product_id = p.id
        JOIN customers c ON sh.customer_id = c.id
        JOIN inventory i ON p.id = i.product_id
        WHERE sh.sale_date >= date('now', '-14 days')
        GROUP BY p.id, c.id
        HAVING oos_days > 0 AND i.quantity_on_hand > 0
      `),

      // Hot items counts
      db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN match_type != 'none' THEN 1 END) as matched
        FROM hot_items WHERE weee_date = ?
      `, [today]),

      // Summary pitch
      db.get(`SELECT talking_point FROM hot_items WHERE weee_date = ? AND weee_rank = 1`, [today]),

      // Channel stats (30d)
      db.get(`
        SELECT
          COALESCE(SUM(quantity_sold), 0) as units_30d,
          COUNT(DISTINCT customer_id) as active_accounts
        FROM sales_history
        WHERE sale_date >= date('now', '-30 days') AND was_out_of_stock = 0
      `),

      // Weee weekly data (latest 8 weeks)
      db.all(`SELECT DISTINCT week_start FROM weee_top_seller_weekly ORDER BY week_start DESC LIMIT 8`),

      // Top 3 matched hot items with cross-sell
      db.all(`
        SELECT
          h.weee_rank, h.weee_product_name,
          p.name as our_name, p.sku,
          COALESCE(p.weee_weekly_sold, 0) as weee_weekly_sold,
          COALESCE(p.weee_rating, 0) as weee_rating,
          i.quantity_on_hand, i.reorder_point,
          p2.name as cross_sell_name,
          pp.pairing_reason as cross_sell_reason
        FROM hot_items h
        JOIN products p ON h.matched_product_id = p.id
        JOIN inventory i ON p.id = i.product_id
        LEFT JOIN product_pairings pp ON p.id = pp.product_id
        LEFT JOIN products p2 ON pp.paired_product_id = p2.id
        WHERE h.weee_date = ? AND h.match_type != 'none'
        ORDER BY h.weee_rank ASC
        LIMIT 3
      `, [today]),
    ]);

    // Calculate revenue change
    const rev = (revenue30d as any)?.total || 0;
    const revPrior = (revenuePrior as any)?.total || 0;
    const revenueChangePct = revPrior > 0 ? Math.round(((rev - revPrior) / revPrior) * 1000) / 10 : 0;

    // Calculate back-in-stock metrics
    const bisProducts = new Set<number>();
    let totalLostRevenue = 0;
    let highPriorityCalls = 0;
    for (const row of bisRaw as any[]) {
      bisProducts.add(row.product_id);
      const avgDaily = row.normal_days > 0 ? row.normal_revenue / row.normal_days : 0;
      totalLostRevenue += avgDaily * row.oos_days;
      if (row.oos_days >= 3) highPriorityCalls++;
    }

    // Weee trend signals (simplified queries)
    const weekStarts = (weeeWeekRows as any[]).map(w => w.week_start);
    const latestWeek = weekStarts[0] || null;
    const trailingWeek = weekStarts[3] || weekStarts[weekStarts.length - 1] || latestWeek;

    let risingSignals = '';
    let newSignals = '';
    let recurringSignals = '';
    let qualityWatchlist = '';
    let weeeUnitsWeek = 0;
    let weeeUnitsWoWPct = 0;
    let weeeNegativePct = 0;
    let topOpportunity = '';

    if (latestWeek) {
      // Rising signals: items that moved up 2+ ranks over 4 weeks
      const allWeeklyRows = weekStarts.length > 0
        ? await db.all(`
            SELECT week_start, weee_rank, weee_product_name, matched_product_id, match_type
            FROM weee_top_seller_weekly
            WHERE week_start IN (${weekStarts.map(() => '?').join(',')})
            ORDER BY week_start DESC, weee_rank ASC
          `, weekStarts)
        : [];

      // Build signal map
      const signalMap = new Map<string, { weeks: number; latestRank: number | null; trailingRank: number | null; matchType: string }>();
      for (const row of allWeeklyRows as any[]) {
        if (!signalMap.has(row.weee_product_name)) {
          signalMap.set(row.weee_product_name, { weeks: 0, latestRank: null, trailingRank: null, matchType: row.match_type || 'none' });
        }
        const s = signalMap.get(row.weee_product_name)!;
        s.weeks++;
        if (row.week_start === latestWeek) { s.latestRank = row.weee_rank; s.matchType = row.match_type || 'none'; }
        if (row.week_start === trailingWeek) s.trailingRank = row.weee_rank;
      }

      // Rising: rank improved 2+ over 4 weeks
      const rising = Array.from(signalMap.entries())
        .filter(([, s]) => s.latestRank !== null && s.trailingRank !== null && (s.trailingRank - s.latestRank) >= 2)
        .sort((a, b) => ((b[1].trailingRank || 0) - (b[1].latestRank || 0)) - ((a[1].trailingRank || 0) - (a[1].latestRank || 0)))
        .slice(0, 3);
      if (rising.length > 0) {
        risingSignals = rising.map(([name, s]) => `${name} (up ${(s.trailingRank || 0) - (s.latestRank || 0)} spots)`).join(', ');
      }

      // New: seen only 1 week
      const newItems = Array.from(signalMap.entries())
        .filter(([, s]) => s.weeks === 1 && s.latestRank !== null)
        .sort((a, b) => (a[1].latestRank || 99) - (b[1].latestRank || 99))
        .slice(0, 3);
      if (newItems.length > 0) {
        newSignals = newItems.map(([name, s]) => `${name}${s.matchType !== 'none' ? ' (we carry it)' : ''}`).join(', ');
      }

      // Recurring: seen 4+ weeks
      const recurring = Array.from(signalMap.entries())
        .filter(([, s]) => s.weeks >= Math.min(4, weekStarts.length))
        .sort((a, b) => b[1].weeks - a[1].weeks)
        .slice(0, 3);
      if (recurring.length > 0) {
        recurringSignals = recurring.map(([name, s]) => `${name} (${s.weeks} weeks)`).join(', ');
      }

      // Our Weee performance
      const priorWeek = weekStarts[1] || latestWeek;
      const [latestMetrics, priorMetrics] = await Promise.all([
        db.get(`SELECT COALESCE(SUM(units_sold), 0) as units, COALESCE(SUM(negative_reviews), 0) as neg, COALESCE(SUM(positive_reviews + neutral_reviews + negative_reviews), 0) as total_reviews FROM weee_product_weekly_metrics WHERE week_start = ?`, [latestWeek]),
        db.get(`SELECT COALESCE(SUM(units_sold), 0) as units FROM weee_product_weekly_metrics WHERE week_start = ?`, [priorWeek]),
      ]);
      weeeUnitsWeek = (latestMetrics as any)?.units || 0;
      const priorUnits = (priorMetrics as any)?.units || 0;
      weeeUnitsWoWPct = priorUnits > 0 ? Math.round(((weeeUnitsWeek - priorUnits) / priorUnits) * 1000) / 10 : 0;
      const totalReviews = (latestMetrics as any)?.total_reviews || 0;
      const negReviews = (latestMetrics as any)?.neg || 0;
      weeeNegativePct = totalReviews > 0 ? Math.round((negReviews / totalReviews) * 1000) / 10 : 0;

      // Quality watchlist
      const watchlist = await db.all(`
        SELECT p.name, m.negative_reviews, (m.positive_reviews + m.neutral_reviews + m.negative_reviews) as total
        FROM weee_product_weekly_metrics m
        JOIN products p ON p.id = m.product_id
        WHERE m.week_start = ?
          AND (m.positive_reviews + m.neutral_reviews + m.negative_reviews) > 0
          AND CAST(m.negative_reviews AS FLOAT) / (m.positive_reviews + m.neutral_reviews + m.negative_reviews) >= 0.2
        ORDER BY CAST(m.negative_reviews AS FLOAT) / (m.positive_reviews + m.neutral_reviews + m.negative_reviews) DESC
        LIMIT 3
      `, [latestWeek]);
      if ((watchlist as any[]).length > 0) {
        qualityWatchlist = (watchlist as any[]).map(w => w.name).join(', ');
      }

      // Top opportunity (highest-scored mapped item)
      const topOpp = await db.get(`
        SELECT t.weee_product_name, p.name as our_name, i.quantity_on_hand, i.reorder_point
        FROM weee_top_seller_weekly t
        JOIN products p ON t.matched_product_id = p.id
        JOIN inventory i ON p.id = i.product_id
        WHERE t.week_start = ? AND t.match_type != 'none'
        ORDER BY t.weee_rank ASC
        LIMIT 1
      `, [latestWeek]);
      if (topOpp) {
        const opp = topOpp as any;
        const action = opp.quantity_on_hand <= opp.reorder_point
          ? 'Restock first, then push in field accounts'
          : 'Push this in key accounts this week';
        topOpportunity = `${opp.our_name} (Weee trend: ${opp.weee_product_name}) — ${action}`;
      }
    }

    // Build the data bundle
    const bundle: DashboardDataBundle = {
      revenue30d: rev,
      revenueChangePct,
      lowStockCount: (lowStockItems as any[]).length,
      lowStockNames: (lowStockItems as any[]).map(i => i.name),
      backInStockCount: bisProducts.size,
      backInStockLostRevenue: Math.round(totalLostRevenue * 100) / 100,
      backInStockHighPriorityCalls: highPriorityCalls,
      overdueCount: (invoiceSummary as any)?.overdue_count || 0,
      overdueBalance: (invoiceSummary as any)?.overdue_balance || 0,
      dueSoonCount: (invoiceSummary as any)?.due_soon_count || 0,
      dueSoonBalance: (invoiceSummary as any)?.due_soon_balance || 0,
      hotItemsTotal: (hotItemCounts as any)?.total || 0,
      hotItemsMatched: (hotItemCounts as any)?.matched || 0,
      summaryPitch: (summaryPitchRow as any)?.talking_point || '',
      risingSignals,
      newSignals,
      recurringSignals,
      qualityWatchlist,
      weeeUnitsWeek,
      weeeUnitsWoWPct,
      weeeNegativePct,
      topOpportunity,
      activeAccounts: (channelStats as any)?.active_accounts || 0,
      channelUnits30d: (channelStats as any)?.units_30d || 0,
      hotItems: (hotItemsRaw as any[]).map((row): HotItemInput => ({
        rank: row.weee_rank,
        weeeName: row.weee_product_name,
        ourProductName: row.our_name,
        sku: row.sku,
        stockOnHand: row.quantity_on_hand,
        reorderPoint: row.reorder_point,
        weeeWeeklySold: row.weee_weekly_sold,
        weeeRating: row.weee_rating,
        crossSellName: row.cross_sell_name || '',
        crossSellReason: row.cross_sell_reason || '',
      })),
    };

    const result = await generateInsights(bundle);
    res.json({ insights: result.insights, hotItemScripts: result.hotItemScripts });
  } catch (error) {
    console.error('AI insights error:', error);
    res.json({ insights: [], hotItemScripts: [], error: 'AI insights unavailable' });
  }
});

export default router;
