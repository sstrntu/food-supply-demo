import { Router } from 'express';

// In-memory data store for POC
const products = [
  { id: 1, name: 'Jasmine Rice (5kg)', category: 'Rice & Noodles', sku: 'RICE-JAS-5KG', unit_price: 15.99, supplier: 'Thai Best Foods', description: 'Premium Thai jasmine rice' },
  { id: 2, name: 'Sushi Rice (2kg)', category: 'Rice & Noodles', sku: 'RICE-SUS-2KG', unit_price: 12.99, supplier: 'Nishiki', description: 'Short grain Japanese sushi rice' },
  { id: 3, name: 'Basmati Rice (5kg)', category: 'Rice & Noodles', sku: 'RICE-BAS-5KG', unit_price: 18.99, supplier: 'India Gate', description: 'Aged long grain basmati rice' },
  { id: 4, name: 'Ramen Noodles (Pack of 5)', category: 'Rice & Noodles', sku: 'NOOD-RAM-5PK', unit_price: 4.99, supplier: 'Nissin', description: 'Japanese instant ramen noodles' },
  { id: 5, name: 'Soy Sauce (Light)', category: 'Sauces & Condiments', sku: 'SAUCE-SOY-LIT', unit_price: 3.49, supplier: 'Kikkoman', description: 'Japanese light soy sauce' },
  { id: 6, name: 'Sriracha Chili Sauce', category: 'Sauces & Condiments', sku: 'SAUCE-SRI-500', unit_price: 4.99, supplier: 'Huy Fong', description: 'Thai chili garlic sauce' },
  { id: 7, name: 'Frozen Dumplings', category: 'Frozen Foods', sku: 'FROZ-DUM-PORK', unit_price: 8.99, supplier: 'Wei-Chuan', description: 'Chinese dumplings, 50 count' },
  { id: 8, name: 'Spring Rolls', category: 'Frozen Foods', sku: 'FROZ-SPR-VEG', unit_price: 5.99, supplier: 'Tai Pei', description: 'Crispy vegetable spring rolls' },
  { id: 9, name: 'Pocky Sticks', category: 'Snacks', sku: 'SNACK-POCKY', unit_price: 3.49, supplier: 'Glico', description: 'Japanese biscuit sticks' },
  { id: 10, name: 'Thai Tea Mix', category: 'Beverages', sku: 'BEV-THAI-TEA', unit_price: 6.99, supplier: 'Cha Tra Mue', description: 'Traditional Thai tea' }
];

const inventory = [
  { id: 1, product_id: 1, warehouse_id: 1, quantity_on_hand: 150, reorder_point: 50 },
  { id: 2, product_id: 2, warehouse_id: 1, quantity_on_hand: 80, reorder_point: 30 },
  { id: 3, product_id: 3, warehouse_id: 1, quantity_on_hand: 200, reorder_point: 60 },
  { id: 4, product_id: 4, warehouse_id: 1, quantity_on_hand: 25, reorder_point: 40 },
  { id: 5, product_id: 5, warehouse_id: 1, quantity_on_hand: 300, reorder_point: 100 },
  { id: 6, product_id: 6, warehouse_id: 1, quantity_on_hand: 120, reorder_point: 50 },
  { id: 7, product_id: 7, warehouse_id: 1, quantity_on_hand: 15, reorder_point: 20 },
  { id: 8, product_id: 8, warehouse_id: 1, quantity_on_hand: 45, reorder_point: 30 },
  { id: 9, product_id: 9, warehouse_id: 1, quantity_on_hand: 200, reorder_point: 80 },
  { id: 10, product_id: 10, warehouse_id: 1, quantity_on_hand: 60, reorder_point: 25 }
];

const warehouses = [
  { id: 1, name: 'Main Warehouse', location: 'Bangkok, Thailand' }
];

const orders = [
  { id: 1001, customer_id: 'CUST001', status: 'completed', total_amount: 125.50, created_at: new Date().toISOString() },
  { id: 1002, customer_id: 'CUST002', status: 'pending', total_amount: 89.99, created_at: new Date().toISOString() }
];

const router = Router();

// Get all inventory with product details
router.get('/', async (req, res) => {
  const result = inventory.map(i => {
    const product = products.find(p => p.id === i.product_id);
    const warehouse = warehouses.find(w => w.id === i.warehouse_id);
    return {
      ...i,
      product_name: product?.name,
      category: product?.category,
      sku: product?.sku,
      unit_price: product?.unit_price,
      supplier: product?.supplier,
      warehouse_name: warehouse?.name,
      warehouse_location: warehouse?.location
    };
  });
  res.json(result);
});

// Get low stock items
router.get('/low-stock', async (req, res) => {
  const lowStock = inventory
    .filter(i => i.quantity_on_hand <= i.reorder_point)
    .map(i => {
      const product = products.find(p => p.id === i.product_id);
      const warehouse = warehouses.find(w => w.id === i.warehouse_id);
      return {
        id: i.id,
        product_id: i.product_id,
        quantity_on_hand: i.quantity_on_hand,
        reorder_point: i.reorder_point,
        shortage: i.reorder_point - i.quantity_on_hand,
        product_name: product?.name,
        category: product?.category,
        sku: product?.sku,
        supplier: product?.supplier,
        warehouse_name: warehouse?.name
      };
    });
  res.json(lowStock);
});

// Get inventory by product ID
router.get('/product/:productId', async (req, res) => {
  const productId = parseInt(req.params.productId);
  const item = inventory.find(i => i.product_id === productId);
  if (!item) {
    return res.status(404).json({ error: 'Inventory not found' });
  }
  const product = products.find(p => p.id === item.product_id);
  const warehouse = warehouses.find(w => w.id === item.warehouse_id);
  res.json({
    ...item,
    product_name: product?.name,
    warehouse_name: warehouse?.name
  });
});

// Update inventory
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { quantity_on_hand, reorder_point } = req.body;
  const item = inventory.find(i => i.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Inventory not found' });
  }
  if (quantity_on_hand !== undefined) item.quantity_on_hand = quantity_on_hand;
  if (reorder_point !== undefined) item.reorder_point = reorder_point;
  res.json(item);
});

export { inventory, products, warehouses };
export default router;