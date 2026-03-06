import { closeDb, getDb, initDb, seedData } from '../db';

async function run(): Promise<void> {
  try {
    await initDb({ reset: false });
    const db = await getDb();
    await seedData(db);
    console.log('✓ Seed data applied (existing data is preserved)');
  } catch (error) {
    console.error('Failed to seed database:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

run();
