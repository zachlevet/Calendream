import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { summarizeBackup, type CalendreamBackup } from '@/database/backupFormat';
import {
  assertHealthy,
  markBackupExported,
  readBackup,
  readBackupStatus,
  removeExampleData,
  restoreBackup,
  type BackupDatabase,
} from '@/database/backupStore';
import { LATEST_SCHEMA_VERSION } from '@/database/migrate';
import { readCalendarImportStatus, type CalendarImportDatabase, type CalendarImportResult } from '@/database/calendarImportStore';
import { readJournalEntries, type LibraryDatabase } from '@/database/libraryStore';
// Metro resolves these platform-specific feature modules.
// eslint-disable-next-line import/no-unresolved
import { CalendarImportFlow } from '@/features/calendar-import/CalendarImportFlow';
// eslint-disable-next-line import/no-unresolved
import { OnboardingExperience } from '@/features/onboarding/OnboardingExperience';
// Metro resolves the platform-specific backupFiles.native/.web module.
// eslint-disable-next-line import/no-unresolved
import { pickBackupFile, shareBackupFile, writeRecoveryBackup } from '@/services/backupFiles';
import { sendJournalToNotes, shareJournalPDF, shareJournalText } from '@/services/journalExport.native';
import type { AppColors } from '@/theme/colors';

interface SettingsScreenProps {
  colors: AppColors;
  onDataChanged(): Promise<void> | void;
}

type Status = Awaited<ReturnType<typeof readBackupStatus>>;

