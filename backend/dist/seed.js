"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const categories = {
    RICE_NOODLES: 'Rice & Noodles',
    SAUCES: 'Sauces & Condiments',
    FROZEN: 'Frozen Foods',
    SNACKS: 'Snacks',
    BEVERAGES: 'Beverages',
    SPICES: 'Spices',
    CANNED: 'Canned Goods'
};
const products = [
    // Rice & Noodles
    { name: 'Jasmine Rice (5kg)', category: categories.RICE_NOODLES, sku: 'RICE-JAS-5KG', unit_price: 15.99, supplier: 'Thai Best Foods', description: 'Premium Thai jasmine rice' },
    { name: 'Sushi Rice (2kg)', category: categories.RICE_NOODLES, sku: 'RICE-SUS-2KG', unit_price: 12.99, supplier: 'Nishiki', description: 'Short grain Japanese sushi rice' },
    { name: 'Basmati Rice (5kg)', category: categories.RICE_NOODLES, sku: 'RICE-BAS-5KG', unit_price: 18.99, supplier: 'India Gate', description: 'Aged long grain basmati rice' },
    { name: 'Ramen Noodles (Pack of 5)', category: categories.RICE_NOODLES, sku: 'NOOD-RAM-5PK', unit_price: 4.99, supplier: 'Nissin', description: 'Japanese instant ramen noodles' },
    { name: 'Udon Noodles (3 packs)', category: categories.RICE_NOODLES, sku: 'NOOD-UDN-3PK', unit_price: 6.49, supplier: 'Hakubaku', description: 'Thick Japanese wheat noodles' },
    { name: 'Rice Noodles (Pad Thai)', category: categories.RICE_NOODLES, sku: 'NOOD-RIC-PTH', unit_price: 3.99, supplier: 'Thai Kitchen', description: 'Flat rice noodles for Pad Thai' },
    { name: 'Soba Noodles', category: categories.RICE_NOODLES, sku: 'NOOD-SOB-250G', unit_price: 4.49, supplier: 'Hakubaku', description: 'Japanese buckwheat noodles' },
    { name: 'Vermicelli Rice Noodles', category: categories.RICE_NOODLES, sku: 'NOOD-VER-400G', unit_price: 2.99, supplier: 'Three Ladies', description: 'Thin rice vermicelli' },
    { name: 'Glutinous Rice (Sticky Rice)', category: categories.RICE_NOODLES, sku: 'RICE-GLU-1KG', unit_price: 5.99, supplier: 'Golden Phoenix', description: 'Thai sticky rice' },
    // Sauces & Condiments
    { name: 'Soy Sauce (Light)', category: categories.SAUCES, sku: 'SAUCE-SOY-LIT', unit_price: 3.49, supplier: 'Kikkoman', description: 'Japanese light soy sauce' },
    { name: 'Soy Sauce (Dark)', category: categories.SAUCES, sku: 'SAUCE-SOY-DRK', unit_price: 3.99, supplier: 'Pearl River Bridge', description: 'Chinese dark soy sauce' },
    { name: 'Fish Sauce', category: categories.SAUCES, sku: 'SAUCE-FISH', unit_price: 4.49, supplier: 'Red Boat', description: 'Premium Vietnamese fish sauce' },
    { name: 'Oyster Sauce', category: categories.SAUCES, sku: 'SAUCE-OYSTER', unit_price: 5.99, supplier: 'Lee Kum Kee', description: 'Classic Chinese oyster sauce' },
    { name: 'Sriracha Chili Sauce', category: categories.SAUCES, sku: 'SAUCE-SRI-500', unit_price: 4.99, supplier: 'Huy Fong', description: 'Thai chili garlic sauce' },
    { name: 'Gochujang (Korean Chili Paste)', category: categories.SAUCES, sku: 'SAUCE-GOCH', unit_price: 6.99, supplier: 'Chung Jung One', description: 'Korean fermented chili paste' },
    { name: 'Hoisin Sauce', category: categories.SAUCES, sku: 'SAUCE-HOISIN', unit_price: 3.99, supplier: 'Lee Kum Kee', description: 'Sweet Chinese barbecue sauce' },
    { name: 'Teriyaki Sauce', category: categories.SAUCES, sku: 'SAUCE-TERI', unit_price: 4.49, supplier: 'Kikkoman', description: 'Japanese sweet soy glaze' },
    { name: 'Black Bean Sauce', category: categories.SAUCES, sku: 'SAUCE-BLACK', unit_price: 3.79, supplier: 'Lee Kum Kee', description: 'Fermented black bean sauce' },
    { name: 'Chili Oil', category: categories.SAUCES, sku: 'SAUCE-CHILI-OIL', unit_price: 5.49, supplier: 'Lao Gan Ma', description: 'Spicy Chinese chili crisp oil' },
    { name: 'Rice Vinegar', category: categories.SAUCES, sku: 'SAUCE-VIN-RIC', unit_price: 2.99, supplier: 'Marukan', description: 'Seasoned rice vinegar' },
    // Frozen Foods
    { name: 'Frozen Dumplings (Pork & Chive)', category: categories.FROZEN, sku: 'FROZ-DUM-PORK', unit_price: 8.99, supplier: 'Wei-Chuan', description: 'Chinese dumplings, 50 count' },
    { name: 'Frozen Gyoza (Chicken)', category: categories.FROZEN, sku: 'FROZ-GYO-CHK', unit_price: 7.99, supplier: 'Ajinomoto', description: 'Japanese pan-fried dumplings' },
    { name: 'Spring Rolls (Vegetable)', category: categories.FROZEN, sku: 'FROZ-SPR-VEG', unit_price: 5.99, supplier: 'Tai Pei', description: 'Crispy vegetable spring rolls' },
    { name: 'Edamame (Shelled)', category: categories.FROZEN, sku: 'FROZ-EDA-SHL', unit_price: 4.49, supplier: 'Seapoint Farms', description: 'Frozen young soybeans' },
    { name: 'Frozen Edamame in Pods', category: categories.FROZEN, sku: 'FROZ-EDA-POD', unit_price: 3.99, supplier: 'Seapoint Farms', description: 'Steamed edamame pods' },
    { name: 'Dim Sum Assortment', category: categories.FROZEN, sku: 'FROZ-DIM-ASM', unit_price: 12.99, supplier: 'Royal Asia', description: 'Mixed dim sum selection' },
    { name: 'Frozen Udon Noodles', category: categories.FROZEN, sku: 'FROZ-UDN-FRZ', unit_price: 5.49, supplier: 'Sunaoshi', description: 'Pre-cooked frozen udon' },
    { name: 'Kimchi (Korean)', category: categories.FROZEN, sku: 'FROZ-KIM-500G', unit_price: 6.99, supplier: 'Mother in Law', description: 'Fermented Korean cabbage' },
    { name: 'Tempura Shrimp', category: categories.FROZEN, sku: 'FROZ-TEM-SHR', unit_price: 11.99, supplier: 'Trident', description: 'Breaded shrimp tempura' },
    { name: 'Mochi Ice Cream (Mixed)', category: categories.FROZEN, sku: 'FROZ-MOC-ICE', unit_price: 7.99, supplier: 'Mikawaya', description: 'Assorted mochi ice cream' }
];
async function seed() {
    try {
        console.log('Initializing database...');
        await (0, db_1.initDb)();
        const db = await (0, db_1.getDb)();
        // Insert warehouses
        console.log('Creating warehouses...');
        await db.run(`
      INSERT INTO warehouses (name, location) VALUES 
      ('Main Warehouse', 'Bangkok, Thailand'),
      ('Cold Storage', 'Los Angeles, CA'),
      ('Distribution Center', 'Chicago, IL')
    `);
        // Insert products
        console.log(`Inserting ${products.length} products...`);
        for (const product of products) {
            await db.run(`INSERT INTO products (name, category, sku, unit_price, supplier, description) 
         VALUES (?, ?, ?, ?, ?, ?)`, [product.name, product.category, product.sku, product.unit_price, product.supplier, product.description]);
        }
        // Insert inventory
        console.log('Creating inventory records...');
        for (let i = 1; i <= products.length; i++) {
            const quantity = Math.floor(Math.random() * 200) + 20; // 20-220 units
            const reorderPoint = Math.floor(Math.random() * 30) + 10; // 10-40 units
            const warehouseId = (i % 3) + 1; // Distribute across 3 warehouses
            await db.run(`INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, reorder_point) 
         VALUES (?, ?, ?, ?)`, [i, warehouseId, quantity, reorderPoint]);
        }
        // Insert sample orders
        console.log('Creating sample orders...');
        await db.run(`
      INSERT INTO orders (customer_id, status, total_amount) VALUES 
      ('CUST001', 'completed', 125.50),
      ('CUST002', 'pending', 89.99),
      ('CUST003', 'processing', 245.00),
      ('CUST001', 'completed', 67.25)
    `);
        console.log('✅ Database seeded successfully!');
        console.log(`   - ${products.length} products`);
        console.log('   - 3 warehouses');
        console.log(`   - ${products.length} inventory records`);
        console.log('   - 4 sample orders');
    }
    catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}
seed();
//# sourceMappingURL=seed.js.map