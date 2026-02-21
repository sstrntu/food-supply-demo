"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// Get all orders
router.get('/', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const result = await db.all(`
      SELECT * FROM orders ORDER BY created_at DESC
    `);
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});
// Get recent orders
router.get('/recent/:limit', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const limit = parseInt(req.params.limit) || 10;
        const result = await db.all(`
      SELECT o.*, 
        json_group_array(
          json_object(
            'product_name', p.name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ?
    `, [limit]);
        // Parse the JSON string for each row
        const parsed = result.map((row) => ({
            ...row,
            items: JSON.parse(row.items || '[]')
        }));
        res.json(parsed);
    }
    catch (error) {
        console.error('Error fetching recent orders:', error);
        res.status(500).json({ error: 'Failed to fetch recent orders' });
    }
});
// Get order by ID
router.get('/:id', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const { id } = req.params;
        const result = await db.get(`
      SELECT o.*,
        json_group_array(
          json_object(
            'product_id', p.id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'subtotal', oi.quantity * oi.unit_price
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.id = ?
      GROUP BY o.id
    `, [id]);
        if (!result) {
            return res.status(404).json({ error: 'Order not found' });
        }
        result.items = JSON.parse(result.items || '[]');
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});
// Create new order
router.post('/', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const { customer_id, items } = req.body;
        // Calculate total
        let totalAmount = 0;
        for (const item of items) {
            totalAmount += item.quantity * item.unit_price;
        }
        // Create order
        const orderResult = await db.run(`
      INSERT INTO orders (customer_id, status, total_amount)
      VALUES (?, ?, ?)
    `, [customer_id, 'pending', totalAmount]);
        const orderId = orderResult.lastID;
        // Add order items
        for (const item of items) {
            await db.run(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `, [orderId, item.product_id, item.quantity, item.unit_price]);
        }
        res.status(201).json({ id: orderId, customer_id, status: 'pending', total_amount: totalAmount });
    }
    catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});
exports.default = router;
//# sourceMappingURL=orders.js.map