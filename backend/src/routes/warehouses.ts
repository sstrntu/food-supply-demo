import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

// Get all warehouses
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.all(`
      SELECT w.*,
        COUNT(DISTINCT i.product_id) as product_count,
        SUM(i.quantity_on_hand) as total_stock
      FROM warehouses w
      LEFT JOIN inventory i ON w.id = i.warehouse_id
      GROUP BY w.id
      ORDER BY w.name
    `);
    res.json(result);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
});

// Get warehouse by ID
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const result = await db.get(`
      SELECT * FROM warehouses WHERE id = ?
    `, [id]);
    
    if (!result) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse' });
  }
});

export default router;