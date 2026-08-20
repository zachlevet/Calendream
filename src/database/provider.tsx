import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';

import { palette } from '@/theme/colors';
import { migrateDatabase } from './migrate';

export function DatabaseProvider({ children }: PropsWithChildren) {
  const dark = useColorScheme() === 'dark';
  const colors = dark ? palette.dark : palette.light;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.recoveryCard}>
          <Text style={[styles.eyebrow, { color: colors.red }]}>CALENDAR NEEDS ATTENTION</Text>
          <Text style={[styles.title, { color: colors.text }]}>Your data is still on this iPhone.</Text>
          <Text style={[styles.body, { color: colors.secondary }]}>Calendream could not safely open the local calendar. Nothing was reset or deleted.</Text>
          <View style={[styles.detail, { backgroundColor: colors.card }]}>
            <Text selectable style={[styles.detailText, { color: colors.secondary }]}>{error.message}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
            style={({ pressed }) => [styles.retry, { backgroundColor: colors.blue }, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
          <Text style={[styles.help, { color: colors.tertiary }]}>If this continues, keep the app installed. A future build or support session can recover the database file.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SQLiteProvider databaseName="calendream.db" key={attempt} onError={setError} onInit={migrateDatabase}>
      {children}
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, justifyContent: 'center' },
  recoveryCard: { paddingHorizontal: 28 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { marginTop: 8, fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8 },
  body: { marginTop: 12, fontSize: 16, lineHeight: 23 },
  detail: { marginTop: 20, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  detailText: { fontSize: 12, lineHeight: 17 },
  retry: { height: 50, marginTop: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  help: { marginTop: 14, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.65 },
});
