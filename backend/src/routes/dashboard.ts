import { Router } from 'express';
import { getDb } from '../db';

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
    const hotMatched = await db.get(`
      SELECT COUNT(*) as count FROM hot_items
      WHERE weee_date = ? AND match_type != 'none'
    `, [today]);

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

// Hot items preview (top 3 for dashboard card)
router.get('/hot-items-preview', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];

    const items = await db.all(`
      SELECT
        h.weee_rank, h.weee_product_name, h.match_type, h.match_notes,
        p.name as our_product_name, p.sku as our_sku
      FROM hot_items h
      LEFT JOIN products p ON h.matched_product_id = p.id
      WHERE h.weee_date = ?
      ORDER BY h.weee_rank ASC
      LIMIT 3
    `, [today]);

    res.json(items);
  } catch (error) {
    console.error('Error fetching hot items preview:', error);
    res.status(500).json({ error: 'Failed to fetch hot items preview' });
  }
});

export default router;
