import { DatabaseSync } from 'node:sqlite';

import type { BackupDatabase } from '../src/database/backupStore.ts';
import type { MigrationDatabase } from '../src/database/migrate.ts';

export class TestDatabase implements BackupDatabase, MigrationDatabase {
  readonly raw: DatabaseSync;

  constructor(path = ':memory:') {
    this.raw = new DatabaseSync(path);
  }

  async execAsync(sql: string) {
    this.raw.exec(sql);
  }

  async getAllAsync<T>(sql: string, ...params: unknown[]) {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]) {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async runAsync(sql: string, ...params: unknown[]) {
    return this.raw.prepare(sql).run(...params);
  }

  async withExclusiveTransactionAsync(task: (transaction: TestDatabase) => Promise<void>) {
    this.raw.exec('BEGIN EXCLUSIVE');
    try {
      await task(this);
      this.raw.exec('COMMIT');
    } catch (error) {
      this.raw.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.raw.close();
  }
}
