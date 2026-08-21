import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { selectJournalMemory } from '@/database/libraryStore';
import type { Goal, Habit, ISOWeekday, JournalEntry, JournalEntryDraft } from '@/models/planning';
import { formatLongDate } from '@/shared/date';
import type { AppColors } from '@/theme/colors';

export type LibrarySection = 'home' | 'journal' | 'goals' | 'routines' | 'goalArchive' | 'routineArchive';

interface LibraryScreenProps {
  colors: AppColors;
  goals: Goal[];
  habits: Habit[];
  loadJournalEntries(): Promise<JournalEntry[]>;
  saveJournalEntry(draft: JournalEntryDraft): Promise<string>;
  deleteJournalEntry(id: string): Promise<void>;
  onOpenGoal(id: string): void;
  onOpenHabit(id: string): void;
  onOpenJournal(date: string): void;
  onSectionChange(section: LibrarySection): void;
  section: LibrarySection;
  today: string;
}

const weekdayLabels: Record<ISOWeekday, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

export function LibraryScreen({ colors, deleteJournalEntry, goals, habits, loadJournalEntries, onOpenGoal, onOpenHabit, onOpenJournal, onSectionChange, saveJournalEntry, section, today }: LibraryScreenProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<JournalEntry | 'new' | null>(null);

  const reloadEntries = useCallback(async () => {
    try {
      const nextEntries = await loadJournalEntries();
      setEntries(nextEntries);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loadJournalEntries]);

  useEffect(() => {
    let active = true;
    void loadJournalEntries()
      .then((nextEntries) => {
        if (!active) return;
        setEntries(nextEntries);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [loadJournalEntries]);

  const activeGoals = useMemo(() => goals.filter((goal) => !goal.completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((goal) => goal.completed).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')), [goals]);
  const activeHabits = useMemo(() => habits.filter((habit) => !habit.archivedAt), [habits]);
  const archivedHabits = useMemo(() => habits.filter((habit) => habit.archivedAt).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')), [habits]);
  const memory = useMemo(() => selectJournalMemory(entries, today), [entries, today]);
  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.reflection.toLocaleLowerCase().includes(needle) || formatLongDate(entry.date).toLocaleLowerCase().includes(needle));
  }, [entries, query]);

  function openEntry(entry: JournalEntry) {
    if (entry.source === 'daily') onOpenJournal(entry.date);
    else setEditingEntry(entry);
  }

  if (editingEntry) {
    return (
      <JournalEditor
        colors={colors}
        entry={editingEntry === 'new' ? null : editingEntry}
        onClose={() => setEditingEntry(null)}
        onDelete={async (id) => {
          await deleteJournalEntry(id);
          await reloadEntries();
          setEditingEntry(null);
        }}
        onSave={async (draft) => {
          await saveJournalEntry(draft);
          await reloadEntries();
          setEditingEntry(null);
        }}
        today={today}
      />
    );
  }

  if (section === 'journal') {
    return (
      <LibraryPage
        colors={colors}
        headerAction={<AddEntryButton colors={colors} onPress={() => setEditingEntry('new')} />}
        onBack={() => { setQuery(''); onSectionChange('home'); }}
        subtitle="Daily reflections and entries, together in one place."
        title="Journal">
        <View style={[styles.search, { backgroundColor: colors.card }]}>
          <SymbolView name="magnifyingglass" size={15} tintColor={colors.secondary} />
          <TextInput onChangeText={setQuery} placeholder="Search your writing" placeholderTextColor={colors.tertiary} style={[styles.searchInput, { color: colors.text }]} value={query} />
        </View>
        {loading ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : error ? (
          <EmptyState colors={colors} copy="Your writing couldn’t load yet. Leave Library and try again." title="Journal unavailable" />
        ) : filteredEntries.length ? filteredEntries.map((entry) => (
          <Pressable key={entry.id} onPress={() => openEntry(entry)} style={({ pressed }) => [styles.entry, { borderColor: colors.separator }, pressed && styles.pressed]}>
            <View style={styles.entryHeading}>
              <View style={styles.entryIdentity}>
                <Text style={[styles.entryDate, { color: colors.blue }]}>{formatLongDate(entry.date)}</Text>
                {entry.source === 'standalone' && <Text style={[styles.entryKind, { color: colors.secondary, backgroundColor: colors.card }]}>ENTRY</Text>}
              </View>
              <Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text>
            </View>
            <Text numberOfLines={5} style={[styles.entryText, { color: colors.text }]}>{entry.reflection}</Text>
          </Pressable>
        )) : <EmptyState colors={colors} copy={query ? 'Try another word or phrase.' : 'Write from Today, or add an entry that stands on its own.'} title={query ? 'No matching entries' : 'Your journal is ready'} />}
      </LibraryPage>
    );
  }

  if (section === 'goals') {
    return (
      <LibraryPage colors={colors} onBack={() => onSectionChange('home')} subtitle="Active direction and goals you’ve completed." title="Goals">
        <Text style={[styles.sectionLabel, styles.firstSectionLabel, { color: colors.secondary }]}>CURRENT GOALS</Text>
        {activeGoals.length ? <View style={[styles.goalList, { backgroundColor: colors.yellowSoft }]}>{activeGoals.map((goal, index) => <GoalRow colors={colors} goal={goal} index={index} key={goal.id} onPress={() => onOpenGoal(goal.id)} />)}</View> : <EmptyState colors={colors} copy="Ask Assistant to keep something important in view." title="No active goals" />}
        <Text style={[styles.sectionLabel, { color: colors.secondary }]}>PAST GOALS</Text>
        {completedGoals.length ? <><View style={[styles.list, { backgroundColor: colors.card }]}>{completedGoals.slice(0, 3).map((goal, index) => <GoalRow colors={colors} completed goal={goal} index={index} key={goal.id} onPress={() => onOpenGoal(goal.id)} />)}</View><ArchiveButton colors={colors} count={completedGoals.length} label="View all past goals" onPress={() => onSectionChange('goalArchive')} /></> : <EmptyState colors={colors} copy="Goals you accomplish will collect here." title="No past goals yet" />}
      </LibraryPage>
    );
  }

  if (section === 'routines') {
    return (
      <LibraryPage colors={colors} onBack={() => onSectionChange('home')} subtitle="The rhythms that create tasks and events for you." title="Routines">
        <Text style={[styles.sectionLabel, styles.firstSectionLabel, { color: colors.secondary }]}>CURRENT ROUTINES</Text>
        {activeHabits.length ? <View style={[styles.list, { backgroundColor: colors.card }]}>{activeHabits.map((habit, index) => <RoutineRow colors={colors} habit={habit} index={index} key={habit.id} onPress={() => onOpenHabit(habit.id)} />)}</View> : <EmptyState colors={colors} copy="Ask Assistant for a recurring rhythm and it will appear here." title="No current routines" />}
        <Text style={[styles.sectionLabel, { color: colors.secondary }]}>PAST ROUTINES</Text>
        {archivedHabits.length ? <><View style={[styles.list, { backgroundColor: colors.card }]}>{archivedHabits.slice(0, 3).map((habit, index) => <RoutineRow archived colors={colors} habit={habit} index={index} key={habit.id} onPress={() => onOpenHabit(habit.id)} />)}</View><ArchiveButton colors={colors} count={archivedHabits.length} label="View all past routines" onPress={() => onSectionChange('routineArchive')} /></> : <EmptyState colors={colors} copy="Finished routines will stay here as part of your history." title="No past routines yet" />}
      </LibraryPage>
    );
  }

  if (section === 'goalArchive') {
    return <LibraryPage backLabel="Goals" colors={colors} onBack={() => onSectionChange('goals')} subtitle="A record of the direction you followed through on." title="Past Goals">
      {completedGoals.length ? <View style={[styles.list, { backgroundColor: colors.card }]}>{completedGoals.map((goal, index) => <GoalRow colors={colors} completed goal={goal} index={index} key={goal.id} onPress={() => { onSectionChange('goals'); onOpenGoal(goal.id); }} />)}</View> : <EmptyState colors={colors} copy="Goals you accomplish will collect here." title="No past goals yet" />}
    </LibraryPage>;
  }

  if (section === 'routineArchive') {
    return <LibraryPage backLabel="Routines" colors={colors} onBack={() => onSectionChange('routines')} subtitle="The rhythms that supported earlier chapters." title="Past Routines">
      {archivedHabits.length ? <View style={[styles.list, { backgroundColor: colors.card }]}>{archivedHabits.map((habit, index) => <RoutineRow archived colors={colors} habit={habit} index={index} key={habit.id} onPress={() => { onSectionChange('routines'); onOpenHabit(habit.id); }} />)}</View> : <EmptyState colors={colors} copy="Finished routines will stay here as part of your history." title="No past routines yet" />}
    </LibraryPage>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}><Text style={[styles.title, { color: colors.text }]}>Library</Text><Text style={[styles.subtitle, { color: colors.secondary }]}>The parts of your life worth returning to.</Text></View>
      <LibraryPortal accent={colors.purple} background={colors.purpleSoft} colors={colors} count={entries.length} description={entries.length ? `Your latest entry is from ${formatLongDate(entries[0].date)}.` : 'Daily reflections and journal entries collect here.'} icon="book.closed" label="Journal" onPress={() => onSectionChange('journal')} />
      <LibraryPortal accent={colors.yellow} background={colors.yellowSoft} colors={colors} count={activeGoals.length} description="Keep active direction close and revisit the goals you’ve achieved." icon="star" label="Goals" onPress={() => onSectionChange('goals')} />
      <LibraryPortal accent={colors.blue} background={colors.blueSoft} colors={colors} count={activeHabits.length} description="See and adjust the rhythms that populate your calendar." icon="repeat" label="Routines" onPress={() => onSectionChange('routines')} />
      {memory && <View style={styles.memorySection}>
        <Text style={[styles.sectionLabel, styles.memoryLabel, { color: colors.secondary }]}>A MEMORY</Text>
        <Pressable accessibilityRole="button" onPress={() => openEntry(memory)} style={({ pressed }) => [styles.memory, { backgroundColor: colors.purpleSoft }, pressed && styles.pressed]}>
          <View style={styles.memoryTop}><View style={[styles.memoryIcon, { backgroundColor: colors.background }]}><SymbolView name="sparkles" size={17} tintColor={colors.purple} weight="semibold" /></View><Text style={[styles.memoryDate, { color: colors.purple }]}>{formatLongDate(memory.date)}</Text><Text style={[styles.chevron, { color: colors.purple }]}>›</Text></View>
          <Text numberOfLines={4} style={[styles.memoryText, { color: colors.text }]}>{memory.reflection}</Text>
        </Pressable>
      </View>}
    </ScrollView>
  );
}

function JournalEditor({ colors, entry, onClose, onDelete, onSave, today }: { colors: AppColors; entry: JournalEntry | null; onClose(): void; onDelete(id: string): Promise<void>; onSave(draft: JournalEntryDraft): Promise<void>; today: string }) {
  const [reflection, setReflection] = useState(entry?.reflection ?? '');
  const [busy, setBusy] = useState(false);
  const date = entry?.date ?? today;

  async function save() {
    if (!reflection.trim()) { Alert.alert('Write something first', 'A journal entry needs a little writing before it can be saved.'); return; }
    try { setBusy(true); await onSave({ id: entry?.id, date, reflection }); }
    catch (caught) { Alert.alert('Entry not saved', caught instanceof Error ? caught.message : 'Please try again.'); setBusy(false); }
  }

  function confirmDelete() {
    if (!entry) return;
    Alert.alert('Delete this entry?', 'This removes it from your journal and your next backup.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(entry.id).catch((caught) => Alert.alert('Entry not deleted', caught instanceof Error ? caught.message : 'Please try again.')) },
    ]);
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editorRoot}><ScrollView contentContainerStyle={styles.editorContent} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
    <View style={styles.editorNav}><Pressable hitSlop={8} onPress={onClose}><Text style={[styles.editorNavText, { color: colors.blue }]}>Cancel</Text></Pressable><Text style={[styles.editorNavTitle, { color: colors.text }]}>{entry ? 'Journal Entry' : 'New Entry'}</Text><Pressable disabled={busy} hitSlop={8} onPress={() => void save()}>{busy ? <ActivityIndicator color={colors.blue} size="small" /> : <Text style={[styles.editorNavText, styles.editorDone, { color: colors.blue }]}>Done</Text>}</Pressable></View>
    <Text style={[styles.editorDate, { color: colors.secondary }]}>{formatLongDate(date)}</Text>
    <TextInput autoFocus multiline onChangeText={setReflection} placeholder="Write what you want to remember…" placeholderTextColor={colors.tertiary} selectionColor={colors.blue} style={[styles.editorInput, { color: colors.text }]} textAlignVertical="top" value={reflection} />
    {entry && <Pressable onPress={confirmDelete} style={styles.deleteEntry}><SymbolView name="trash" size={16} tintColor={colors.red} /><Text style={[styles.deleteEntryText, { color: colors.red }]}>Delete Entry</Text></Pressable>}
  </ScrollView></KeyboardAvoidingView>;
}

function LibraryPage({ backLabel = 'Library', children, colors, headerAction, onBack, subtitle, title }: { backLabel?: string; children: ReactNode; colors: AppColors; headerAction?: ReactNode; onBack(): void; subtitle: string; title: string }) {
  return <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Pressable accessibilityLabel={`Back to ${backLabel}`} hitSlop={8} onPress={onBack} style={[styles.back, { backgroundColor: colors.card }]}><SymbolView name="chevron.left" size={15} tintColor={colors.blue} weight="semibold" /><Text style={[styles.backText, { color: colors.blue }]}>{backLabel}</Text></Pressable>
    <View style={styles.pageHeaderRow}><View style={styles.pageHeaderCopy}><Text style={[styles.title, { color: colors.text }]}>{title}</Text><Text style={[styles.subtitle, { color: colors.secondary }]}>{subtitle}</Text></View>{headerAction}</View>
    {children}
  </ScrollView>;
}

function AddEntryButton({ colors, onPress }: { colors: AppColors; onPress(): void }) {
  return <Pressable accessibilityLabel="Add journal entry" onPress={onPress} style={({ pressed }) => [styles.addEntry, { backgroundColor: colors.blueSoft }, pressed && styles.pressed]}><SymbolView name="plus" size={13} tintColor={colors.blue} weight="semibold" /><Text style={[styles.addEntryText, { color: colors.blue }]}>Add</Text></Pressable>;
}

function LibraryPortal({ accent, background, colors, count, description, icon, label, onPress }: { accent: string; background: string; colors: AppColors; count: number; description: string; icon: SFSymbol; label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.portal, { backgroundColor: background }, pressed && styles.portalPressed]}>
    <View style={styles.portalTop}>
      <View style={[styles.portalIcon, { backgroundColor: colors.background }]}><SymbolView name={icon} size={20} tintColor={accent} weight="semibold" /></View>
      <View style={styles.portalIdentity}><Text style={[styles.portalTitle, { color: colors.text }]}>{label}</Text><Text style={[styles.portalCount, { color: accent }]}>{count}</Text></View>
      <Text style={[styles.portalChevron, { color: accent }]}>›</Text>
    </View>
    <Text style={[styles.portalDescription, { color: colors.secondary }]}>{description}</Text>
  </Pressable>;
}

function GoalRow({ colors, completed = false, goal, index, onPress }: { colors: AppColors; completed?: boolean; goal: Goal; index: number; onPress(): void }) {
  const accent = completed ? colors.tertiary : colors.yellow;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: completed ? colors.separator : 'rgba(199,141,0,0.18)', borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}><SymbolView name={completed ? 'star.fill' : 'star'} size={21} tintColor={accent} weight="semibold" /><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: completed ? colors.secondary : colors.text }]}>{goal.title}</Text><Text style={[styles.rowMeta, { color: accent }]}>{completed ? 'COMPLETED' : goal.horizon === 'someday' ? 'SOMEDAY · NO DEADLINE' : `${goal.horizon.toUpperCase()} GOAL`}</Text></View><Text style={[styles.chevron, { color: accent }]}>›</Text></Pressable>;
}

