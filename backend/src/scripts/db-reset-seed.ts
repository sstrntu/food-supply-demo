import { closeDb, getDb, initDb, seedData } from '../db';

async function run(): Promise<void> {
  try {
    await initDb({ reset: true });
    const db = await getDb();
    await seedData(db);
    console.log('✓ Database reset + seed complete');
  } catch (error) {
    console.error('Failed to reset + seed database:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

run();
