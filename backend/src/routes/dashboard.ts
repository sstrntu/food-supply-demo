import { Router } from 'express';
import { getDb } from '../db';
import { resolveHotDate } from '../utils/hot-date';

const router = Router();

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();

    const productsResult = await db.get('SELECT COUNT(*) as total FROM products');

    const valueResult = await db.get(`
      SELECT SUM(i.quantity_on_hand * p.unit_price) as total_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
    `);

    const lowStockResult = await db.get(`
      SELECT COUNT(*) as count
      FROM inventory
      WHERE quantity_on_hand <= reorder_point
    `);

    const inventoryByCategory = await db.all(`
      SELECT p.category, SUM(i.quantity_on_hand) as total_quantity
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      GROUP BY p.category
      ORDER BY total_quantity DESC
    `);

    res.json({
      totalProducts: productsResult?.total || 0,
      totalInventoryValue: valueResult?.total_value || 0,
      lowStockCount: lowStockResult?.count || 0,
      inventoryByCategory: inventoryByCategory || []
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Get low stock alerts
router.get('/alerts', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.all(`
      SELECT
        p.id,
        p.name,
        p.category,
        p.sku,
        i.quantity_on_hand,
        i.reorder_point,
        (i.reorder_point - i.quantity_on_hand) as shortage,
        w.name as warehouse_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY CAST(i.quantity_on_hand AS FLOAT) / NULLIF(i.reorder_point, 0) ASC
      LIMIT 10
    `);
    res.json(result);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Get recent sales activity
router.get('/activity', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit as string) || 10;

    const recentSales = await db.all(`
      SELECT
        'sale' as type,
        c.name as customer_name,
        c.territory,
        p.name as product_name,
        sh.quantity_sold,
        sh.revenue,
        sh.sale_date as timestamp
      FROM sales_history sh
      JOIN customers c ON sh.customer_id = c.id
      JOIN products p ON sh.product_id = p.id
      WHERE sh.was_out_of_stock = 0
      ORDER BY sh.sale_date DESC, sh.revenue DESC
      LIMIT ?
    `, [limit]);

    res.json(recentSales);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Sales summary for dashboard cards
router.get('/sales-summary', async (req, res) => {
  try {
    const db = await getDb();

    // Total revenue last 30 days
    const revenue30d = await db.get(`
      SELECT SUM(revenue) as total
      FROM sales_history
      WHERE sale_date >= date('now', '-30 days') AND was_out_of_stock = 0
    `);

    // Revenue prior 30 days (for comparison)
    const revenuePrior = await db.get(`
      SELECT SUM(revenue) as total
      FROM sales_history
      WHERE sale_date >= date('now', '-60 days') AND sale_date < date('now', '-30 days') AND was_out_of_stock = 0
    `);

    const current = revenue30d?.total || 0;
    const prior = revenuePrior?.total || 0;
    const changePct = prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : 0;

    // Back-in-stock alert count
    const bisCount = await db.get(`
      SELECT COUNT(DISTINCT sh.product_id) as count
      FROM sales_history sh
      JOIN inventory i ON sh.product_id = i.product_id
      WHERE sh.was_out_of_stock = 1
        AND sh.sale_date >= date('now', '-14 days')
        AND i.quantity_on_hand > 0
    `);

    // Weee stats
    const weeeStats = await db.get(`
      SELECT SUM(weee_weekly_sold) as total_sold, COUNT(*) as listed
      FROM products WHERE weee_listed = 1
    `);

    // Today's hot items matched count
    const today = new Date().toISOString().split('T')[0];
    const hotDate = await resolveHotDate(db, today);
    const hotMatched = await db.get(`
      SELECT COUNT(*) as count FROM hot_items
      WHERE weee_date = ? AND match_type != 'none'
    `, [hotDate || today]);

    res.json({
      total_revenue_30d: Math.round(current * 100) / 100,
      revenue_change_pct: changePct,
      back_in_stock_alerts: bisCount?.count || 0,
      weee_weekly_sold: weeeStats?.total_sold || 0,
      weee_listings: weeeStats?.listed || 0,
      hot_items_matched: hotMatched?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

// Weee (Sayweee) vs our channel performance and opportunities
router.get('/weee-vs-channels', async (_req, res) => {
  try {
    const db = await getDb();
    const toPct = (current: number, prior: number) => {
      if (!prior) return current > 0 ? 100 : 0;
      return Math.round(((current - prior) / prior) * 1000) / 10;
    };

    const ourChannels30d = await db.get(`
      SELECT
        COALESCE(SUM(quantity_sold), 0) as units_30d,
        COALESCE(SUM(revenue), 0) as revenue_30d,
        COUNT(DISTINCT customer_id) as active_accounts_30d
      FROM sales_history
      WHERE sale_date >= date('now', '-30 days')
        AND was_out_of_stock = 0
    `) as any;

    const weeeListedStats = await db.get(`
      SELECT
        COUNT(*) as listed_products,
        COALESCE(AVG(weee_rating), 0) as avg_rating
      FROM products
      WHERE weee_listed = 1
    `) as any;

    const weekRows = await db.all(`
      SELECT DISTINCT week_start
      FROM weee_top_seller_weekly
      ORDER BY week_start DESC
      LIMIT 8
    `) as any[];
    const trendWeeks = weekRows.map((w) => w.week_start);
    const latestWeekStart = trendWeeks[0] || null;
    const priorWeekStart = trendWeeks[1] || latestWeekStart;
    const trailingWeekForMomentum = trendWeeks[3] || trendWeeks[trendWeeks.length - 1] || latestWeekStart;

    const weeklyTrendRows = trendWeeks.length > 0
      ? await db.all(`
          SELECT
            week_start,
            weee_rank,
            weee_product_name,
            weee_category,
            matched_product_id,
            match_type
          FROM weee_top_seller_weekly
          WHERE week_start IN (${trendWeeks.map(() => '?').join(',')})
          ORDER BY week_start DESC, weee_rank ASC
        `, trendWeeks)
      : [];

    const latestWeekRows = latestWeekStart
      ? (weeklyTrendRows as any[]).filter((r) => r.week_start === latestWeekStart)
      : [];

    const trendSignalMap = new Map<string, any>();
    for (const row of weeklyTrendRows as any[]) {
      const key = row.weee_product_name;
      if (!trendSignalMap.has(key)) {
        trendSignalMap.set(key, {
          weee_product_name: row.weee_product_name,
          weee_category: row.weee_category || 'Other',
          matched_product_id: row.matched_product_id || null,
          match_type: row.match_type || 'none',
          weeks_seen_set: new Set<string>(),
          ranks_by_week: {} as Record<string, number>,
        });
      }

      const signal = trendSignalMap.get(key);
      signal.weeks_seen_set.add(row.week_start);
      signal.ranks_by_week[row.week_start] = row.weee_rank;
      if (row.week_start === latestWeekStart) {
        signal.match_type = row.match_type || 'none';
        signal.matched_product_id = row.matched_product_id || signal.matched_product_id;
      }
    }

    const trendSignals = Array.from(trendSignalMap.values()).map((s) => {
      const currentRank = latestWeekStart ? s.ranks_by_week[latestWeekStart] ?? null : null;
      const priorRank = priorWeekStart ? s.ranks_by_week[priorWeekStart] ?? null : null;
      const trailingRank = trailingWeekForMomentum ? s.ranks_by_week[trailingWeekForMomentum] ?? null : null;
      const rankChangeWoW = (currentRank !== null && priorRank !== null) ? (priorRank - currentRank) : 0;
      const rankChange4w = (currentRank !== null && trailingRank !== null) ? (trailingRank - currentRank) : 0;

      return {
        weee_product_name: s.weee_product_name,
        weee_category: s.weee_category,
        match_type: s.match_type,
        matched_product_id: s.matched_product_id,
        weeks_seen: s.weeks_seen_set.size,
        current_rank: currentRank,
        prior_rank: priorRank,
        rank_change_wow: rankChangeWoW,
        rank_change_4w: rankChange4w,
      };
    });

    const trendByName = new Map(trendSignals.map((s) => [s.weee_product_name, s]));

    const latestCategoryCounts = new Map<string, number>();
    for (const row of latestWeekRows) {
      const category = row.weee_category || 'Other';
      latestCategoryCounts.set(category, (latestCategoryCounts.get(category) || 0) + 1);
    }
    const topTrendingCategories = Array.from(latestCategoryCounts.entries())
      .map(([category, item_count]) => ({ category, item_count }))
      .sort((a, b) => b.item_count - a.item_count || a.category.localeCompare(b.category))
      .slice(0, 3);

    const matchedLatestCount = latestWeekRows.filter((r) => (r.match_type || 'none') !== 'none').length;
    const exactLatestCount = latestWeekRows.filter((r) => r.match_type === 'exact').length;
    const alternativeLatestCount = latestWeekRows.filter((r) => r.match_type === 'alternative').length;
    const unmatchedLatestCount = latestWeekRows.filter((r) => (r.match_type || 'none') === 'none').length;

    const matchedHotItems = latestWeekStart ? await db.all(`
      SELECT
        t.weee_rank,
        t.weee_product_name,
        t.weee_category,
        t.match_type,
        p.id as product_id,
        p.name as our_product_name,
        p.sku,
        i.quantity_on_hand,
        i.reorder_point,
        COALESCE(SUM(CASE
          WHEN sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
          THEN sh.quantity_sold ELSE 0 END), 0) as our_30d_units,
        COALESCE(SUM(CASE
          WHEN sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
          THEN sh.revenue ELSE 0 END), 0) as our_30d_revenue,
        COUNT(DISTINCT CASE
          WHEN sh.sale_date >= date('now', '-30 days') AND sh.was_out_of_stock = 0
          THEN sh.customer_id ELSE NULL END) as account_reach_30d,
        COALESCE(wm.units_sold, 0) as weee_units_week,
        COALESCE(wm.revenue, 0) as weee_revenue_week,
        COALESCE(wm.avg_rating, p.weee_rating, 0) as weee_avg_rating_week,
        COALESCE(wm.review_count, 0) as weee_review_count_week,
        COALESCE(wm.positive_reviews, 0) as positive_reviews_week,
        COALESCE(wm.neutral_reviews, 0) as neutral_reviews_week,
        COALESCE(wm.negative_reviews, 0) as negative_reviews_week,
        COALESCE(pw.units_sold, 0) as weee_units_prior_week
      FROM weee_top_seller_weekly t
      LEFT JOIN products p ON t.matched_product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN sales_history sh ON p.id = sh.product_id
      LEFT JOIN weee_product_weekly_metrics wm ON wm.product_id = p.id AND wm.week_start = ?
      LEFT JOIN weee_product_weekly_metrics pw ON pw.product_id = p.id AND pw.week_start = ?
      WHERE t.week_start = ? AND t.match_type != 'none'
      GROUP BY
        t.id, p.id, i.quantity_on_hand, i.reorder_point,
        wm.units_sold, wm.revenue, wm.avg_rating, wm.review_count, wm.positive_reviews, wm.neutral_reviews, wm.negative_reviews,
        pw.units_sold
      ORDER BY t.weee_rank ASC
    `, [latestWeekStart, priorWeekStart || latestWeekStart, latestWeekStart]) : [];

    const uncoveredHotItems = latestWeekStart ? await db.all(`
      SELECT
        weee_rank,
        weee_product_name,
        weee_category
      FROM weee_top_seller_weekly
      WHERE week_start = ? AND match_type = 'none'
      ORDER BY weee_rank ASC
      LIMIT 5
    `, [latestWeekStart]) : [];

    const allMappedOpportunities = (matchedHotItems as any[]).map((item) => {
      const signal = trendByName.get(item.weee_product_name);
      const our30dUnits = item.our_30d_units || 0;
      const oosRisk = item.quantity_on_hand <= item.reorder_point;
      const trendPresenceWeeks = signal?.weeks_seen || 1;
      const rankChange4w = signal?.rank_change_4w || 0;
      const weeeUnitsWeek = item.weee_units_week || 0;
      const weeeUnitsWoW = toPct(weeeUnitsWeek, item.weee_units_prior_week || 0);
      const reviewTotal = (item.positive_reviews_week || 0) + (item.neutral_reviews_week || 0) + (item.negative_reviews_week || 0);
      const negativeSharePct = reviewTotal > 0
        ? Math.round(((item.negative_reviews_week || 0) / reviewTotal) * 1000) / 10
        : 0;

      const rankScore = Math.max(1, 6 - (item.weee_rank || 5)) * 15;
      const persistenceScore = trendPresenceWeeks * 4;
      const momentumScore = rankChange4w * 5;
      const channelGapScore = our30dUnits === 0 ? 22 : our30dUnits < 120 ? 12 : 4;
      const weeeMomentumScore = weeeUnitsWoW > 10 ? 10 : (weeeUnitsWoW < -10 ? -8 : 0);
      const stockScore = oosRisk ? -25 : 8;
      const sentimentScore = negativeSharePct >= 25 ? -10 : (negativeSharePct >= 15 ? -4 : 6);
      const opportunityScore = Math.round(
        rankScore + persistenceScore + momentumScore + channelGapScore + weeeMomentumScore + stockScore + sentimentScore
      );

      const reasons: string[] = [];
      reasons.push(`Observed ${trendPresenceWeeks}/${trendWeeks.length || 1} tracked weeks`);
      reasons.push(`Current Weee rank #${item.weee_rank}`);
      if (rankChange4w >= 2) reasons.push(`Rising trend (+${rankChange4w} rank in 4w)`);
      if (rankChange4w <= -2) reasons.push(`Cooling trend (${rankChange4w} rank in 4w)`);
      if (item.match_type === 'exact') reasons.push('Exact catalog match');
      if (our30dUnits === 0) reasons.push('No non-Weee channel sales in 30d');
      else if (our30dUnits < 120) reasons.push('Low non-Weee channel penetration');
      if ((item.account_reach_30d || 0) <= 2) reasons.push('Limited account reach');
      if (weeeUnitsWoW > 10) reasons.push(`Our Weee units up ${weeeUnitsWoW}% WoW`);
      if (weeeUnitsWoW < -10) reasons.push(`Our Weee units down ${Math.abs(weeeUnitsWoW)}% WoW`);
      if (negativeSharePct >= 15) reasons.push(`Negative review share ${negativeSharePct}% this week`);
      if (oosRisk) reasons.push('Inventory below reorder point');

      let suggestedAction = 'Bundle this item into weekly account pitches and checkout displays.';
      if (oosRisk) suggestedAction = 'Restock first, then push this trend in field accounts.';
      else if (negativeSharePct >= 25) suggestedAction = 'Address quality feedback before scaling this item.';
      else if (our30dUnits === 0) suggestedAction = 'Launch this mapped SKU in key accounts this week.';
      else if ((item.account_reach_30d || 0) <= 2) suggestedAction = 'Expand to more accounts; current account reach is narrow.';
      else if (weeeUnitsWoW < -10) suggestedAction = 'Refresh Weee listing (content/promo) to recover momentum.';

      return {
        trend_rank: item.weee_rank,
        weee_trend_item: item.weee_product_name,
        our_product_name: item.our_product_name || 'No mapped product',
        sku: item.sku,
        match_type: item.match_type,
        our_30d_units: our30dUnits,
        our_30d_revenue: Math.round((item.our_30d_revenue || 0) * 100) / 100,
        account_reach_30d: item.account_reach_30d || 0,
        quantity_on_hand: item.quantity_on_hand || 0,
        reorder_point: item.reorder_point || 0,
        stock_status: oosRisk ? 'risk' : 'ready',
        trend_presence_weeks: trendPresenceWeeks,
        rank_change_4w: rankChange4w,
        weee_units_week: weeeUnitsWeek,
        weee_units_wow_pct: weeeUnitsWoW,
        negative_review_share_pct: negativeSharePct,
        opportunity_reason: reasons.join('; '),
        opportunity_score: opportunityScore,
        suggested_action: suggestedAction,
      };
    })
    .sort((a, b) => b.opportunity_score - a.opportunity_score);

    const opportunities = allMappedOpportunities.slice(0, 5);

    const totalHotItems = latestWeekRows.length || 0;
    const matchedCount = matchedLatestCount;
    const exactCount = exactLatestCount;
    const alternativeCount = alternativeLatestCount;
    const unmatchedCount = unmatchedLatestCount;
    const coveragePct = totalHotItems > 0 ? Math.round((matchedCount / totalHotItems) * 1000) / 10 : 0;
    const stockReadyMatched = allMappedOpportunities.filter(o => o.stock_status === 'ready').length;
    const stockRiskMatched = allMappedOpportunities.filter(o => o.stock_status === 'risk').length;
    const matchedItemsSold30d = allMappedOpportunities.filter(o => o.our_30d_units > 0).length;
    const stockReadyPct = matchedCount > 0 ? Math.round((stockReadyMatched / matchedCount) * 1000) / 10 : 0;
    const ourUnits30d = ourChannels30d?.units_30d || 0;

    const recurringSignals = trendSignals
      .filter((s) => s.weeks_seen >= Math.min(4, trendWeeks.length || 1))
      .sort((a, b) => b.weeks_seen - a.weeks_seen || (a.current_rank || 99) - (b.current_rank || 99))
      .slice(0, 5);
    const risingSignals = trendSignals
      .filter((s) => s.current_rank !== null && s.rank_change_4w >= 2)
      .sort((a, b) => b.rank_change_4w - a.rank_change_4w || (a.current_rank || 99) - (b.current_rank || 99))
      .slice(0, 5);
    const coolingSignals = trendSignals
      .filter((s) => s.current_rank !== null && s.rank_change_4w <= -2)
      .sort((a, b) => a.rank_change_4w - b.rank_change_4w || (a.current_rank || 99) - (b.current_rank || 99))
      .slice(0, 5);
    const newSignalsThisWeek = trendSignals
      .filter((s) => s.current_rank !== null && s.weeks_seen === 1)
      .sort((a, b) => (a.current_rank || 99) - (b.current_rank || 99))
      .slice(0, 5);

    const latestWeeeWeek = latestWeekStart ? await db.get(`
      SELECT
        COALESCE(SUM(units_sold), 0) as units,
        COALESCE(SUM(revenue), 0) as revenue,
        COALESCE(AVG(avg_rating), 0) as avg_rating,
        COALESCE(SUM(review_count), 0) as reviews,
        COALESCE(SUM(positive_reviews), 0) as positive_reviews,
        COALESCE(SUM(neutral_reviews), 0) as neutral_reviews,
        COALESCE(SUM(negative_reviews), 0) as negative_reviews
      FROM weee_product_weekly_metrics
      WHERE week_start = ?
    `, [latestWeekStart]) as any : null;

    const priorWeeeWeek = priorWeekStart ? await db.get(`
      SELECT
        COALESCE(SUM(units_sold), 0) as units,
        COALESCE(SUM(revenue), 0) as revenue,
        COALESCE(AVG(avg_rating), 0) as avg_rating
      FROM weee_product_weekly_metrics
      WHERE week_start = ?
    `, [priorWeekStart]) as any : null;

    const topWeeeProductsRows = latestWeekStart ? await db.all(`
      SELECT
        p.name,
        p.sku,
        m.units_sold,
        m.revenue,
        m.avg_rating,
        m.review_count,
        m.positive_reviews,
        m.neutral_reviews,
        m.negative_reviews,
        COALESCE(pm.units_sold, 0) as prior_units_sold
      FROM weee_product_weekly_metrics m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN weee_product_weekly_metrics pm
        ON pm.product_id = m.product_id AND pm.week_start = ?
      WHERE m.week_start = ?
      ORDER BY m.units_sold DESC
      LIMIT 5
    `, [priorWeekStart || latestWeekStart, latestWeekStart]) : [];

    const topWeeeProducts = (topWeeeProductsRows as any[]).map((row) => {
      const wowUnitsPct = toPct(row.units_sold || 0, row.prior_units_sold || 0);
      const totalSentiment = (row.positive_reviews || 0) + (row.neutral_reviews || 0) + (row.negative_reviews || 0);
      const negativeSharePct = totalSentiment > 0
        ? Math.round(((row.negative_reviews || 0) / totalSentiment) * 1000) / 10
        : 0;
      return {
        name: row.name,
        sku: row.sku,
        units_sold_week: row.units_sold || 0,
        wow_units_pct: wowUnitsPct,
        avg_rating_week: Math.round((row.avg_rating || 0) * 100) / 100,
        review_count_week: row.review_count || 0,
        negative_review_share_pct: negativeSharePct,
      };
    });

    const qualityWatchlist = topWeeeProducts
      .filter((row) => row.negative_review_share_pct >= 20 || row.avg_rating_week < 4.2)
      .sort((a, b) => b.negative_review_share_pct - a.negative_review_share_pct || a.avg_rating_week - b.avg_rating_week)
      .slice(0, 3);

    const insights: string[] = [];
    insights.push(`Benchmark is based on observed Weee/Sayweee top-seller rankings across ${trendWeeks.length} tracked weeks; competitor unit sales are not available.`);
    insights.push(`${coveragePct}% of this week's observed Weee top sellers are mapped to our catalog; ${stockReadyPct}% of mapped trends are stock-ready.`);
    insights.push(`${matchedItemsSold30d} of ${matchedCount} mapped trends had channel sales in the last 30 days.`);
    if (unmatchedCount > 0) insights.push(`${unmatchedCount} trending items are currently uncovered in our catalog.`);
    if (risingSignals.length > 0) {
      insights.push(`Rising signals: ${risingSignals.slice(0, 2).map((s) => `${s.weee_product_name} (+${s.rank_change_4w} rank)`).join(', ')}.`);
    }
    if (qualityWatchlist.length > 0) {
      insights.push(`Quality watchlist on our Weee listings: ${qualityWatchlist.map((q) => `${q.name} (${q.negative_review_share_pct}% negative this week)`).join(', ')}.`);
    }

    const latestUnits = latestWeeeWeek?.units || 0;
    const latestRevenue = latestWeeeWeek?.revenue || 0;
    const latestPositive = latestWeeeWeek?.positive_reviews || 0;
    const latestNeutral = latestWeeeWeek?.neutral_reviews || 0;
    const latestNegative = latestWeeeWeek?.negative_reviews || 0;
    const sentimentTotal = latestPositive + latestNeutral + latestNegative;
    const positivePct = sentimentTotal > 0 ? Math.round((latestPositive / sentimentTotal) * 1000) / 10 : 0;
    const neutralPct = sentimentTotal > 0 ? Math.round((latestNeutral / sentimentTotal) * 1000) / 10 : 0;
    const negativePct = sentimentTotal > 0 ? Math.round((latestNegative / sentimentTotal) * 1000) / 10 : 0;

    res.json({
      period_days: 30,
      benchmark_context: {
        method: 'observed_weee_trends_plus_our_weee_sales_reviews',
        note: 'Weee/Sayweee benchmark uses observed top-seller rankings; only our own Weee sales/review metrics are used for performance.',
      },
      weee_observed: {
        trending_items_today: totalHotItems,
        latest_week_start: latestWeekStart,
        prior_week_start: priorWeekStart,
        top_trending_categories: topTrendingCategories,
      },
      our_weee_listings: {
        listed_products: weeeListedStats?.listed_products || 0,
        avg_rating: Math.round((weeeListedStats?.avg_rating || 0) * 10) / 10,
      },
      trend_tracking: {
        weeks_tracked: trendWeeks.length,
        latest_week_start: latestWeekStart,
        prior_week_start: priorWeekStart,
        recurring_signals: recurringSignals.map((s) => ({
          weee_product_name: s.weee_product_name,
          weee_category: s.weee_category,
          weeks_seen: s.weeks_seen,
          current_rank: s.current_rank,
        })),
        rising_signals: risingSignals.map((s) => ({
          weee_product_name: s.weee_product_name,
          weee_category: s.weee_category,
          current_rank: s.current_rank,
          rank_change_4w: s.rank_change_4w,
        })),
        cooling_signals: coolingSignals.map((s) => ({
          weee_product_name: s.weee_product_name,
          weee_category: s.weee_category,
          current_rank: s.current_rank,
          rank_change_4w: s.rank_change_4w,
        })),
        new_signals_this_week: newSignalsThisWeek.map((s) => ({
          weee_product_name: s.weee_product_name,
          weee_category: s.weee_category,
          current_rank: s.current_rank,
          match_type: s.match_type,
        })),
      },
      our_weee_performance: {
        week_start: latestWeekStart,
        units_sold_week: latestUnits,
        units_wow_pct: toPct(latestUnits, priorWeeeWeek?.units || 0),
        revenue_week: Math.round((latestRevenue || 0) * 100) / 100,
        revenue_wow_pct: toPct(latestRevenue, priorWeeeWeek?.revenue || 0),
        avg_rating_week: Math.round((latestWeeeWeek?.avg_rating || 0) * 100) / 100,
        rating_wow_delta: Math.round(((latestWeeeWeek?.avg_rating || 0) - (priorWeeeWeek?.avg_rating || 0)) * 100) / 100,
        sentiment: {
          positive_reviews: latestPositive,
          neutral_reviews: latestNeutral,
          negative_reviews: latestNegative,
          positive_pct: positivePct,
          neutral_pct: neutralPct,
          negative_pct: negativePct,
        },
        top_products: topWeeeProducts,
        quality_watchlist: qualityWatchlist,
      },
      channels: {
        units_30d: ourUnits30d,
        revenue_30d: Math.round((ourChannels30d?.revenue_30d || 0) * 100) / 100,
        active_accounts_30d: ourChannels30d?.active_accounts_30d || 0,
      },
      hot_item_coverage: {
        total_hot_items: totalHotItems,
        matched_hot_items: matchedCount,
        exact_match_items: exactCount,
        alternative_match_items: alternativeCount,
        unmatched_hot_items: unmatchedCount,
        coverage_pct: coveragePct,
        stock_ready_matched_items: stockReadyMatched,
        stock_risk_matched_items: stockRiskMatched,
        stock_ready_pct: stockReadyPct,
        matched_items_sold_30d: matchedItemsSold30d,
      },
      opportunities,
      uncovered_hot_items: uncoveredHotItems,
      insights,
    });
  } catch (error) {
    console.error('Error fetching Weee vs channel insights:', error);
    res.status(500).json({ error: 'Failed to fetch Weee vs channel insights' });
  }
});

// Hot items preview (top 3 for dashboard card)
router.get('/hot-items-preview', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];
    const hotDate = await resolveHotDate(db, today);

    const items = await db.all(`
      SELECT
        h.weee_rank, h.weee_product_name, h.match_type, h.match_notes,
        p.name as our_product_name, p.sku as our_sku
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
      LIMIT 3
    `, [hotDate || today]);

    res.json(items);
  } catch (error) {
    console.error('Error fetching hot items preview:', error);
    res.status(500).json({ error: 'Failed to fetch hot items preview' });
  }
});

export default router;
