import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DatabaseProvider } from '../database/provider';
import { AppErrorBoundary } from '../shared/AppErrorBoundary';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary>
        <DatabaseProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </DatabaseProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
