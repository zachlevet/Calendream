import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DatabaseProvider } from '../database/provider';

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </DatabaseProvider>
  );
}
