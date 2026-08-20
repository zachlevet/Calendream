import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Calendar from 'expo-calendar';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import {
  calendarImportWindows,
  importDeviceCalendarEvents,
  type CalendarImportDatabase,
  type CalendarImportResult,
} from '@/database/calendarImportStore';
import type { AppColors } from '@/theme/colors';

interface CalendarImportFlowProps {
  colors: AppColors;
  onClose(): void;
  onComplete(result: CalendarImportResult): Promise<void> | void;
}

type Stage = 'intro' | 'select' | 'importing' | 'complete' | 'denied';

type DeviceCalendarOption = {
  id: string;
  title: string;
  color?: string;
  type?: Calendar.CalendarType;
  source: { name: string };
};

export function CalendarImportFlow({ colors, onClose, onComplete }: CalendarImportFlowProps) {
  const sqlite = useSQLiteContext();
  const database = sqlite as unknown as CalendarImportDatabase;
  const windows = useMemo(() => calendarImportWindows(), []);
  const [stage, setStage] = useState<Stage>('intro');
  const [calendars, setCalendars] = useState<DeviceCalendarOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [windowKey, setWindowKey] = useState(windows[0].key);
  const [result, setResult] = useState<CalendarImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestAccess() {
    try {
      setError(null);
      let permission = await Calendar.getCalendarPermissions();
      if (!permission.granted && permission.canAskAgain) permission = await Calendar.requestCalendarPermissions();
      if (!permission.granted) {
        setStage('denied');
        return;
      }
      const available = await Calendar.getCalendars(Calendar.EntityTypes.EVENT) as unknown as DeviceCalendarOption[];
      const sorted = [...available].sort((left, right) => {
        const source = left.source.name.localeCompare(right.source.name);
        return source || left.title.localeCompare(right.title);
      });
      setCalendars(sorted);
      setSelected(new Set(sorted.filter(defaultSelected).map((calendar) => calendar.id)));
      setStage('select');
    } catch (cause) {
      setError(readableError(cause));
    }
  }

  function toggleCalendar(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runImport() {
    if (selected.size === 0) {
      Alert.alert('Choose a calendar', 'Select at least one calendar to bring into Calendream.');
      return;
    }
    const range = windows.find((candidate) => candidate.key === windowKey) ?? windows[0];
    try {
      setError(null);
      setStage('importing');
      const events = await Calendar.listEvents([...selected], range.start, range.end);
      const imported = await importDeviceCalendarEvents(database, events as unknown as Parameters<typeof importDeviceCalendarEvents>[1]);
      setResult(imported);
      setStage('complete');
    } catch (cause) {
      setError(readableError(cause));
      setStage('select');
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Close calendar import" hitSlop={12} onPress={onClose} style={[styles.close, { backgroundColor: colors.card }]}>
          <SymbolView name="xmark" size={15} tintColor={colors.secondary} weight="semibold" />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.text }]}>Import Calendar</Text>
        <View style={styles.close} />
      </View>

      {stage === 'intro' && (
        <View style={styles.centered}>
          <View style={[styles.heroIcon, { backgroundColor: colors.blueSoft }]}>
            <SymbolView name="calendar.badge.plus" size={42} tintColor={colors.blue} weight="medium" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Begin with the life you already planned.</Text>
          <Text style={[styles.body, { color: colors.secondary }]}>Choose Apple, Google, and other calendars already connected to this iPhone. Calendream makes a private local copy of their events.</Text>
          <View style={[styles.privacyCard, { backgroundColor: colors.card }]}>
            <InfoLine colors={colors} icon="checkmark.shield" text="You choose which calendars" />
            <InfoLine colors={colors} icon="arrow.triangle.2.circlepath" text="Re-import safely skips duplicates" />
            <InfoLine colors={colors} icon="iphone" text="Nothing is uploaded to Calendream" />
          </View>
          {error && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}
          <PrimaryButton colors={colors} label="Choose Calendars" onPress={() => void requestAccess()} />
          <Pressable onPress={onClose} style={styles.textButton}><Text style={[styles.textButtonLabel, { color: colors.secondary }]}>Not now</Text></Pressable>
        </View>
      )}

      {stage === 'denied' && (
        <View style={styles.centered}>
          <View style={[styles.heroIcon, { backgroundColor: colors.card }]}><SymbolView name="calendar" size={40} tintColor={colors.secondary} weight="medium" /></View>
          <Text style={[styles.title, { color: colors.text }]}>Calendar access is off.</Text>
          <Text style={[styles.body, { color: colors.secondary }]}>Calendream can only read calendars after you allow full calendar access in iPhone Settings.</Text>
          <PrimaryButton colors={colors} label="Open iPhone Settings" onPress={() => void Linking.openSettings()} />
          <Pressable onPress={() => void requestAccess()} style={styles.textButton}><Text style={[styles.textButtonLabel, { color: colors.blue }]}>Try again</Text></Pressable>
        </View>
      )}

      {stage === 'select' && (
        <ScrollView contentContainerStyle={styles.selectionContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Choose what comes over</Text>
          <Text style={[styles.sectionBody, { color: colors.secondary }]}>This is a one-way import. Your original calendars stay untouched.</Text>

          <Text style={[styles.label, { color: colors.secondary }]}>CALENDARS</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {calendars.length === 0 ? (
              <Text style={[styles.empty, { color: colors.secondary }]}>No event calendars are available on this iPhone.</Text>
            ) : calendars.map((calendar, index) => (
              <View key={calendar.id}>
                {index > 0 && <View style={[styles.divider, { backgroundColor: colors.separator }]} />}
                <Pressable onPress={() => toggleCalendar(calendar.id)} style={styles.calendarRow}>
                  <View style={[styles.calendarDot, { backgroundColor: calendar.color || colors.blue }]} />
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{calendar.title}</Text>
                    <Text style={[styles.rowDetail, { color: colors.secondary }]} numberOfLines={1}>{calendar.source.name}</Text>
                  </View>
                  <View style={[styles.check, { borderColor: selected.has(calendar.id) ? colors.blue : colors.tertiary, backgroundColor: selected.has(calendar.id) ? colors.blue : 'transparent' }]}>
                    {selected.has(calendar.id) && <SymbolView name="checkmark" size={12} tintColor="#FFFFFF" weight="bold" />}
                  </View>
                </Pressable>
              </View>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.secondary }]}>TIME RANGE</Text>
          <View style={styles.rangeRow}>
            {windows.map((range) => {
              const active = range.key === windowKey;
              return (
                <Pressable key={range.key} onPress={() => setWindowKey(range.key)} style={[styles.rangeCard, { backgroundColor: active ? colors.blueSoft : colors.card, borderColor: active ? colors.blue : 'transparent' }]}>
                  <Text style={[styles.rangeTitle, { color: active ? colors.blue : colors.text }]}>{range.title}</Text>
                  <Text style={[styles.rangeDetail, { color: colors.secondary }]}>{range.detail}</Text>
                </Pressable>
              );
            })}
          </View>
          {error && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}
          <PrimaryButton colors={colors} disabled={calendars.length === 0} label={`Import ${selected.size} Calendar${selected.size === 1 ? '' : 's'}`} onPress={() => void runImport()} />
        </ScrollView>
      )}

      {stage === 'importing' && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} size="large" />
          <Text style={[styles.importingTitle, { color: colors.text }]}>Building your timeline…</Text>
          <Text style={[styles.body, { color: colors.secondary }]}>Calendream is copying events into your private on-device calendar.</Text>
        </View>
      )}

      {stage === 'complete' && result && (
        <View style={styles.centered}>
          <View style={[styles.heroIcon, { backgroundColor: colors.blueSoft }]}><SymbolView name="checkmark" size={38} tintColor={colors.blue} weight="bold" /></View>
          <Text style={[styles.title, { color: colors.text }]}>{result.imported > 0 ? 'Your timeline is ready.' : 'Everything is already here.'}</Text>
          <Text style={[styles.body, { color: colors.secondary }]}>{result.imported} event{result.imported === 1 ? '' : 's'} imported · {result.skipped} already in Calendream{result.ignored ? ` · ${result.ignored} unavailable` : ''}</Text>
          <PrimaryButton colors={colors} label="Open Calendream" onPress={() => void onComplete(result)} />
        </View>
      )}
    </View>
  );
}

