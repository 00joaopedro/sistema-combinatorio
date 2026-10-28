import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function toBitmask(numbers: number[]): number {
  return numbers.reduce((mask, n) => mask | (1 << (n - 1)), 0);
}

export function openDatabase(): Database.Database {
  const dataDir = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), 'data'));
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'lotofacil.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS concursos (
      numero INTEGER PRIMARY KEY,
      data_sorteio TEXT NOT NULL,
      dezenas TEXT NOT NULL,
      dezenas_mask INTEGER NOT NULL
    );
  `);
  return db;
}
