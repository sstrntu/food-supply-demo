import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

// List all customers with optional territory/account_manager filter
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { territory, account_manager } = req.query;

    let query = 'SELECT * FROM customers WHERE 1=1';
    const params: any[] = [];

    if (territory) {
      query += ' AND territory = ?';
      params.push(territory);
    }
    if (account_manager) {
      query += ' AND account_manager = ?';
      params.push(account_manager);
    }

    query += ' ORDER BY territory, name';
    const customers = await db.all(query, params);
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get single customer with sales summary
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get 30-day sales summary by category
    const salesByCategory = await db.all(`
      SELECT p.category,
        SUM(sh.quantity_sold) as total_qty,
        SUM(sh.revenue) as total_revenue
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.customer_id = ?
        AND sh.sale_date >= date('now', '-30 days')
        AND sh.was_out_of_stock = 0
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `, [id]);

    // Get top products
    const topProducts = await db.all(`
      SELECT p.name, p.sku, p.category,
        SUM(sh.quantity_sold) as total_qty,
        SUM(sh.revenue) as total_revenue
      FROM sales_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.customer_id = ?
        AND sh.sale_date >= date('now', '-30 days')
        AND sh.was_out_of_stock = 0
      GROUP BY p.id
      ORDER BY total_revenue DESC
      LIMIT 5
    `, [id]);

    res.json({
      ...customer,
      sales_summary: {
        by_category: salesByCategory,
        top_products: topProducts,
      },
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

export default router;