export function SettingsScreen({ colors, onDataChanged }: SettingsScreenProps) {
  const sqlite = useSQLiteContext();
  const database = sqlite as unknown as BackupDatabase;
  const importDatabase = sqlite as unknown as CalendarImportDatabase;
  const journalDatabase = sqlite as unknown as LibraryDatabase;
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ lastImportAt: string | null; importedEvents: number } | null>(null);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const refresh = useCallback(async () => {
    const [backupStatus, nextCalendarStatus] = await Promise.all([
      readBackupStatus(database),
      readCalendarImportStatus(importDatabase),
    ]);
    setStatus(backupStatus);
    setCalendarStatus(nextCalendarStatus);
  }, [database, importDatabase]);

  async function finishCalendarImport(result: CalendarImportResult) {
    setCalendarImportOpen(false);
    setTourOpen(false);
    await onDataChanged();
    await refresh();
    setMessage(result.imported > 0 ? `${result.imported} calendar event${result.imported === 1 ? '' : 's'} imported.` : 'Your selected calendar events were already here.');
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh().catch((error) => setMessage(readableError(error)));
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function exportBackup() {
    try {
      setBusy('export');
      setMessage(null);
      const backup = await readBackup(database, appVersion);
      const result = await shareBackupFile(backup);
      if (result.action === 'sharedAction') {
        await markBackupExported(database, backup.createdAt);
        setMessage('Backup created. Keep the file somewhere you trust.');
        await refresh();
      }
    } catch (error) {
      Alert.alert('Backup not created', readableError(error));
    } finally {
      setBusy(null);
    }
  }

  async function chooseRestore() {
    try {
      setBusy('restore');
      setMessage(null);
      const backup = await pickBackupFile(LATEST_SCHEMA_VERSION);
      if (!backup) return;
      const summary = summarizeBackup(backup);
      Alert.alert(
        'Replace this calendar?',
        `Backup from ${formatMoment(summary.createdAt)}\n\n${summary.items} items · ${summary.goals} goals · ${summary.routines} routines · ${summary.reflections} reflections\n\nCalendream will make an on-device recovery copy first. This calendar will then be replaced.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace Calendar', style: 'destructive', onPress: () => void performRestore(backup) },
        ],
      );
    } catch (error) {
      Alert.alert('Backup not opened', readableError(error));
    } finally {
      setBusy(null);
    }
  }

  async function performRestore(backup: CalendreamBackup) {
    try {
      setBusy('restore');
      const current = await readBackup(database, appVersion);
      await writeRecoveryBackup(current);
      await restoreBackup(database, backup);
      await onDataChanged();
      await refresh();
      setMessage('Calendar restored successfully.');
      Alert.alert('Calendar restored', 'Your events, tasks, goals, routines, and reflections are ready.');
    } catch (error) {
      Alert.alert('Calendar not restored', `${readableError(error)}\n\nYour previous calendar was not intentionally removed.`);
    } finally {
      setBusy(null);
    }
  }

  function confirmRemoveExamples() {
    Alert.alert(
      'Remove example data?',
      'This removes only Calendream’s known sample records. Anything you created keeps its existing ID and will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove Examples', style: 'destructive', onPress: () => void performRemoveExamples() },
      ],
    );
  }

  async function performRemoveExamples() {
    try {
      setBusy('examples');
      const current = await readBackup(database, appVersion);
      await writeRecoveryBackup(current);
      const removed = await removeExampleData(database);
      await onDataChanged();
      await refresh();
      setMessage(`${removed} example record${removed === 1 ? '' : 's'} removed.`);
    } catch (error) {
      Alert.alert('Examples not removed', readableError(error));
    } finally {
      setBusy(null);
    }
  }

  async function checkDatabase() {
    try {
      setBusy('check');
      await assertHealthy(database);
      setMessage('Your local calendar passed its integrity check.');
    } catch (error) {
      Alert.alert('Calendar needs attention', readableError(error));
    } finally {
      setBusy(null);
    }
  }

  async function exportJournal(format: 'pdf' | 'text' | 'notes') {
    try {
      setBusy(`journal-${format}`);
      setMessage(null);
      const entries = await readJournalEntries(journalDatabase);
      if (!entries.length) {
        Alert.alert('Your journal is empty', 'Write a Daily Reflection or add an entry in Library before exporting.');
        return;
      }
      const result = format === 'pdf'
        ? await shareJournalPDF(entries)
        : format === 'text'
          ? await shareJournalText(entries)
          : await sendJournalToNotes(entries);
      if (result.action === 'sharedAction') {
        setMessage(format === 'notes' ? 'Journal shared. Choose Notes to keep it there.' : 'Journal export prepared.');
      }
    } catch (error) {
      Alert.alert('Journal not exported', readableError(error));
    } finally {
      setBusy(null);
    }
  }

  function chooseJournalExport() {
    Alert.alert('Export journal', 'Choose a portable format. Both include every dated entry in chronological order.', [
      { text: 'PDF', onPress: () => void exportJournal('pdf') },
      { text: 'Plain Text', onPress: () => void exportJournal('text') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>Your calendar lives on this iPhone.</Text>
      </View>

      <SectionLabel colors={colors}>DATA & BACKUP</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <SettingsRow
          colors={colors}
          detail="Create a portable file for Files, iCloud Drive, or another safe place."
          disabled={busy !== null}
          icon="square.and.arrow.up"
          loading={busy === 'export'}
          onPress={() => void exportBackup()}
          title="Export backup"
        />
        <Divider colors={colors} />
        <SettingsRow
          colors={colors}
          detail="Validate a Calendream file before replacing this calendar."
          disabled={busy !== null}
          icon="square.and.arrow.down"
          loading={busy === 'restore'}
          onPress={() => void chooseRestore()}
          title="Restore from backup"
        />
        <Divider colors={colors} />
        <View style={styles.statusRow}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Last exported</Text>
            <Text style={[styles.rowDetail, { color: colors.secondary }]}>{status?.lastBackupAt ? formatMoment(status.lastBackupAt) : 'No portable backup yet'}</Text>
          </View>
          <Text style={[styles.statusValue, { color: status?.lastBackupAt ? colors.blue : colors.tertiary }]}>{status?.lastBackupAt ? 'Saved' : 'Not yet'}</Text>
        </View>
      </View>

      <SectionLabel colors={colors}>JOURNAL</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <SettingsRow
          colors={colors}
          detail="Save every dated entry as a readable PDF or plain-text file."
          disabled={busy !== null}
          icon="doc.text"
          loading={busy === 'journal-pdf' || busy === 'journal-text'}
          onPress={chooseJournalExport}
          title="Export journal"
        />
        <Divider colors={colors} />
        <SettingsRow
          colors={colors}
          detail="Opens the iOS share sheet with one complete journal. Choose Notes to save it there."
          disabled={busy !== null}
          icon="note.text"
          loading={busy === 'journal-notes'}
          onPress={() => void exportJournal('notes')}
          title="Send to Apple Notes"
        />
      </View>

      {message && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.blue }]}>{message}</Text>}

      <SectionLabel colors={colors}>ON THIS IPHONE</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.summaryRow}>
          <Stat colors={colors} label="Items" value={status?.items ?? 0} />
          <Stat colors={colors} label="Goals" value={status?.goals ?? 0} />
          <Stat colors={colors} label="Routines" value={status?.routines ?? 0} />
          <Stat colors={colors} label="Notes" value={status?.reflections ?? 0} />
        </View>
        <Divider colors={colors} />
        <SettingsRow
          colors={colors}
          detail={`Database version ${status?.databaseVersion ?? '…'} · checks relationships and file integrity`}
          disabled={busy !== null}
          icon="checkmark.shield"
          loading={busy === 'check'}
          onPress={() => void checkDatabase()}
          title="Check calendar health"
        />
        {(status?.exampleRecords ?? 0) > 0 && (
          <>
            <Divider colors={colors} />
            <SettingsRow
              colors={colors}
              destructive
              detail={`${status?.exampleRecords ?? 0} known sample records · creates a recovery copy first`}
              disabled={busy !== null}
              icon="trash"
              loading={busy === 'examples'}
              onPress={confirmRemoveExamples}
              title="Remove example data"
            />
          </>
        )}
      </View>

      <SectionLabel colors={colors}>CALENDARS</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <SettingsRow
          colors={colors}
          detail="Choose Apple, Google, or other calendars connected to this iPhone. Re-importing skips duplicates."
          disabled={busy !== null}
          icon="calendar.badge.plus"
          onPress={() => setCalendarImportOpen(true)}
          title="Import calendars"
        />
        <Divider colors={colors} />
        <View style={styles.statusRow}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Imported events</Text>
            <Text style={[styles.rowDetail, { color: colors.secondary }]}>{calendarStatus?.lastImportAt ? `Last imported ${formatMoment(calendarStatus.lastImportAt)}` : 'No device calendars imported yet'}</Text>
          </View>
          <Text style={[styles.statusValue, { color: calendarStatus?.importedEvents ? colors.blue : colors.tertiary }]}>{calendarStatus?.importedEvents ?? 0}</Text>
        </View>
      </View>

      <SectionLabel colors={colors}>GETTING STARTED</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <SettingsRow colors={colors} detail="Revisit the Today, Timeline, and Assistant walkthrough. Your current data stays untouched." disabled={busy !== null} icon="sparkles" onPress={() => setTourOpen(true)} title="View welcome tour" />
      </View>

      <SectionLabel colors={colors}>ABOUT</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.statusRow}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Calendream</Text>
            <Text style={[styles.rowDetail, { color: colors.secondary }]}>Version {appVersion} · local-first preview</Text>
          </View>
          <Text style={[styles.statusValue, { color: colors.secondary }]}>iPhone</Text>
        </View>
      </View>
      <Text style={[styles.footer, { color: colors.tertiary }]}>Backups contain the calendar information you entered. Store them somewhere private. Calendream does not currently upload your planning data to a server.</Text>

      <Modal animationType="slide" onRequestClose={() => setCalendarImportOpen(false)} presentationStyle="fullScreen" visible={calendarImportOpen}>
        <CalendarImportFlow key={`calendar-import-${calendarImportOpen}`} colors={colors} onClose={() => setCalendarImportOpen(false)} onComplete={finishCalendarImport} />
      </Modal>
      <Modal animationType="slide" onRequestClose={() => setTourOpen(false)} presentationStyle="fullScreen" visible={tourOpen}>
        <OnboardingExperience key={`welcome-tour-${tourOpen}`} colors={colors} onClose={() => setTourOpen(false)} onFinish={async (reason) => {
          if (reason === 'imported') await onDataChanged();
          setTourOpen(false);
          await refresh();
        }} replay />
      </Modal>
    </ScrollView>
  );
}

function SectionLabel({ children, colors }: { children: string; colors: AppColors }) {
  return <Text style={[styles.sectionLabel, { color: colors.secondary }]}>{children}</Text>;
}

function Divider({ colors }: { colors: AppColors }) {
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
}

function SettingsRow({ colors, detail, disabled, icon, loading, onPress, title, destructive = false }: {
  colors: AppColors;
  detail: string;
  disabled: boolean;
  icon: SFSymbol;
  loading?: boolean;
  onPress(): void;
  title: string;
  destructive?: boolean;
}) {
  const accent = destructive ? colors.red : colors.blue;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed, disabled && styles.disabled]}>
      <View style={[styles.infoIcon, { backgroundColor: destructive ? colors.redSoft : colors.blueSoft }]}>
        {loading ? <ActivityIndicator color={accent} size="small" /> : <SymbolView name={icon} size={18} tintColor={accent} weight="medium" />}
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: destructive ? colors.red : colors.text }]}>{title}</Text>
        <Text style={[styles.rowDetail, { color: colors.secondary }]}>{detail}</Text>
      </View>
      <Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text>
    </Pressable>
  );
}

function Stat({ colors, label, value }: { colors: AppColors; label: string; value: number }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color: colors.text }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.secondary }]}>{label}</Text></View>;
}

function formatMoment(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'Something unexpected happened. Please try again.';
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 118 },
  header: { marginBottom: 28 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 },
  subtitle: { marginTop: 3, fontSize: 15, lineHeight: 20 },
  sectionLabel: { marginLeft: 12, marginBottom: 8, marginTop: 18, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  card: { borderRadius: 22, overflow: 'hidden' },
  actionRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, gap: 12 },
  informationRow: { minHeight: 92, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 15, paddingVertical: 16, gap: 12 },
  statusRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  infoIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  rowDetail: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  statusValue: { fontSize: 13, fontWeight: '700' },
  chevron: { fontSize: 26, lineHeight: 28, fontWeight: '300' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 63 },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 18 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { marginTop: 2, fontSize: 10, fontWeight: '700' },
  message: { marginHorizontal: 10, marginTop: 10, fontSize: 12, lineHeight: 17 },
  footer: { marginHorizontal: 12, marginTop: 14, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.55 },
  disabled: { opacity: 0.6 },
});
