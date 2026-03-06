import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';

export async function resolveHotDate(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  preferredDate: string
): Promise<string | null> {
  const row = await db.get<{ target_date: string | null }>(
    `
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM hot_items WHERE weee_date = ?)
            THEN ?
          ELSE (SELECT MAX(weee_date) FROM hot_items)
        END AS target_date
    `,
    [preferredDate, preferredDate]
  );

  return row?.target_date || null;
}
