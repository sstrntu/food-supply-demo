const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../database/food_supply.db');

// Ensure directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Create tables
  db.run(`DROP TABLE IF EXISTS order_items`);
  db.run(`DROP TABLE IF EXISTS orders`);
  db.run(`DROP TABLE IF EXISTS inventory`);
  db.run(`DROP TABLE IF EXISTS products`);
  db.run(`DROP TABLE IF EXISTS warehouses`);
  
  db.run(`CREATE TABLE warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL
  )`);
  
  db.run(`CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    unit_price REAL NOT NULL,
    supplier TEXT,
    description TEXT
  )`);
  
  db.run(`CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    reorder_point INTEGER NOT NULL DEFAULT 10,
    UNIQUE(product_id, warehouse_id)
  )`);
  
  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT,
    status TEXT DEFAULT 'pending',
    total_amount REAL DEFAULT 0
  )`);
  
  // Insert warehouse
  db.run(`INSERT INTO warehouses (name, location) VALUES ('Main Warehouse', 'Bangkok, Thailand')`);
  
  // Insert products
  const products = [
    ['Jasmine Rice (5kg)', 'Rice & Noodles', 'RICE-JAS-5KG', 15.99, 'Thai Best Foods', 'Premium Thai jasmine rice'],
    ['Sushi Rice (2kg)', 'Rice & Noodles', 'RICE-SUS-2KG', 12.99, 'Nishiki', 'Short grain Japanese sushi rice'],
    ['Basmati Rice (5kg)', 'Rice & Noodles', 'RICE-BAS-5KG', 18.99, 'India Gate', 'Aged long grain basmati rice'],
    ['Ramen Noodles', 'Rice & Noodles', 'NOOD-RAM', 4.99, 'Nissin', 'Japanese instant ramen'],
    ['Soy Sauce', 'Sauces', 'SAUCE-SOY', 3.49, 'Kikkoman', 'Japanese soy sauce'],
    ['Sriracha', 'Sauces', 'SAUCE-SRI', 4.99, 'Huy Fong', 'Thai chili sauce'],
    ['Frozen Dumplings', 'Frozen', 'FROZ-DUM', 8.99, 'Wei-Chuan', 'Chinese dumplings'],
    ['Spring Rolls', 'Frozen', 'FROZ-SPR', 5.99, 'Tai Pei', 'Vegetable spring rolls'],
    ['Pocky', 'Snacks', 'SNACK-POCKY', 3.49, 'Glico', 'Japanese biscuit sticks'],
    ['Thai Tea', 'Beverages', 'BEV-THAI', 6.99, 'Cha Tra Mue', 'Traditional Thai tea']
  ];
  
  const productStmt = db.prepare(`INSERT INTO products (name, category, sku, unit_price, supplier, description) VALUES (?, ?, ?, ?, ?, ?)`);
  products.forEach(p => productStmt.run(p));
  productStmt.finalize();
  
  // Insert inventory
  const inventory = [
    [1, 1, 150, 50], [2, 1, 80, 30], [3, 1, 200, 60],
    [4, 1, 25, 40], [5, 1, 300, 100], [6, 1, 120, 50],
    [7, 1, 15, 20], [8, 1, 45, 30], [9, 1, 200, 80], [10, 1, 60, 25]
  ];
  
  const invStmt = db.prepare(`INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, reorder_point) VALUES (?, ?, ?, ?)`);
  inventory.forEach(i => invStmt.run(i));
  invStmt.finalize();
  
  // Insert orders
  db.run(`INSERT INTO orders (customer_id, status, total_amount) VALUES ('CUST001', 'completed', 125.50)`);
  db.run(`INSERT INTO orders (customer_id, status, total_amount) VALUES ('CUST002', 'pending', 89.99)`);
  
  console.log('Database initialized and seeded successfully!');
});

db.close();
