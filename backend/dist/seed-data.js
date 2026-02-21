const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database/food_supply.db');
const db = new sqlite3.Database(dbPath);

const products = [
  ['Jasmine Rice (5kg)', 'Rice & Noodles', 'RICE-JAS-5KG', 15.99, 'Thai Best Foods', 'Premium Thai jasmine rice'],
  ['Sushi Rice (2kg)', 'Rice & Noodles', 'RICE-SUS-2KG', 12.99, 'Nishiki', 'Short grain Japanese sushi rice'],
  ['Basmati Rice (5kg)', 'Rice & Noodles', 'RICE-BAS-5KG', 18.99, 'India Gate', 'Aged long grain basmati rice'],
  ['Ramen Noodles (Pack of 5)', 'Rice & Noodles', 'NOOD-RAM-5PK', 4.99, 'Nissin', 'Japanese instant ramen noodles'],
  ['Udon Noodles (3 packs)', 'Rice & Noodles', 'NOOD-UDN-3PK', 6.49, 'Hakubaku', 'Thick Japanese wheat noodles'],
  ['Rice Noodles (Pad Thai)', 'Rice & Noodles', 'NOOD-RIC-PTH', 3.99, 'Thai Kitchen', 'Flat rice noodles for Pad Thai'],
  ['Soba Noodles', 'Rice & Noodles', 'NOOD-SOB-250G', 4.49, 'Hakubaku', 'Japanese buckwheat noodles'],
  ['Soy Sauce (Light)', 'Sauces & Condiments', 'SAUCE-SOY-LIT', 3.49, 'Kikkoman', 'Japanese light soy sauce'],
  ['Soy Sauce (Dark)', 'Sauces & Condiments', 'SAUCE-SOY-DRK', 3.99, 'Pearl River Bridge', 'Chinese dark soy sauce'],
  ['Fish Sauce', 'Sauces & Condiments', 'SAUCE-FISH', 4.49, 'Red Boat', 'Premium Vietnamese fish sauce'],
  ['Oyster Sauce', 'Sauces & Condiments', 'SAUCE-OYSTER', 5.99, 'Lee Kum Kee', 'Classic Chinese oyster sauce'],
  ['Sriracha Chili Sauce', 'Sauces & Condiments', 'SAUCE-SRI-500', 4.99, 'Huy Fong', 'Thai chili garlic sauce'],
  ['Gochujang (Korean Chili Paste)', 'Sauces & Condiments', 'SAUCE-GOCH', 6.99, 'Chung Jung One', 'Korean fermented chili paste'],
  ['Frozen Dumplings (Pork)', 'Frozen Foods', 'FROZ-DUM-PORK', 8.99, 'Wei-Chuan', 'Chinese dumplings, 50 count'],
  ['Frozen Gyoza (Chicken)', 'Frozen Foods', 'FROZ-GYO-CHK', 7.99, 'Ajinomoto', 'Japanese pan-fried dumplings'],
  ['Spring Rolls (Vegetable)', 'Frozen Foods', 'FROZ-SPR-VEG', 5.99, 'Tai Pei', 'Crispy vegetable spring rolls'],
  ['Edamame (Shelled)', 'Frozen Foods', 'FROZ-EDA-SHL', 4.49, 'Seapoint Farms', 'Frozen young soybeans'],
  ['Pocky Sticks', 'Snacks', 'SNACK-POCKY', 3.49, 'Glico', 'Japanese biscuit sticks'],
  ['Seaweed Snacks', 'Snacks', 'SNACK-SEAWEED', 2.99, 'Tao Kae Noi', 'Crispy seaweed sheets'],
  ['Rice Crackers', 'Snacks', 'SNACK-CRACKER', 4.29, 'Kameda', 'Japanese rice crackers'],
  ['Thai Tea Mix', 'Beverages', 'BEV-THAI-TEA', 6.99, 'Cha Tra Mue', 'Traditional Thai tea'],
  ['Bubble Tea Pearls', 'Beverages', 'BEV-BOBA', 5.49, 'WuFuYuan', 'Tapioca pearls for bubble tea'],
  ['Miso Paste', 'Spices', 'SPICE-MISO', 4.99, 'Marukome', 'Japanese fermented soybean paste'],
  ['Curry Cubes (Japanese)', 'Spices', 'SPICE-CURRY', 5.99, 'S&B', 'Japanese curry roux'],
  ['Nori Sheets', 'Spices', 'SPICE-NORI', 3.99, 'Yamamotoyama', 'Roasted seaweed for sushi']
];

const inventory = [
  [1, 1, 150, 50], [2, 1, 80, 30], [3, 1, 200, 60],
  [4, 1, 25, 40], [5, 1, 120, 45], [6, 1, 180, 50],
  [7, 1, 90, 35], [8, 1, 300, 100], [9, 1, 250, 80],
  [10, 1, 120, 50], [11, 1, 200, 70], [12, 1, 150, 60],
  [13, 1, 80, 30], [14, 1, 15, 25], [15, 1, 40, 30],
  [16, 1, 60, 40], [17, 1, 100, 50], [18, 1, 200, 80],
  [19, 1, 150, 60], [20, 1, 120, 50], [21, 1, 90, 40],
  [22, 1, 200, 75], [23, 1, 80, 35], [24, 1, 120, 45],
  [25, 1, 180, 70]
];

db.serialize(() => {
  // Clear existing data
  db.run("DELETE FROM inventory");
  db.run("DELETE FROM products");
  db.run("DELETE FROM warehouses");
  
  // Insert warehouse
  db.run("INSERT OR REPLACE INTO warehouses (id, name, location) VALUES (1, 'Main Warehouse', 'Bangkok, Thailand')");
  
  // Insert products
  const prodStmt = db.prepare("INSERT INTO products (name, category, sku, unit_price, supplier, description) VALUES (?, ?, ?, ?, ?, ?)");
  products.forEach(p => prodStmt.run(p));
  prodStmt.finalize();
  
  // Insert inventory
  const invStmt = db.prepare("INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, reorder_point) VALUES (?, ?, ?, ?)");
  inventory.forEach(i => invStmt.run(i));
  invStmt.finalize();
  
  console.log(`✅ Seeded ${products.length} products and ${inventory.length} inventory items`);
});

db.close();