function PrimaryButton({ colors, disabled = false, label, onPress }: { colors: AppColors; disabled?: boolean; label: string; onPress(): void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primary, { backgroundColor: disabled ? colors.tertiary : colors.blue }, pressed && styles.pressed]}><Text style={styles.primaryLabel}>{label}</Text></Pressable>;
}

function InfoLine({ colors, icon, text }: { colors: AppColors; icon: SFSymbol; text: string }) {
  return <View style={styles.infoLine}><SymbolView name={icon} size={18} tintColor={colors.blue} weight="medium" /><Text style={[styles.infoText, { color: colors.text }]}>{text}</Text></View>;
}

function defaultSelected(calendar: DeviceCalendarOption) {
  return calendar.type !== Calendar.CalendarType.BIRTHDAYS && calendar.type !== Calendar.CalendarType.SUBSCRIBED;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'Calendream could not read this calendar.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { height: 58, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { fontSize: 17, fontWeight: '700' },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, paddingHorizontal: 28, paddingBottom: 36, justifyContent: 'center', alignItems: 'center' },
  heroIcon: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  title: { maxWidth: 350, textAlign: 'center', fontSize: 32, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8 },
  body: { maxWidth: 355, marginTop: 12, textAlign: 'center', fontSize: 16, lineHeight: 23 },
  privacyCard: { width: '100%', marginTop: 28, borderRadius: 24, padding: 18, gap: 17 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  infoText: { flex: 1, fontSize: 15, fontWeight: '600' },
  primary: { width: '100%', height: 54, marginTop: 28, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  textButton: { padding: 18 },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
  error: { marginTop: 16, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  selectionContent: { paddingHorizontal: 22, paddingBottom: 42 },
  sectionTitle: { marginTop: 22, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 },
  sectionBody: { marginTop: 7, fontSize: 15, lineHeight: 21 },
  label: { marginTop: 28, marginBottom: 9, marginLeft: 8, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  card: { borderRadius: 24, overflow: 'hidden', paddingHorizontal: 16 },
  calendarRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 12 },
  calendarDot: { width: 13, height: 13, borderRadius: 6.5 },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowDetail: { marginTop: 2, fontSize: 13 },
  check: { width: 25, height: 25, borderRadius: 12.5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 25 },
  empty: { paddingVertical: 24, textAlign: 'center', fontSize: 14 },
  rangeRow: { flexDirection: 'row', gap: 10 },
  rangeCard: { flex: 1, minHeight: 88, padding: 15, borderRadius: 20, borderWidth: 1 },
  rangeTitle: { fontSize: 15, fontWeight: '700' },
  rangeDetail: { marginTop: 5, fontSize: 12, lineHeight: 17 },
  importingTitle: { marginTop: 24, fontSize: 23, fontWeight: '800' },
  pressed: { opacity: 0.68 },
});
