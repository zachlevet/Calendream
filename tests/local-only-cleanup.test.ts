import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { LOCAL_ONLY_CLEANUP_SQL } from '../src/database/localOnlyCleanup.ts';

test('local-only cleanup removes sync artifacts without deleting planning data', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE sync_outbox (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      enqueued_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );
    CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TRIGGER sync_items_insert AFTER INSERT ON items BEGIN
      INSERT INTO sync_outbox (entity_type, entity_id, operation, enqueued_at)
      VALUES ('item', NEW.id, 'upsert', CURRENT_TIMESTAMP);
    END;
    INSERT INTO app_meta VALUES ('sync_suppressed', '0', CURRENT_TIMESTAMP);
    INSERT INTO app_meta VALUES ('sample_data_v2', 'seeded', CURRENT_TIMESTAMP);
    INSERT INTO items VALUES ('kept-item', 'Keep this local task');
  `);

  db.exec(LOCAL_ONLY_CLEANUP_SQL);

  const keptItem = db.prepare('SELECT id, title FROM items').get() as { id: string; title: string };
  assert.equal(keptItem.id, 'kept-item');
  assert.equal(keptItem.title, 'Keep this local task');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_outbox'").get(), undefined);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_state'").get(), undefined);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_items_insert'").get(), undefined);
  assert.equal(db.prepare("SELECT value FROM app_meta WHERE key = 'sync_suppressed'").get(), undefined);
  const sampleMarker = db.prepare("SELECT value FROM app_meta WHERE key = 'sample_data_v2'").get() as { value: string };
  assert.equal(sampleMarker.value, 'seeded');
  db.close();
});
