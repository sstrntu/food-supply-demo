import { closeDb, getDb, initDb } from '../db';

async function run(): Promise<void> {
  try {
    await initDb({ reset: false });
    const db = await getDb();
    await db.get('SELECT 1');
    console.log('✓ Database schema ensured (non-destructive)');
  } catch (error) {
    console.error('Failed to ensure database schema:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

run();
