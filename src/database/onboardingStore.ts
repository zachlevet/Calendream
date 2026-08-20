export interface OnboardingDatabase {
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
}

const ONBOARDING_KEY = 'onboarding_v1_completed';

export async function shouldShowOnboarding(database: OnboardingDatabase) {
  const marker = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    ONBOARDING_KEY,
  );
  if (marker?.value) return false;

  const existing = await database.getFirstAsync<{ count: number }>(`
    SELECT
      (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL) +
      (SELECT COUNT(*) FROM goals WHERE deleted_at IS NULL) +
      (SELECT COUNT(*) FROM habits WHERE archived_at IS NULL) +
      (SELECT COUNT(*) FROM daily_pages WHERE reflection != '') AS count
  `);

  if (Number(existing?.count ?? 0) > 0) {
    await completeOnboarding(database, 'existing-calendar');
    return false;
  }
  return true;
}

export async function completeOnboarding(database: OnboardingDatabase, reason: 'fresh' | 'imported' | 'existing-calendar') {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ONBOARDING_KEY,
    reason,
    now,
  );
}
