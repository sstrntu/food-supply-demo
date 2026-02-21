import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    
    // Total products
    const productsResult = await db.get('SELECT COUNT(*) as total FROM products');
    
    // Total inventory value
    const valueResult = await db.get(`
      SELECT SUM(i.quantity_on_hand * p.unit_price) as total_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
    `);
    
    // Low stock count
    const lowStockResult = await db.get(`
      SELECT COUNT(*) as count
      FROM inventory
      WHERE quantity_on_hand <= reorder_point
    `);
    
    // Total orders
    const ordersResult = await db.get('SELECT COUNT(*) as total FROM orders');
    
    // Orders by status
    const ordersByStatus = await db.all(`
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
    `);
    
    // Inventory by category
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
      totalOrders: ordersResult?.total || 0,
      ordersByStatus: ordersByStatus || [],
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

// Get recent activity
router.get('/activity', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit as string) || 10;
    
    const recentOrders = await db.all(`
      SELECT 
        'order' as type,
        id,
        status,
        total_amount,
        created_at as timestamp
      FROM orders
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    
    res.json(recentOrders);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;