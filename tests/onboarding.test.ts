import assert from 'node:assert/strict';
import test from 'node:test';

import { completeOnboarding, shouldShowOnboarding } from '../src/database/onboardingStore.ts';
import { runMigrations } from '../src/database/migrate.ts';
import { TestDatabase } from './test-database.ts';

test('a fresh calendar sees onboarding once', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    assert.equal(await shouldShowOnboarding(db), true);
    await completeOnboarding(db, 'fresh');
    assert.equal(await shouldShowOnboarding(db), false);
  } finally {
    db.close();
  }
});

test('an existing local calendar is never interrupted by onboarding', async () => {
  const db = new TestDatabase();
  try {
    await runMigrations(db);
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO items (id, kind, title, anchor_start, anchor_end, precision, altitude, created_at, updated_at)
       VALUES ('mine', 'task', 'Keep this', '2026-08-20', '2026-08-20', 'day', 0, ?, ?)`,
      now,
      now,
    );
    assert.equal(await shouldShowOnboarding(db), false);
    assert.equal((await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = 'onboarding_v1_completed'"))?.value, 'existing-calendar');
  } finally {
    db.close();
  }
});
