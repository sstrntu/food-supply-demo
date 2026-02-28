import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { resolveDbPath } from './config';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export function getDbPath(): string {
  return resolveDbPath();
}

export async function getDb(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (!db) {
    const dbPath = getDbPath();
    const dbDir = path.dirname(dbPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

export async function initDb(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  const database = await getDb();

  await database.exec(`
    -- Drop all tables in dependency order
    DROP TABLE IF EXISTS weee_reviews;
    DROP TABLE IF EXISTS product_pairings;
    DROP TABLE IF EXISTS hot_items;
    DROP TABLE IF EXISTS sales_history;
    DROP TABLE IF EXISTS inventory;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS warehouses;

    -- Warehouses
    CREATE TABLE warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Products (with Weee marketplace fields)
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      unit_price REAL NOT NULL,
      supplier TEXT,
      description TEXT,
      weee_listed INTEGER DEFAULT 0,
      weee_url TEXT,
      weee_rating REAL,
      weee_review_count INTEGER DEFAULT 0,
      weee_weekly_sold INTEGER DEFAULT 0,
      weee_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Inventory
    CREATE TABLE inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      reorder_point INTEGER NOT NULL DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, warehouse_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    );

    -- Customers (US territories)
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      store_type TEXT NOT NULL,
      territory TEXT NOT NULL,
      account_manager TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'standard',
      phone TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sales history (daily per-customer per-product)
    CREATE TABLE sales_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      sale_date TEXT NOT NULL,
      quantity_sold INTEGER NOT NULL DEFAULT 0,
      revenue REAL NOT NULL DEFAULT 0,
      was_out_of_stock INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Hot items (daily Weee trending items)
    CREATE TABLE hot_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weee_date TEXT NOT NULL,
      weee_product_name TEXT NOT NULL,
      weee_category TEXT,
      weee_rank INTEGER,
      weee_image_url TEXT,
      matched_product_id INTEGER,
      match_type TEXT,
      match_notes TEXT,
      talking_point TEXT,
      universal_pitch TEXT,
      FOREIGN KEY (matched_product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    -- Product pairings (cross-sell)
    CREATE TABLE product_pairings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      paired_product_id INTEGER NOT NULL,
      pairing_reason TEXT NOT NULL,
      UNIQUE(product_id, paired_product_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (paired_product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Weee customer reviews
    CREATE TABLE weee_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      review_date TEXT NOT NULL,
      verified_buyer INTEGER DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX idx_products_category ON products(category);
    CREATE INDEX idx_products_weee ON products(weee_listed);
    CREATE INDEX idx_inventory_product ON inventory(product_id);
    CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
    CREATE INDEX idx_customers_territory ON customers(territory);
    CREATE INDEX idx_customers_manager ON customers(account_manager);
    CREATE INDEX idx_sales_history_customer ON sales_history(customer_id);
    CREATE INDEX idx_sales_history_product ON sales_history(product_id);
    CREATE INDEX idx_sales_history_date ON sales_history(sale_date);
    CREATE INDEX idx_hot_items_date ON hot_items(weee_date);
    CREATE INDEX idx_weee_reviews_product ON weee_reviews(product_id);
  `);

  return database;
}

export async function seedData(database: Database): Promise<void> {
  // --- WAREHOUSES (US locations) ---
  await database.run(`INSERT INTO warehouses (name, location) VALUES (?, ?)`, ['Main Warehouse', 'Chicago, IL']);
  await database.run(`INSERT INTO warehouses (name, location) VALUES (?, ?)`, ['Cold Storage West', 'Los Angeles, CA']);

  const mainWarehouseId = 1;
  const coldStorageId = 2;

  // --- PRODUCTS (43 Asian grocery items with Weee marketplace data) ---
  const products = [
    // Rice & Grains
    { name: 'Jasmine Rice 5kg', category: 'Rice & Grains', sku: 'RICE-001', price: 12.99, qty: 150, reorder: 50, weee: true, weeeRating: 4.7, weeeReviews: 234, weeeSold: 89, weeePrice: 13.49 },
    { name: 'Basmati Rice 5kg', category: 'Rice & Grains', sku: 'RICE-002', price: 14.99, qty: 120, reorder: 40, weee: true, weeeRating: 4.5, weeeReviews: 156, weeeSold: 62, weeePrice: 15.49 },
    { name: 'Sushi Rice 2kg', category: 'Rice & Grains', sku: 'RICE-003', price: 8.99, qty: 80, reorder: 30, weee: true, weeeRating: 4.8, weeeReviews: 312, weeeSold: 145, weeePrice: 9.49 },
    { name: 'Glutinous Rice 1kg', category: 'Rice & Grains', sku: 'RICE-004', price: 5.99, qty: 60, reorder: 25, weee: true, weeeRating: 4.3, weeeReviews: 87, weeeSold: 34, weeePrice: 6.49 },
    // Sauces
    { name: 'Soy Sauce Premium', category: 'Sauces', sku: 'SAUCE-001', price: 6.50, qty: 200, reorder: 60, weee: true, weeeRating: 4.9, weeeReviews: 547, weeeSold: 203, weeePrice: 6.99 },
    { name: 'Oyster Sauce', category: 'Sauces', sku: 'SAUCE-002', price: 4.99, qty: 180, reorder: 50, weee: true, weeeRating: 4.6, weeeReviews: 198, weeeSold: 78, weeePrice: 5.49 },
    { name: 'Fish Sauce', category: 'Sauces', sku: 'SAUCE-003', price: 3.99, qty: 150, reorder: 45, weee: true, weeeRating: 4.4, weeeReviews: 132, weeeSold: 56, weeePrice: 4.29 },
    { name: 'Hoisin Sauce', category: 'Sauces', sku: 'SAUCE-004', price: 5.49, qty: 100, reorder: 35, weee: false },
    { name: 'Sriracha Chili Sauce', category: 'Sauces', sku: 'SAUCE-005', price: 4.50, qty: 220, reorder: 70, weee: true, weeeRating: 4.8, weeeReviews: 891, weeeSold: 312, weeePrice: 4.99 },
    // Noodles
    { name: 'Ramen Noodles', category: 'Noodles', sku: 'NOODLE-001', price: 3.99, qty: 25, reorder: 40, weee: true, weeeRating: 4.2, weeeReviews: 76, weeeSold: 28, weeePrice: 4.29 },
    { name: 'Udon Noodles', category: 'Noodles', sku: 'NOODLE-002', price: 4.50, qty: 90, reorder: 35, weee: true, weeeRating: 4.5, weeeReviews: 145, weeeSold: 67, weeePrice: 4.99 },
    { name: 'Rice Vermicelli', category: 'Noodles', sku: 'NOODLE-003', price: 2.99, qty: 110, reorder: 40, weee: false },
    { name: 'Egg Noodles', category: 'Noodles', sku: 'NOODLE-004', price: 3.50, qty: 85, reorder: 30, weee: false },
    { name: 'Instant Noodles Variety Pack', category: 'Noodles', sku: 'NOODLE-005', price: 8.99, qty: 75, reorder: 30, weee: true, weeeRating: 4.6, weeeReviews: 423, weeeSold: 178, weeePrice: 9.49 },
    // Frozen
    { name: 'Gyoza Dumplings', category: 'Frozen', sku: 'FROZEN-001', price: 9.99, qty: 60, reorder: 25, weee: true, weeeRating: 4.7, weeeReviews: 289, weeeSold: 134, weeePrice: 10.49 },
    { name: 'Frozen Dumplings', category: 'Frozen', sku: 'FROZEN-002', price: 8.50, qty: 15, reorder: 25, weee: true, weeeRating: 4.4, weeeReviews: 167, weeeSold: 72, weeePrice: 8.99 },
    { name: 'Spring Rolls', category: 'Frozen', sku: 'FROZEN-003', price: 6.99, qty: 70, reorder: 25, weee: true, weeeRating: 4.3, weeeReviews: 98, weeeSold: 45, weeePrice: 7.49 },
    { name: 'Edamame Frozen', category: 'Frozen', sku: 'FROZEN-004', price: 4.99, qty: 90, reorder: 30, weee: false },
    { name: 'Mochi Ice Cream', category: 'Frozen', sku: 'FROZEN-005', price: 7.99, qty: 45, reorder: 20, weee: true, weeeRating: 4.8, weeeReviews: 456, weeeSold: 201, weeePrice: 8.49 },
    // Snacks
    { name: 'Seaweed Snacks', category: 'Snacks', sku: 'SNACK-001', price: 3.50, qty: 180, reorder: 50, weee: true, weeeRating: 4.6, weeeReviews: 345, weeeSold: 156, weeePrice: 3.79 },
    { name: 'Pocky Sticks', category: 'Snacks', sku: 'SNACK-002', price: 2.99, qty: 200, reorder: 60, weee: true, weeeRating: 4.9, weeeReviews: 892, weeeSold: 367, weeePrice: 3.29 },
    { name: 'Rice Crackers', category: 'Snacks', sku: 'SNACK-003', price: 4.50, qty: 140, reorder: 45, weee: true, weeeRating: 4.5, weeeReviews: 234, weeeSold: 98, weeePrice: 4.79 },
    { name: 'Dried Mango', category: 'Snacks', sku: 'SNACK-004', price: 5.99, qty: 95, reorder: 35, weee: true, weeeRating: 4.7, weeeReviews: 567, weeeSold: 234, weeePrice: 6.49 },
    { name: 'Green Tea Kit Kat', category: 'Snacks', sku: 'SNACK-005', price: 6.99, qty: 80, reorder: 30, weee: true, weeeRating: 4.8, weeeReviews: 723, weeeSold: 289, weeePrice: 7.49 },
    // Beverages
    { name: 'Coconut Water', category: 'Beverages', sku: 'BEV-001', price: 2.50, qty: 160, reorder: 50, weee: true, weeeRating: 4.5, weeeReviews: 347, weeeSold: 156, weeePrice: 2.79 },
    { name: 'Thai Tea Mix', category: 'Beverages', sku: 'BEV-002', price: 5.99, qty: 70, reorder: 25, weee: true, weeeRating: 4.3, weeeReviews: 123, weeeSold: 45, weeePrice: 6.49 },
    { name: 'Bubble Tea Kit', category: 'Beverages', sku: 'BEV-003', price: 12.99, qty: 55, reorder: 20, weee: true, weeeRating: 4.6, weeeReviews: 234, weeeSold: 89, weeePrice: 13.99 },
    { name: 'Yakult Probiotic', category: 'Beverages', sku: 'BEV-004', price: 3.99, qty: 120, reorder: 40, weee: false },
    { name: 'Matcha Powder', category: 'Beverages', sku: 'BEV-005', price: 15.99, qty: 40, reorder: 15, weee: true, weeeRating: 4.7, weeeReviews: 198, weeeSold: 78, weeePrice: 16.99 },
    // Spices
    { name: 'Curry Powder', category: 'Spices', sku: 'SPICE-001', price: 4.99, qty: 100, reorder: 35, weee: false },
    { name: 'Five Spice Powder', category: 'Spices', sku: 'SPICE-002', price: 3.99, qty: 85, reorder: 30, weee: false },
    { name: 'Gochugaru Chili Flakes', category: 'Spices', sku: 'SPICE-003', price: 6.99, qty: 65, reorder: 25, weee: true, weeeRating: 4.4, weeeReviews: 89, weeeSold: 34, weeePrice: 7.49 },
    { name: 'Star Anise', category: 'Spices', sku: 'SPICE-004', price: 5.50, qty: 75, reorder: 25, weee: false },
    { name: 'Turmeric Powder', category: 'Spices', sku: 'SPICE-005', price: 3.50, qty: 110, reorder: 40, weee: false },
    // Pantry
    { name: 'Tofu Firm', category: 'Pantry', sku: 'PANTRY-001', price: 2.99, qty: 130, reorder: 45, weee: false },
    { name: 'Tofu Silken', category: 'Pantry', sku: 'PANTRY-002', price: 2.50, qty: 100, reorder: 35, weee: false },
    { name: 'Coconut Milk', category: 'Pantry', sku: 'PANTRY-003', price: 2.99, qty: 170, reorder: 55, weee: true, weeeRating: 4.6, weeeReviews: 267, weeeSold: 112, weeePrice: 3.29 },
    { name: 'Bamboo Shoots', category: 'Pantry', sku: 'PANTRY-004', price: 2.50, qty: 90, reorder: 30, weee: false },
    { name: 'Water Chestnuts', category: 'Pantry', sku: 'PANTRY-005', price: 2.99, qty: 85, reorder: 30, weee: false },
    { name: 'Miso Paste', category: 'Pantry', sku: 'PANTRY-006', price: 6.50, qty: 70, reorder: 25, weee: true, weeeRating: 4.5, weeeReviews: 178, weeeSold: 67, weeePrice: 6.99 },
    { name: 'Sesame Oil', category: 'Pantry', sku: 'PANTRY-007', price: 7.99, qty: 95, reorder: 35, weee: true, weeeRating: 4.7, weeeReviews: 312, weeeSold: 134, weeePrice: 8.49 },
    { name: 'Rice Vinegar', category: 'Pantry', sku: 'PANTRY-008', price: 3.99, qty: 110, reorder: 40, weee: false }
  ];

  // Build SKU->ID map as we insert
  const skuToId: Record<string, number> = {};

  for (const p of products) {
    const result = await database.run(
      `INSERT INTO products (name, category, sku, unit_price, supplier, description, weee_listed, weee_url, weee_rating, weee_review_count, weee_weekly_sold, weee_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.name, p.category, p.sku, p.price, 'U.S. Trading Co', `${p.name} - Premium Quality`,
        p.weee ? 1 : 0,
        p.weee ? `https://www.sayweee.com/en/product/${p.name.replace(/\s+/g, '-')}` : null,
        p.weee ? p.weeeRating : null,
        p.weee ? p.weeeReviews : 0,
        p.weee ? p.weeeSold : 0,
        p.weee ? p.weeePrice : null
      ]
    );

    skuToId[p.sku] = result.lastID!;

    const warehouse = p.category === 'Frozen' ? coldStorageId : mainWarehouseId;
    await database.run(
      `INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, reorder_point) VALUES (?, ?, ?, ?)`,
      [result.lastID, warehouse, p.qty, p.reorder]
    );
  }

  // --- CUSTOMERS (10 accounts across 4 US territories) ---
  const customers = [
    // Chicago/Midwest - Sarah Chen's territory
    { name: 'H Mart Chicago', store_type: 'supermarket', territory: 'Chicago/Midwest', account_manager: 'Sarah Chen', tier: 'key_account', phone: '+1 (312) 555-0101', email: 'buyer@hmartchi.com' },
    { name: 'Joong Boo Market', store_type: 'supermarket', territory: 'Chicago/Midwest', account_manager: 'Sarah Chen', tier: 'standard', phone: '+1 (312) 555-0102', email: 'orders@joongboo.com' },
    { name: 'Ramen Takeya', store_type: 'restaurant', territory: 'Chicago/Midwest', account_manager: 'Sarah Chen', tier: 'standard', phone: '+1 (312) 555-0103', email: 'chef@ramentakeya.com' },
    // West Coast - Marcus Liu's territory
    { name: '99 Ranch Market LA', store_type: 'supermarket', territory: 'West Coast', account_manager: 'Marcus Liu', tier: 'key_account', phone: '+1 (213) 555-0201', email: 'purchasing@99ranch.com' },
    { name: 'Marukai Market', store_type: 'supermarket', territory: 'West Coast', account_manager: 'Marcus Liu', tier: 'standard', phone: '+1 (310) 555-0202', email: 'orders@marukai.com' },
    { name: 'Pho Saigon Restaurant', store_type: 'restaurant', territory: 'West Coast', account_manager: 'Marcus Liu', tier: 'new', phone: '+1 (714) 555-0203', email: 'owner@phosaigon.com' },
    // East Coast - Priya Patel's territory
    { name: 'Patel Brothers NYC', store_type: 'supermarket', territory: 'East Coast', account_manager: 'Priya Patel', tier: 'key_account', phone: '+1 (212) 555-0301', email: 'orders@patelbros.com' },
    { name: 'Hong Kong Supermarket', store_type: 'supermarket', territory: 'East Coast', account_manager: 'Priya Patel', tier: 'standard', phone: '+1 (718) 555-0302', email: 'buyer@hksupermarket.com' },
    // South - David Nguyen's territory
    { name: 'Viet Hoa Market Houston', store_type: 'supermarket', territory: 'South', account_manager: 'David Nguyen', tier: 'key_account', phone: '+1 (713) 555-0401', email: 'purchasing@viethoa.com' },
    { name: 'Asia Market Atlanta', store_type: 'convenience', territory: 'South', account_manager: 'David Nguyen', tier: 'standard', phone: '+1 (404) 555-0402', email: 'info@asiamarketatl.com' },
  ];

  for (const c of customers) {
    await database.run(
      `INSERT INTO customers (name, store_type, territory, account_manager, tier, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.name, c.store_type, c.territory, c.account_manager, c.tier, c.phone, c.email]
    );
  }

  // --- SALES HISTORY (30 days of deterministic data) ---
  // Customer product baskets (customer index -> array of {sku, baseQty, basePrice})
  const customerBaskets: Record<number, { sku: string; baseQty: number }[]> = {
    1: [ // H Mart Chicago - heavy buyer
      { sku: 'RICE-001', baseQty: 12 }, { sku: 'SAUCE-001', baseQty: 20 }, { sku: 'SAUCE-002', baseQty: 15 },
      { sku: 'SNACK-002', baseQty: 30 }, { sku: 'SNACK-003', baseQty: 18 }, { sku: 'BEV-001', baseQty: 35 },
      { sku: 'NOODLE-001', baseQty: 10 }, { sku: 'FROZEN-002', baseQty: 8 }, { sku: 'PANTRY-003', baseQty: 15 },
      { sku: 'FROZEN-001', baseQty: 12 },
    ],
    2: [ // Joong Boo Market
      { sku: 'RICE-001', baseQty: 8 }, { sku: 'RICE-003', baseQty: 6 }, { sku: 'SAUCE-001', baseQty: 14 },
      { sku: 'SAUCE-005', baseQty: 18 }, { sku: 'NOODLE-001', baseQty: 7 }, { sku: 'NOODLE-005', baseQty: 10 },
      { sku: 'SNACK-001', baseQty: 12 }, { sku: 'FROZEN-002', baseQty: 5 },
    ],
    3: [ // Ramen Takeya - restaurant, noodle-heavy
      { sku: 'NOODLE-001', baseQty: 25 }, { sku: 'NOODLE-002', baseQty: 15 }, { sku: 'SAUCE-001', baseQty: 10 },
      { sku: 'SAUCE-005', baseQty: 8 }, { sku: 'PANTRY-006', baseQty: 6 }, { sku: 'BEV-001', baseQty: 5 },
    ],
    4: [ // 99 Ranch LA - large supermarket
      { sku: 'RICE-001', baseQty: 20 }, { sku: 'RICE-002', baseQty: 15 }, { sku: 'SAUCE-001', baseQty: 25 },
      { sku: 'SAUCE-005', baseQty: 22 }, { sku: 'SNACK-002', baseQty: 40 }, { sku: 'SNACK-004', baseQty: 20 },
      { sku: 'BEV-001', baseQty: 30 }, { sku: 'BEV-003', baseQty: 8 }, { sku: 'FROZEN-001', baseQty: 15 },
      { sku: 'FROZEN-005', baseQty: 10 }, { sku: 'PANTRY-007', baseQty: 12 },
    ],
    5: [ // Marukai Market
      { sku: 'RICE-003', baseQty: 10 }, { sku: 'SAUCE-001', baseQty: 12 }, { sku: 'NOODLE-002', baseQty: 8 },
      { sku: 'SNACK-005', baseQty: 15 }, { sku: 'BEV-005', baseQty: 5 }, { sku: 'FROZEN-005', baseQty: 8 },
    ],
    6: [ // Pho Saigon - restaurant, sauce/noodle heavy
      { sku: 'NOODLE-003', baseQty: 20 }, { sku: 'SAUCE-003', baseQty: 15 }, { sku: 'SAUCE-004', baseQty: 8 },
      { sku: 'BEV-001', baseQty: 10 }, { sku: 'PANTRY-003', baseQty: 12 },
    ],
    7: [ // Patel Brothers NYC
      { sku: 'RICE-002', baseQty: 18 }, { sku: 'SPICE-001', baseQty: 15 }, { sku: 'SPICE-005', baseQty: 10 },
      { sku: 'SAUCE-001', baseQty: 16 }, { sku: 'PANTRY-003', baseQty: 20 }, { sku: 'SNACK-004', baseQty: 12 },
      { sku: 'BEV-002', baseQty: 8 },
    ],
    8: [ // Hong Kong Supermarket
      { sku: 'RICE-001', baseQty: 10 }, { sku: 'SAUCE-002', baseQty: 12 }, { sku: 'NOODLE-004', baseQty: 8 },
      { sku: 'SNACK-001', baseQty: 14 }, { sku: 'FROZEN-003', baseQty: 10 }, { sku: 'PANTRY-001', baseQty: 8 },
    ],
    9: [ // Viet Hoa Houston
      { sku: 'RICE-001', baseQty: 15 }, { sku: 'SAUCE-003', baseQty: 20 }, { sku: 'NOODLE-003', baseQty: 18 },
      { sku: 'SNACK-002', baseQty: 22 }, { sku: 'BEV-001', baseQty: 25 }, { sku: 'FROZEN-003', baseQty: 12 },
      { sku: 'PANTRY-003', baseQty: 14 },
    ],
    10: [ // Asia Market Atlanta
      { sku: 'RICE-001', baseQty: 5 }, { sku: 'SAUCE-001', baseQty: 8 }, { sku: 'SAUCE-005', baseQty: 6 },
      { sku: 'SNACK-002', baseQty: 10 }, { sku: 'BEV-004', baseQty: 8 },
    ],
  };

  const today = new Date();

  // Get product prices for revenue calculation
  const productPrices: Record<string, number> = {};
  for (const p of products) {
    productPrices[p.sku] = p.price;
  }

  for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat

    // Weekend multiplier (higher sales Fri-Sun)
    const weekendMult = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) ? 1.3 : 1.0;

    for (const [customerIdStr, basket] of Object.entries(customerBaskets)) {
      const customerId = parseInt(customerIdStr);

      for (const item of basket) {
        const productId = skuToId[item.sku];
        if (!productId) continue;

        // Check for OOS event: Ramen Noodles and Frozen Dumplings for customers 1,2,3 on days 10-14 ago
        const isOosItem = (item.sku === 'NOODLE-001' || item.sku === 'FROZEN-002');
        const isOosCustomer = (customerId <= 3);
        const isOosPeriod = (daysAgo >= 10 && daysAgo <= 14);

        if (isOosItem && isOosCustomer && isOosPeriod) {
          // Out of stock - zero sales
          await database.run(
            `INSERT INTO sales_history (customer_id, product_id, sale_date, quantity_sold, revenue, was_out_of_stock) VALUES (?, ?, ?, ?, ?, ?)`,
            [customerId, productId, dateStr, 0, 0, 1]
          );
          continue;
        }

        // Deterministic variance: use daysAgo to create natural-looking fluctuation
        const variance = 0.7 + ((daysAgo * customerId * 7) % 13) / 20; // 0.7 to 1.35
        const qty = Math.max(1, Math.round(item.baseQty * variance * weekendMult));
        const price = productPrices[item.sku] || 5.00;
        const revenue = Math.round(qty * price * 100) / 100;

        await database.run(
          `INSERT INTO sales_history (customer_id, product_id, sale_date, quantity_sold, revenue, was_out_of_stock) VALUES (?, ?, ?, ?, ?, ?)`,
          [customerId, productId, dateStr, qty, revenue, 0]
        );
      }
    }
  }

  // --- HOT ITEMS (today's 5 Weee trending items) ---
  const todayStr = today.toISOString().split('T')[0];

  const hotItems = [
    {
      weee_product_name: 'Dragonfly Brand Pandan Coconut Rice Mix',
      weee_category: 'Rice & Grains',
      weee_rank: 1,
      matched_sku: 'RICE-004',
      match_type: 'alternative',
      match_notes: 'We carry Glutinous Rice 1kg (RICE-004) — same sticky rice base for coconut rice dishes',
      talking_point: 'Pandan coconut rice is trending #1 on Weee this week with 500+ sold. Our Glutinous Rice is the perfect base — remind stores to stock up before the weekend.',
      universal_pitch: 'Sticky rice dishes are having a moment across Asian grocery — make sure your shelves have our Glutinous Rice before the weekend rush.'
    },
    {
      weee_product_name: 'Pocky Chocolate Sticks 10-pack',
      weee_category: 'Snacks',
      weee_rank: 2,
      matched_sku: 'SNACK-002',
      match_type: 'exact',
      match_notes: 'Exact match: we carry Pocky Sticks (SNACK-002) at $2.99',
      talking_point: 'Pocky is #2 on Weee with 890+ reviews and a 4.9 rating. If you\'re running low, reorder now — weekend demand will spike.',
      universal_pitch: 'Pocky is one of the top trending snacks across Asia this week — great for impulse buys near checkout.'
    },
    {
      weee_product_name: 'Want Want Rice Crackers Family Pack',
      weee_category: 'Snacks',
      weee_rank: 3,
      matched_sku: 'SNACK-003',
      match_type: 'exact',
      match_notes: 'We carry Rice Crackers (SNACK-003) at $4.50 — same product category',
      talking_point: 'Rice cracker family packs are a hot Weee item — our Rice Crackers are a strong alternative at a competitive price point.',
      universal_pitch: 'Family snack packs are surging — use our Rice Crackers as your weekend family shopping pitch.'
    },
    {
      weee_product_name: 'Vita Coconut Water 330ml 6-pack',
      weee_category: 'Beverages',
      weee_rank: 4,
      matched_sku: 'BEV-001',
      match_type: 'exact',
      match_notes: 'Direct match: we carry Coconut Water (BEV-001) at $2.50/unit',
      talking_point: 'Coconut water is #4 trending on Weee — push our Coconut Water to beverage-heavy accounts. It has 347 reviews and 4.5 stars on our Weee listing.',
      universal_pitch: 'Coconut water is on fire across Asian platforms right now — every store should have it front-of-shelf this week.'
    },
    {
      weee_product_name: 'Nissin Cup Noodles Seafood Flavor 6-pack',
      weee_category: 'Noodles',
      weee_rank: 5,
      matched_sku: 'NOODLE-005',
      match_type: 'alternative',
      match_notes: 'We carry Instant Noodles Variety Pack (NOODLE-005) at $8.99 — similar convenience format',
      talking_point: 'Instant noodle multi-packs are surging on Weee — our Variety Pack is the best alternative; great value pitch for family buyers.',
      universal_pitch: 'Instant noodle variety packs are the easiest family meal solution trending right now — lead with them at every stop.'
    },
  ];

  for (const h of hotItems) {
    await database.run(
      `INSERT INTO hot_items (weee_date, weee_product_name, weee_category, weee_rank, matched_product_id, match_type, match_notes, talking_point, universal_pitch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [todayStr, h.weee_product_name, h.weee_category, h.weee_rank, skuToId[h.matched_sku], h.match_type, h.match_notes, h.talking_point, h.universal_pitch]
    );
  }

  // --- HISTORICAL HOT ITEMS (past 7 days) ---
  const historicalHotItems = [
    // Yesterday
    { daysAgo: 1, items: [
      { name: 'Tasco Young Coconut Juice 16.9oz', category: 'Beverages', rank: 1, sku: 'BEV-001', type: 'exact', notes: 'Direct match: Coconut Water (BEV-001)' },
      { name: 'Dragonfly Biscuit Sticks Spicy 400g', category: 'Snacks', rank: 2, sku: 'SNACK-003', type: 'alternative', notes: 'Alternative: Rice Crackers (SNACK-003)' },
      { name: 'Meiji Matcha Chocolate Bar', category: 'Snacks', rank: 3, sku: 'SNACK-005', type: 'alternative', notes: 'Alternative: Green Tea Kit Kat (SNACK-005)' },
      { name: 'Samyang Hot Chicken Ramen 5-pack', category: 'Noodles', rank: 4, sku: 'NOODLE-005', type: 'alternative', notes: 'Alternative: Instant Noodles Variety Pack (NOODLE-005)' },
      { name: 'Orion Choco Pie 12pk', category: 'Snacks', rank: 5, sku: null, type: 'none', notes: 'No direct match in catalog' },
    ]},
    // 2 days ago
    { daysAgo: 2, items: [
      { name: 'Kikkoman Soy Sauce 1L', category: 'Sauces', rank: 1, sku: 'SAUCE-001', type: 'exact', notes: 'Exact match: Soy Sauce Premium (SAUCE-001)' },
      { name: 'Pocky Strawberry 10-pack', category: 'Snacks', rank: 2, sku: 'SNACK-002', type: 'exact', notes: 'Exact match: Pocky Sticks (SNACK-002)' },
      { name: 'Thai Kitchen Coconut Milk', category: 'Pantry', rank: 3, sku: 'PANTRY-003', type: 'exact', notes: 'Exact match: Coconut Milk (PANTRY-003)' },
      { name: 'Mama Instant Noodles Tom Yum', category: 'Noodles', rank: 4, sku: 'NOODLE-005', type: 'alternative', notes: 'Alternative: Instant Noodles Variety Pack (NOODLE-005)' },
      { name: 'Calbee Shrimp Chips', category: 'Snacks', rank: 5, sku: 'SNACK-001', type: 'alternative', notes: 'Alternative: Seaweed Snacks (SNACK-001)' },
    ]},
    // 3 days ago
    { daysAgo: 3, items: [
      { name: 'Nongshim Shin Ramyun 4-pack', category: 'Noodles', rank: 1, sku: 'NOODLE-001', type: 'alternative', notes: 'Alternative: Ramen Noodles (NOODLE-001)' },
      { name: 'Sriracha Hot Chili Sauce 17oz', category: 'Sauces', rank: 2, sku: 'SAUCE-005', type: 'exact', notes: 'Exact match: Sriracha Chili Sauce (SAUCE-005)' },
      { name: 'Mochi Ice Cream Assorted 6pc', category: 'Frozen', rank: 3, sku: 'FROZEN-005', type: 'exact', notes: 'Exact match: Mochi Ice Cream (FROZEN-005)' },
      { name: 'Philippines Dried Mango 100g', category: 'Snacks', rank: 4, sku: 'SNACK-004', type: 'exact', notes: 'Exact match: Dried Mango (SNACK-004)' },
      { name: 'Matcha Latte Powder', category: 'Beverages', rank: 5, sku: 'BEV-005', type: 'alternative', notes: 'Alternative: Matcha Powder (BEV-005)' },
    ]},
    // 4 days ago
    { daysAgo: 4, items: [
      { name: 'Want Want Senbei Rice Crackers', category: 'Snacks', rank: 1, sku: 'SNACK-003', type: 'exact', notes: 'Exact match: Rice Crackers (SNACK-003)' },
      { name: 'Aroy-D Coconut Water 500ml', category: 'Beverages', rank: 2, sku: 'BEV-001', type: 'exact', notes: 'Exact match: Coconut Water (BEV-001)' },
      { name: 'Bibigo Gyoza Dumplings 24pc', category: 'Frozen', rank: 3, sku: 'FROZEN-001', type: 'exact', notes: 'Exact match: Gyoza Dumplings (FROZEN-001)' },
      { name: 'Marukome Miso Paste White', category: 'Pantry', rank: 4, sku: 'PANTRY-006', type: 'exact', notes: 'Exact match: Miso Paste (PANTRY-006)' },
      { name: 'Glico Pretz Original', category: 'Snacks', rank: 5, sku: null, type: 'none', notes: 'No direct match in catalog' },
    ]},
    // 5 days ago
    { daysAgo: 5, items: [
      { name: 'Dragonfly Sweet Rice 5lb', category: 'Rice & Grains', rank: 1, sku: 'RICE-004', type: 'alternative', notes: 'Alternative: Glutinous Rice 1kg (RICE-004)' },
      { name: 'Nissin Cup Noodles Curry', category: 'Noodles', rank: 2, sku: 'NOODLE-005', type: 'alternative', notes: 'Alternative: Instant Noodles Variety Pack (NOODLE-005)' },
      { name: 'Kadoya Sesame Oil 5.5oz', category: 'Pantry', rank: 3, sku: 'PANTRY-007', type: 'exact', notes: 'Exact match: Sesame Oil (PANTRY-007)' },
      { name: 'Thai Tea Powder ChaTraMue', category: 'Beverages', rank: 4, sku: 'BEV-002', type: 'exact', notes: 'Exact match: Thai Tea Mix (BEV-002)' },
      { name: 'Yakult Original 5-pack', category: 'Beverages', rank: 5, sku: 'BEV-004', type: 'exact', notes: 'Exact match: Yakult Probiotic (BEV-004)' },
    ]},
    // 6 days ago
    { daysAgo: 6, items: [
      { name: 'Pocky Matcha 10-pack', category: 'Snacks', rank: 1, sku: 'SNACK-002', type: 'exact', notes: 'Exact match: Pocky Sticks (SNACK-002)' },
      { name: 'Kewpie Mayonnaise 500g', category: 'Sauces', rank: 2, sku: null, type: 'none', notes: 'No direct match — consider adding Japanese mayo' },
      { name: 'Sushi Rice Calrose 5lb', category: 'Rice & Grains', rank: 3, sku: 'RICE-003', type: 'exact', notes: 'Exact match: Sushi Rice 2kg (RICE-003)' },
      { name: 'Spring Roll Wrappers', category: 'Frozen', rank: 4, sku: 'FROZEN-003', type: 'alternative', notes: 'Alternative: Spring Rolls (FROZEN-003)' },
      { name: 'Gochugaru Korean Chili Flakes', category: 'Spices', rank: 5, sku: 'SPICE-003', type: 'exact', notes: 'Exact match: Gochugaru Chili Flakes (SPICE-003)' },
    ]},
  ];

  for (const day of historicalHotItems) {
    const d = new Date(today);
    d.setDate(d.getDate() - day.daysAgo);
    const dateStr = d.toISOString().split('T')[0];
    for (const item of day.items) {
      await database.run(
        `INSERT INTO hot_items (weee_date, weee_product_name, weee_category, weee_rank, matched_product_id, match_type, match_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dateStr, item.name, item.category, item.rank, item.sku ? skuToId[item.sku] || null : null, item.type, item.notes]
      );
    }
  }

  // --- PRODUCT PAIRINGS (cross-sell relationships) ---
  const pairings = [
    { a: 'SNACK-002', b: 'BEV-001', reason: 'Pocky and coconut water is a classic Asian convenience store combo — drives basket size at checkout displays' },
    { a: 'RICE-001', b: 'SAUCE-001', reason: 'Every jasmine rice buyer needs soy sauce — bundle pitch for supermarket buyers' },
    { a: 'NOODLE-001', b: 'SAUCE-005', reason: 'Sriracha is the #1 condiment add-on for ramen — suggest as an "upgrade your noodles" pitch' },
    { a: 'FROZEN-001', b: 'SAUCE-001', reason: 'Gyoza dumplings always need dipping sauce — bundle for frozen section displays' },
    { a: 'FROZEN-002', b: 'SAUCE-003', reason: 'Frozen dumplings pair with fish sauce for a Vietnamese-style dipping sauce' },
    { a: 'BEV-005', b: 'FROZEN-005', reason: 'Matcha powder and mochi ice cream are a premium Japanese dessert combo — great for specialty stores' },
    { a: 'PANTRY-003', b: 'SPICE-001', reason: 'Coconut milk and curry powder are the two-ingredient curry kit — cross-sell for restaurant and home cook segments' },
    { a: 'SNACK-003', b: 'SNACK-001', reason: 'Rice crackers and seaweed snacks form an Asian snack tray — great for convenience stores near offices' },
    { a: 'BEV-002', b: 'PANTRY-003', reason: 'Thai tea mix requires coconut milk — strong cooking bundle for restaurant buyers' },
    { a: 'NOODLE-005', b: 'PANTRY-006', reason: 'Miso paste elevates instant noodles into a proper ramen bowl — pitch as an easy home cooking upgrade' },
    { a: 'RICE-004', b: 'PANTRY-003', reason: 'Glutinous rice and coconut milk make pandan desserts and mango sticky rice — trending combo from Weee' },
    { a: 'SNACK-005', b: 'BEV-005', reason: 'Green Tea Kit Kat and matcha powder — premium Japanese matcha bundle for specialty shoppers' },
  ];

  for (const pair of pairings) {
    const aId = skuToId[pair.a];
    const bId = skuToId[pair.b];
    if (aId && bId) {
      await database.run(
        `INSERT INTO product_pairings (product_id, paired_product_id, pairing_reason) VALUES (?, ?, ?)`,
        [aId, bId, pair.reason]
      );
    }
  }

  // --- WEEE REVIEWS (realistic customer reviews for our listed products) ---
  const reviews = [
    // Jasmine Rice
    { sku: 'RICE-001', reviewer: 'Jenny L.', rating: 5, comment: 'Best jasmine rice I\'ve found! Fragrant and cooks perfectly every time.', date: -3 },
    { sku: 'RICE-001', reviewer: 'Michael T.', rating: 4, comment: 'Good quality rice. The 5kg bag lasts my family about 2 weeks.', date: -7 },
    { sku: 'RICE-001', reviewer: 'Amy W.', rating: 5, comment: 'Authentic Thai jasmine rice. Bought multiple times and always consistent.', date: -12 },
    // Soy Sauce
    { sku: 'SAUCE-001', reviewer: 'Calvin', rating: 5, comment: 'Premium quality soy sauce. Rich flavor, not too salty. Perfect for cooking and dipping.', date: -2 },
    { sku: 'SAUCE-001', reviewer: 'lorntara', rating: 5, comment: 'Reasonably priced and great taste. Use it for everything.', date: -5 },
    // Sriracha
    { sku: 'SAUCE-005', reviewer: 'David K.', rating: 5, comment: 'The original and best sriracha. Nothing else compares.', date: -1 },
    { sku: 'SAUCE-005', reviewer: 'Sarah M.', rating: 5, comment: 'Put this on everything! Great heat level, amazing flavor.', date: -4 },
    { sku: 'SAUCE-005', reviewer: 'Tommy R.', rating: 4, comment: 'Good sriracha, would love a bigger bottle option.', date: -8 },
    // Pocky
    { sku: 'SNACK-002', reviewer: 'Marie Lou', rating: 5, comment: 'Classic Pocky! Kids love them. Bought 3 packs for the week.', date: -1 },
    { sku: 'SNACK-002', reviewer: 'momovleat9', rating: 5, comment: 'The taste is better than fresh. Always in stock on Weee!', date: -3 },
    { sku: 'SNACK-002', reviewer: 'Asta', rating: 5, comment: 'I\'m excited to try and have for breakfast!! Great snack.', date: -6 },
    // Coconut Water
    { sku: 'BEV-001', reviewer: 'Calvin', rating: 5, comment: 'Nice and refreshing. Bought multiple times.', date: -2 },
    { sku: 'BEV-001', reviewer: 'Marie Lou', rating: 5, comment: 'Refreshing and delicious, it helps to muscle cramps.', date: -5 },
    { sku: 'BEV-001', reviewer: 'lorntara', rating: 4, comment: 'Reasonably priced sweet coco juice.', date: -10 },
    // Green Tea Kit Kat
    { sku: 'SNACK-005', reviewer: 'Lisa C.', rating: 5, comment: 'Authentic matcha flavor! Way better than the US version.', date: -2 },
    { sku: 'SNACK-005', reviewer: 'Kevin P.', rating: 5, comment: 'Japanese Kit Kats are on another level. Matcha is the best flavor.', date: -4 },
    // Mochi Ice Cream
    { sku: 'FROZEN-005', reviewer: 'Nina K.', rating: 5, comment: 'Best mochi ice cream! Soft shell, creamy filling.', date: -1 },
    { sku: 'FROZEN-005', reviewer: 'James H.', rating: 4, comment: 'Great variety of flavors. The matcha one is amazing.', date: -3 },
    { sku: 'FROZEN-005', reviewer: 'Rachel S.', rating: 5, comment: 'These disappeared in one day at our house party!', date: -7 },
    // Dried Mango
    { sku: 'SNACK-004', reviewer: 'Anna B.', rating: 5, comment: 'Sweet, chewy, perfect. Best dried mango I\'ve had.', date: -2 },
    { sku: 'SNACK-004', reviewer: 'Chris D.', rating: 4, comment: 'Good snack for the office. Not too sweet.', date: -6 },
    // Instant Noodles
    { sku: 'NOODLE-005', reviewer: 'Tom W.', rating: 5, comment: 'Great variety pack! Love having different flavors to choose from.', date: -1 },
    { sku: 'NOODLE-005', reviewer: 'Sophia L.', rating: 4, comment: 'Good instant noodles. Wish they had a spicier option.', date: -5 },
    // Gyoza
    { sku: 'FROZEN-001', reviewer: 'Mark T.', rating: 5, comment: 'Restaurant quality gyoza at home! The filling is so juicy.', date: -2 },
    { sku: 'FROZEN-001', reviewer: 'Diana F.', rating: 5, comment: 'Easy to cook, tastes amazing. My kids ask for these every week.', date: -4 },
    // Sesame Oil
    { sku: 'PANTRY-007', reviewer: 'Chef Andy', rating: 5, comment: 'Pure sesame oil with deep, nutty flavor. A little goes a long way.', date: -3 },
    { sku: 'PANTRY-007', reviewer: 'Linda Y.', rating: 5, comment: 'This is my go-to sesame oil. Authentic taste.', date: -8 },
    // Sushi Rice
    { sku: 'RICE-003', reviewer: 'Yuki M.', rating: 5, comment: 'Perfect sushi rice! Sticky and sweet, just like in Japan.', date: -1 },
    { sku: 'RICE-003', reviewer: 'Brian S.', rating: 5, comment: 'Makes amazing onigiri. Great quality for the price.', date: -4 },
    // Bubble Tea Kit
    { sku: 'BEV-003', reviewer: 'Emily Z.', rating: 5, comment: 'So fun to make bubble tea at home! Tapioca pearls are perfect.', date: -3 },
    { sku: 'BEV-003', reviewer: 'Alex N.', rating: 4, comment: 'Good kit but wish it came with more tapioca pearls.', date: -9 },
  ];

  for (const r of reviews) {
    const productId = skuToId[r.sku];
    if (!productId) continue;
    const reviewDate = new Date(today);
    reviewDate.setDate(reviewDate.getDate() + r.date);
    const reviewDateStr = reviewDate.toISOString().split('T')[0];

    await database.run(
      `INSERT INTO weee_reviews (product_id, reviewer_name, rating, comment, review_date, verified_buyer) VALUES (?, ?, ?, ?, ?, ?)`,
      [productId, r.reviewer, r.rating, r.comment, reviewDateStr, 1]
    );
  }
}
