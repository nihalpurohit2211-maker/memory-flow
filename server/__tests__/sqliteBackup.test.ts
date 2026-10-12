import { describe, it, expect, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { getDb, backupDatabase, closeDatabase, getAllMediaForCollection } from '../db';

describe('SQLite Database Persistence & Online Backup Suite', () => {
  const testBackupPath = path.resolve(process.cwd(), 'data', 'backups', 'test_backup_run.db');

  afterAll(() => {
    closeDatabase();
    if (fs.existsSync(testBackupPath)) {
      try {
        fs.unlinkSync(testBackupPath);
      } catch {
        // cleanup best-effort
      }
    }
  });

  it('connects to SQLite and confirms WAL mode and foreign keys are active', () => {
    const db = getDb();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    expect(foreignKeys).toBe(1);
  });

  it('reads migrated media items directly from SQLite schema', () => {
    const items = getAllMediaForCollection('elevate');
    expect(items.length).toBeGreaterThan(0);
    const first = items[0];
    expect(first.id).toBeDefined();
    expect(first.originalName).toBeDefined();
  });

  it('performs hot online backup to target file without locking the main database', async () => {
    const backupResult = await backupDatabase(testBackupPath);
    expect(backupResult).toBe(testBackupPath);
    expect(fs.existsSync(testBackupPath)).toBe(true);

    const backupStats = fs.statSync(testBackupPath);
    expect(backupStats.size).toBeGreaterThan(0);

    // Verify backed up database is a valid SQLite database with matching tables
    const backupDb = new Database(testBackupPath);
    const collectionsCount = backupDb.prepare('SELECT COUNT(*) as cnt FROM collections').get() as { cnt: number };
    expect(collectionsCount.cnt).toBeGreaterThanOrEqual(1);

    const mediaCount = backupDb.prepare('SELECT COUNT(*) as cnt FROM media_items').get() as { cnt: number };
    expect(mediaCount.cnt).toBeGreaterThan(0);

    backupDb.close();
  });
});