function RoutineRow({ archived = false, colors, habit, index, onPress }: { archived?: boolean; colors: AppColors; habit: Habit; index: number; onPress(): void }) {
  return <Pressable key={habit.id} onPress={onPress} style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
    <View style={[styles.rowIcon, { backgroundColor: archived ? colors.background : colors.blueSoft }]}><SymbolView name="repeat" size={17} tintColor={archived ? colors.tertiary : colors.blue} weight="semibold" /></View>
    <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: archived ? colors.secondary : colors.text }]}>{habit.name}</Text><Text style={[styles.rowMeta, { color: archived ? colors.tertiary : colors.secondary }]}>{archived ? `ENDED${habit.archivedAt ? ` · ${formatLongDate(habit.archivedAt.slice(0, 10))}` : ''}` : routineSchedule(habit)}</Text></View>
    <Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text>
  </Pressable>;
}

function ArchiveButton({ colors, count, label, onPress }: { colors: AppColors; count: number; label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.archiveButton, { backgroundColor: colors.card }, pressed && styles.pressed]}><Text style={[styles.archiveButtonText, { color: colors.blue }]}>{label}</Text><Text style={[styles.archiveCount, { color: colors.secondary }]}>{count}</Text><Text style={[styles.archiveChevron, { color: colors.blue }]}>›</Text></Pressable>;
}

