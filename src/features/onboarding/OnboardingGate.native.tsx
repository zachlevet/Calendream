import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { completeOnboarding, shouldShowOnboarding, type OnboardingDatabase } from '@/database/onboardingStore';
import { palette } from '@/theme/colors';
import { OnboardingExperience } from './OnboardingExperience';

export function OnboardingGate({ children }: PropsWithChildren) {
  const sqlite = useSQLiteContext();
  const database = sqlite as unknown as OnboardingDatabase;
  const dark = useColorScheme() === 'dark';
  const colors = dark ? palette.dark : palette.light;
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void shouldShowOnboarding(database).then((value) => active && setShow(value)).catch(() => active && setShow(false));
    return () => { active = false; };
  }, [database]);

  if (show === null) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.blue} /></View>;
  if (!show) return children;
  return <OnboardingExperience colors={colors} onFinish={async (reason) => { await completeOnboarding(database, reason); setShow(false); }} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
