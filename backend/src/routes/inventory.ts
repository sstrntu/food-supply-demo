import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

// Get all inventory with product details
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.all(`
      SELECT 
        i.id,
        i.product_id,
        i.warehouse_id,
        i.quantity_on_hand,
        i.reorder_point,
        p.name as product_name,
        p.category,
        p.sku,
        p.unit_price,
        p.supplier,
        w.name as warehouse_name,
        w.location as warehouse_location
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      ORDER BY p.category, p.name
    `);
    res.json(result);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Get low stock items
router.get('/low-stock', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.all(`
      SELECT 
        i.id,
        i.product_id,
        i.quantity_on_hand,
        i.reorder_point,
        p.name as product_name,
        p.category,
        p.sku,
        p.supplier,
        w.name as warehouse_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY CAST(i.quantity_on_hand AS FLOAT) / i.reorder_point ASC
    `);
    res.json(result);
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// Get inventory by product ID
router.get('/product/:productId', async (req, res) => {
  try {
    const db = await getDb();
    const { productId } = req.params;
    const result = await db.all(`
      SELECT 
        i.*,
        p.name as product_name,
        w.name as warehouse_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.product_id = ?
    `, [productId]);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Inventory not found for this product' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Get inventory by warehouse
router.get('/warehouse/:warehouseId', async (req, res) => {
  try {
    const db = await getDb();
    const { warehouseId } = req.params;
    const result = await db.all(`
      SELECT 
        i.*,
        p.name as product_name,
        p.category,
        p.sku
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.warehouse_id = ?
      ORDER BY p.category, p.name
    `, [warehouseId]);
    res.json(result);
  } catch (error) {
    console.error('Error fetching warehouse inventory:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse inventory' });
  }
});

// Update inventory quantity
router.patch('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { quantity_on_hand, reorder_point } = req.body;
    
    const result = await db.run(`
      UPDATE inventory 
      SET 
        quantity_on_hand = COALESCE(?, quantity_on_hand),
        reorder_point = COALESCE(?, reorder_point),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [quantity_on_hand, reorder_point, id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }
    
    const updated = await db.get('SELECT * FROM inventory WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

export default router;