"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDb = initDb;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let db = null;
// Check multiple paths for Docker compatibility
function getDbPath() {
    const paths = [
        path_1.default.join(__dirname, '../../database/food_supply.db'), // Development
        '/app/database/food_supply.db', // Docker
        path_1.default.join(process.cwd(), 'database/food_supply.db') // Fallback
    ];
    for (const p of paths) {
        const dir = path_1.default.dirname(p);
        if (fs_1.default.existsSync(dir)) {
            console.log('Using database path:', p);
            return p;
        }
    }
    // Default to Docker path if none found
    console.log('Using default database path:', paths[1]);
    return paths[1];
}
async function getDb() {
    if (!db) {
        const dbPath = getDbPath();
        const dbDir = path_1.default.dirname(dbPath);
        // Create directory if it doesn't exist
        if (!fs_1.default.existsSync(dbDir)) {
            console.log('Creating database directory:', dbDir);
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
        db = await (0, sqlite_1.open)({
            filename: dbPath,
            driver: sqlite3_1.default.Database
        });
    }
    return db;
}
async function initDb() {
    const database = await getDb();
    // Create tables
    await database.exec(`
    -- Drop existing tables
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS inventory;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS warehouses;
    
    -- Create warehouses table
    CREATE TABLE warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create products table
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      unit_price REAL NOT NULL,
      supplier TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create inventory table
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
    
    -- Create orders table
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT,
      status TEXT DEFAULT 'pending',
      total_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      shipped_at DATETIME,
      delivered_at DATETIME
    );
    
    -- Create order_items table
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    
    -- Create indexes
    CREATE INDEX idx_products_category ON products(category);
    CREATE INDEX idx_inventory_product ON inventory(product_id);
    CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_created ON orders(created_at);
  `);
    console.log('Database initialized successfully');
    // Seed with sample data
    await seedData(database);
    return database;
}
async function seedData(db) {
    // Insert warehouses
    await db.run(`INSERT INTO warehouses (name, location) VALUES (?, ?)`, ['Main Warehouse', 'Singapore']);
    await db.run(`INSERT INTO warehouses (name, location) VALUES (?, ?)`, ['Cold Storage', 'Singapore']);
    const warehouseId = 1;
    const coldStorageId = 2;
    // Asian grocery products
    const products = [
        { name: 'Jasmine Rice 5kg', category: 'Rice & Grains', sku: 'RICE-001', price: 12.99, qty: 150, reorder: 50 },
        { name: 'Basmati Rice 5kg', category: 'Rice & Grains', sku: 'RICE-002', price: 14.99, qty: 120, reorder: 40 },
        { name: 'Sushi Rice 2kg', category: 'Rice & Grains', sku: 'RICE-003', price: 8.99, qty: 80, reorder: 30 },
        { name: 'Glutinous Rice 1kg', category: 'Rice & Grains', sku: 'RICE-004', price: 5.99, qty: 60, reorder: 25 },
        { name: 'Soy Sauce Premium', category: 'Sauces', sku: 'SAUCE-001', price: 6.50, qty: 200, reorder: 60 },
        { name: 'Oyster Sauce', category: 'Sauces', sku: 'SAUCE-002', price: 4.99, qty: 180, reorder: 50 },
        { name: 'Fish Sauce', category: 'Sauces', sku: 'SAUCE-003', price: 3.99, qty: 150, reorder: 45 },
        { name: 'Hoisin Sauce', category: 'Sauces', sku: 'SAUCE-004', price: 5.49, qty: 100, reorder: 35 },
        { name: 'Sriracha Chili Sauce', category: 'Sauces', sku: 'SAUCE-005', price: 4.50, qty: 220, reorder: 70 },
        { name: 'Ramen Noodles', category: 'Noodles', sku: 'NOODLE-001', price: 3.99, qty: 25, reorder: 40 },
        { name: 'Udon Noodles', category: 'Noodles', sku: 'NOODLE-002', price: 4.50, qty: 90, reorder: 35 },
        { name: 'Rice Vermicelli', category: 'Noodles', sku: 'NOODLE-003', price: 2.99, qty: 110, reorder: 40 },
        { name: 'Egg Noodles', category: 'Noodles', sku: 'NOODLE-004', price: 3.50, qty: 85, reorder: 30 },
        { name: 'Instant Noodles Variety Pack', category: 'Noodles', sku: 'NOODLE-005', price: 8.99, qty: 75, reorder: 30 },
        { name: 'Gyoza Dumplings', category: 'Frozen', sku: 'FROZEN-001', price: 9.99, qty: 60, reorder: 25 },
        { name: 'Frozen Dumplings', category: 'Frozen', sku: 'FROZEN-002', price: 8.50, qty: 15, reorder: 25 },
        { name: 'Spring Rolls', category: 'Frozen', sku: 'FROZEN-003', price: 6.99, qty: 70, reorder: 25 },
        { name: 'Edamame Frozen', category: 'Frozen', sku: 'FROZEN-004', price: 4.99, qty: 90, reorder: 30 },
        { name: 'Mochi Ice Cream', category: 'Frozen', sku: 'FROZEN-005', price: 7.99, qty: 45, reorder: 20 },
        { name: 'Seaweed Snacks', category: 'Snacks', sku: 'SNACK-001', price: 3.50, qty: 180, reorder: 50 },
        { name: 'Pocky Sticks', category: 'Snacks', sku: 'SNACK-002', price: 2.99, qty: 200, reorder: 60 },
        { name: 'Rice Crackers', category: 'Snacks', sku: 'SNACK-003', price: 4.50, qty: 140, reorder: 45 },
        { name: 'Dried Mango', category: 'Snacks', sku: 'SNACK-004', price: 5.99, qty: 95, reorder: 35 },
        { name: 'Green Tea Kit Kat', category: 'Snacks', sku: 'SNACK-005', price: 6.99, qty: 80, reorder: 30 },
        { name: 'Coconut Water', category: 'Beverages', sku: 'BEV-001', price: 2.50, qty: 160, reorder: 50 },
        { name: 'Thai Tea Mix', category: 'Beverages', sku: 'BEV-002', price: 5.99, qty: 70, reorder: 25 },
        { name: 'Bubble Tea Kit', category: 'Beverages', sku: 'BEV-003', price: 12.99, qty: 55, reorder: 20 },
        { name: 'Yakult Probiotic', category: 'Beverages', sku: 'BEV-004', price: 3.99, qty: 120, reorder: 40 },
        { name: 'Matcha Powder', category: 'Beverages', sku: 'BEV-005', price: 15.99, qty: 40, reorder: 15 },
        { name: 'Curry Powder', category: 'Spices', sku: 'SPICE-001', price: 4.99, qty: 100, reorder: 35 },
        { name: 'Five Spice Powder', category: 'Spices', sku: 'SPICE-002', price: 3.99, qty: 85, reorder: 30 },
        { name: 'Gochugaru Chili Flakes', category: 'Spices', sku: 'SPICE-003', price: 6.99, qty: 65, reorder: 25 },
        { name: 'Star Anise', category: 'Spices', sku: 'SPICE-004', price: 5.50, qty: 75, reorder: 25 },
        { name: 'Turmeric Powder', category: 'Spices', sku: 'SPICE-005', price: 3.50, qty: 110, reorder: 40 },
        { name: 'Tofu Firm', category: 'Pantry', sku: 'PANTRY-001', price: 2.99, qty: 130, reorder: 45 },
        { name: 'Tofu Silken', category: 'Pantry', sku: 'PANTRY-002', price: 2.50, qty: 100, reorder: 35 },
        { name: 'Coconut Milk', category: 'Pantry', sku: 'PANTRY-003', price: 2.99, qty: 170, reorder: 55 },
        { name: 'Bamboo Shoots', category: 'Pantry', sku: 'PANTRY-004', price: 2.50, qty: 90, reorder: 30 },
        { name: 'Water Chestnuts', category: 'Pantry', sku: 'PANTRY-005', price: 2.99, qty: 85, reorder: 30 },
        { name: 'Miso Paste', category: 'Pantry', sku: 'PANTRY-006', price: 6.50, qty: 70, reorder: 25 },
        { name: 'Sesame Oil', category: 'Pantry', sku: 'PANTRY-007', price: 7.99, qty: 95, reorder: 35 },
        { name: 'Rice Vinegar', category: 'Pantry', sku: 'PANTRY-008', price: 3.99, qty: 110, reorder: 40 }
    ];
    for (const p of products) {
        const result = await db.run(`INSERT INTO products (name, category, sku, unit_price, supplier, description) VALUES (?, ?, ?, ?, ?, ?)`, [p.name, p.category, p.sku, p.price, 'Asian Foods Co', `${p.name} - Premium Quality`]);
        const productId = result.lastID;
        const warehouse = p.category === 'Frozen' ? coldStorageId : warehouseId;
        await db.run(`INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, reorder_point) VALUES (?, ?, ?, ?)`, [productId, warehouse, p.qty, p.reorder]);
    }
    console.log(`Seeded ${products.length} products`);
}
//# sourceMappingURL=db.js.map