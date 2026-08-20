import { StyleSheet, Text, View } from 'react-native';

import type { AppColors } from '@/theme/colors';

export function SettingsScreen({ colors }: { colors: AppColors; onDataChanged(): Promise<void> | void }) {
  return <View style={styles.screen}><Text style={[styles.title, { color: colors.text }]}>Settings</Text><Text style={[styles.copy, { color: colors.secondary }]}>Portable backup and restore are available in the iPhone app. The web preview does not store your calendar yet.</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24 },
  title: { fontSize: 34, fontWeight: '800' },
  copy: { marginTop: 8, fontSize: 15, lineHeight: 22 },
});
