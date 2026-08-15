import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DatabaseProvider } from '../database/provider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DatabaseProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}
