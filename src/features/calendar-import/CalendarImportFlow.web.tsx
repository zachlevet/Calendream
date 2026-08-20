import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CalendarImportResult } from '@/database/calendarImportStore';
import type { AppColors } from '@/theme/colors';

export function CalendarImportFlow({ colors, onClose }: { colors: AppColors; onClose(): void; onComplete(result: CalendarImportResult): Promise<void> | void }) {
  return <View style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.title, { color: colors.text }]}>Calendar import is available on iPhone.</Text><Text style={[styles.body, { color: colors.secondary }]}>Open Calendream on your phone to choose calendars connected to iOS.</Text><Pressable onPress={onClose} style={[styles.button, { backgroundColor: colors.blue }]}><Text style={styles.buttonText}>Done</Text></Pressable></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, title: { fontSize: 28, fontWeight: '800', textAlign: 'center' }, body: { marginTop: 12, fontSize: 16, textAlign: 'center' }, button: { marginTop: 28, paddingHorizontal: 30, paddingVertical: 15, borderRadius: 18 }, buttonText: { color: '#FFFFFF', fontWeight: '700' } });
