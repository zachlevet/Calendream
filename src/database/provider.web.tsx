import type { PropsWithChildren } from 'react';

// The personal alpha is native-first. Web persistence will use the sync layer
// rather than shipping Expo SQLite's experimental web worker.
export function DatabaseProvider({ children }: PropsWithChildren) {
  return children;
}
