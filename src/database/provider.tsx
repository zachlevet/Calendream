import type { PropsWithChildren } from 'react';
import { SQLiteProvider } from 'expo-sqlite';

import { migrateDatabase } from './migrate';

export function DatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider databaseName="calendream.db" onInit={migrateDatabase}>
      {children}
    </SQLiteProvider>
  );
}
