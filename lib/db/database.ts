import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;
let _init: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_init) return _init;
  _init = SQLite.openDatabaseAsync('pokevault.db').then(async db => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS collection_cards (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        card_json TEXT NOT NULL,
        added_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS binders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        tone_start TEXT NOT NULL DEFAULT '#1F0E3A',
        tone_end TEXT NOT NULL DEFAULT '#7A6BFF',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS binder_cards (
        id TEXT PRIMARY KEY,
        binder_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        card_json TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS wishlist_cards (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        card_json TEXT NOT NULL,
        added_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cache_cards (
        card_id TEXT PRIMARY KEY,
        card_json TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cache_pricing (
        cache_key TEXT PRIMARY KEY,
        pricing_json TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );
    `);
    _db = db;
    return db;
  });
  return _init;
}