function EmptyState({ colors, copy, title }: { colors: AppColors; copy: string; title: string }) { return <View style={[styles.empty, { backgroundColor: colors.card }]}><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyCopy, { color: colors.secondary }]}>{copy}</Text></View>; }

function routineSchedule(habit: Habit) {
  const days = habit.weekdays.length === 7 ? 'Every day' : habit.weekdays.map((day) => weekdayLabels[day]).join(' · ');
  if (habit.itemKind === 'event' && habit.startTime) return `${days} · ${habit.startTime}`;
  return `${days} · Creates a task`;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 120 }, hero: { marginBottom: 24 }, pageHeaderRow: { marginBottom: 22, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, pageHeaderCopy: { flex: 1 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 }, subtitle: { marginTop: 3, fontSize: 15, lineHeight: 21 }, back: { alignSelf: 'flex-start', height: 36, borderRadius: 18, paddingLeft: 10, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 14 }, backText: { fontSize: 15, fontWeight: '700' },
  addEntry: { height: 38, borderRadius: 19, paddingHorizontal: 13, marginTop: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, addEntryText: { fontSize: 15, fontWeight: '700' },
  portal: { minHeight: 128, borderRadius: 26, padding: 18, marginBottom: 12 }, portalPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] }, portalTop: { flexDirection: 'row', alignItems: 'center' }, portalIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, portalIdentity: { marginLeft: 12, flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 }, portalTitle: { fontSize: 23, fontWeight: '800', letterSpacing: -0.5 }, portalCount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }, portalChevron: { fontSize: 31, lineHeight: 32, fontWeight: '300' }, portalDescription: { marginTop: 12, fontSize: 14, lineHeight: 19 },
  memorySection: { marginTop: 29 }, memoryLabel: { marginTop: 0 }, memory: { borderRadius: 22, padding: 16 }, memoryTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, memoryIcon: { width: 31, height: 31, borderRadius: 15.5, alignItems: 'center', justifyContent: 'center' }, memoryDate: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' }, memoryText: { marginTop: 12, fontSize: 17, lineHeight: 24, letterSpacing: -0.1 },
  search: { height: 46, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9, marginBottom: 14 }, searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 }, loading: { marginTop: 30 },
  entry: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, marginBottom: 10 }, entryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, entryIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7 }, entryDate: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' }, entryKind: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, entryText: { fontSize: 16, lineHeight: 23 },
  sectionLabel: { marginTop: 24, marginLeft: 10, marginBottom: 8, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, firstSectionLabel: { marginTop: 0 }, goalList: { borderRadius: 22, overflow: 'hidden' }, list: { borderRadius: 22, overflow: 'hidden' }, row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 }, rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1 }, rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700' }, rowMeta: { marginTop: 3, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.5 }, chevron: { fontSize: 25, lineHeight: 26, fontWeight: '300' }, archiveButton: { minHeight: 48, borderRadius: 18, marginTop: 10, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' }, archiveButtonText: { flex: 1, fontSize: 15, fontWeight: '700' }, archiveCount: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }, archiveChevron: { marginLeft: 8, fontSize: 22, lineHeight: 24 }, empty: { borderRadius: 22, padding: 19 }, emptyTitle: { fontSize: 17, fontWeight: '800' }, emptyCopy: { marginTop: 5, fontSize: 14, lineHeight: 20 }, pressed: { opacity: 0.55 },
  editorRoot: { flex: 1 }, editorContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 }, editorNav: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, editorNavText: { minWidth: 54, fontSize: 16 }, editorDone: { textAlign: 'right', fontWeight: '700' }, editorNavTitle: { fontSize: 16, fontWeight: '700' }, editorDate: { marginTop: 24, marginBottom: 18, fontSize: 13, fontWeight: '700', letterSpacing: 0.45, textTransform: 'uppercase' }, editorInput: { minHeight: 360, fontSize: 20, lineHeight: 29, padding: 0 }, deleteEntry: { marginTop: 28, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 }, deleteEntryText: { fontSize: 15, fontWeight: '600' },
});
