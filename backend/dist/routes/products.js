"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// Get all products
router.get('/', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const { category, search } = req.query;
        let query = `
      SELECT 
        p.*,
        i.quantity_on_hand,
        i.reorder_point,
        w.name as warehouse_name
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN warehouses w ON i.warehouse_id = w.id
      WHERE 1=1
    `;
        const params = [];
        if (category) {
            params.push(category);
            query += ` AND p.category = ?`;
        }
        if (search) {
            params.push(`%${search}%`, `%${search}%`);
            query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
        }
        query += ` ORDER BY p.category, p.name`;
        const result = await db.all(query, params);
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
// Get product by ID
router.get('/:id', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const { id } = req.params;
        const result = await db.get(`
      SELECT 
        p.*,
        i.quantity_on_hand,
        i.reorder_point,
        w.name as warehouse_name,
        w.location as warehouse_location
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN warehouses w ON i.warehouse_id = w.id
      WHERE p.id = ?
    `, [id]);
        if (!result) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});
// Get all categories
router.get('/categories/all', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const result = await db.all(`
      SELECT DISTINCT category FROM products ORDER BY category
    `);
        res.json(result.map((r) => r.category));
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});
// Get products by category
router.get('/category/:category', async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const { category } = req.params;
        const result = await db.all(`
      SELECT 
        p.*,
        i.quantity_on_hand,
        i.reorder_point
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.category = ?
      ORDER BY p.name
    `, [category]);
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching products by category:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
exports.default = router;
//# sourceMappingURL=products.js.map