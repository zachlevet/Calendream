import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import type { Goal, Habit, ISOWeekday, JournalEntry } from '@/models/planning';
import { formatLongDate } from '@/shared/date';
import type { AppColors } from '@/theme/colors';

type LibrarySection = 'home' | 'journal' | 'goals' | 'routines';

interface LibraryScreenProps {
  colors: AppColors;
  goals: Goal[];
  habits: Habit[];
  loadJournalEntries(): Promise<JournalEntry[]>;
  onOpenGoal(id: string): void;
  onOpenHabit(id: string): void;
  onOpenJournal(date: string): void;
}

const weekdayLabels: Record<ISOWeekday, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

export function LibraryScreen({ colors, goals, habits, loadJournalEntries, onOpenGoal, onOpenHabit, onOpenJournal }: LibraryScreenProps) {
  const [section, setSection] = useState<LibrarySection>('home');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');

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
  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.reflection.toLocaleLowerCase().includes(needle) || formatLongDate(entry.date).toLocaleLowerCase().includes(needle));
  }, [entries, query]);

  if (section === 'journal') {
    return (
      <LibraryPage colors={colors} onBack={() => { setQuery(''); setSection('home'); }} subtitle="Every daily reflection, newest first." title="Journal">
        <View style={[styles.search, { backgroundColor: colors.card }]}>
          <SymbolView name="magnifyingglass" size={15} tintColor={colors.secondary} />
          <TextInput
            onChangeText={setQuery}
            placeholder="Search your writing"
            placeholderTextColor={colors.tertiary}
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
          />
        </View>
        {loading ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : error ? (
          <EmptyState colors={colors} copy="Your writing couldn’t load yet. Leave Library and try again." title="Journal unavailable" />
        ) : filteredEntries.length ? filteredEntries.map((entry) => (
          <Pressable key={entry.date} onPress={() => onOpenJournal(entry.date)} style={({ pressed }) => [styles.entry, { borderColor: colors.separator }, pressed && styles.pressed]}>
            <View style={styles.entryHeading}>
              <Text style={[styles.entryDate, { color: colors.blue }]}>{formatLongDate(entry.date)}</Text>
              <Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text>
            </View>
            <Text numberOfLines={5} style={[styles.entryText, { color: colors.text }]}>{entry.reflection}</Text>
          </Pressable>
        )) : <EmptyState colors={colors} copy={query ? 'Try another word or phrase.' : 'Anything you write in Daily Reflection will appear here automatically.'} title={query ? 'No matching entries' : 'Your journal starts on Today'} />}
      </LibraryPage>
    );
  }

  if (section === 'goals') {
    return (
      <LibraryPage colors={colors} onBack={() => setSection('home')} subtitle="Active direction and goals you’ve completed." title="Goals">
        {activeGoals.length ? (
          <View style={[styles.goalList, { backgroundColor: colors.yellowSoft }]}>
            {activeGoals.map((goal, index) => <GoalRow colors={colors} goal={goal} index={index} key={goal.id} onPress={() => onOpenGoal(goal.id)} />)}
          </View>
        ) : <EmptyState colors={colors} copy="Ask Plan to keep something important in view." title="No active goals" />}
        {completedGoals.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondary }]}>COMPLETED</Text>
            <View style={[styles.list, { backgroundColor: colors.card }]}>
              {completedGoals.map((goal, index) => <GoalRow colors={colors} completed goal={goal} index={index} key={goal.id} onPress={() => onOpenGoal(goal.id)} />)}
            </View>
          </>
        )}
      </LibraryPage>
    );
  }

  if (section === 'routines') {
    return (
      <LibraryPage colors={colors} onBack={() => setSection('home')} subtitle="The rhythms that create tasks and events for you." title="Routines">
        {habits.length ? (
          <View style={[styles.list, { backgroundColor: colors.card }]}>
            {habits.map((habit, index) => (
              <Pressable key={habit.id} onPress={() => onOpenHabit(habit.id)} style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
                <View style={[styles.rowIcon, { backgroundColor: colors.blueSoft }]}><SymbolView name="repeat" size={17} tintColor={colors.blue} weight="semibold" /></View>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{habit.name}</Text>
                  <Text style={[styles.rowMeta, { color: colors.secondary }]}>{routineSchedule(habit)}</Text>
                </View>
                <Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : <EmptyState colors={colors} copy="Ask Plan for a recurring rhythm and it will appear here." title="No routines yet" />}
      </LibraryPage>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: colors.text }]}>Library</Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>Everything you want to remember or return to.</Text>
      </View>
      <Portal
        accent={colors.purple}
        background={colors.purpleSoft}
        colors={colors}
        count={entries.length}
        description={entries.length ? `Your latest entry is from ${formatLongDate(entries[0].date)}.` : 'Daily reflections collect here automatically.'}
        icon="book.closed"
        label="Journal"
        onPress={() => setSection('journal')}
      />
      <Portal
        accent={colors.yellow}
        background={colors.yellowSoft}
        colors={colors}
        count={activeGoals.length}
        description="Keep active direction close and revisit completed goals."
        icon="star"
        label="Goals"
        onPress={() => setSection('goals')}
      />
      <Portal
        accent={colors.blue}
        background={colors.blueSoft}
        colors={colors}
        count={habits.length}
        description="See and adjust the rhythms that populate your calendar."
        icon="repeat"
        label="Routines"
        onPress={() => setSection('routines')}
      />
    </ScrollView>
  );
}

function LibraryPage({ children, colors, onBack, subtitle, title }: { children: ReactNode; colors: AppColors; onBack(): void; subtitle: string; title: string }) {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Pressable accessibilityLabel="Back to Library" hitSlop={8} onPress={onBack} style={styles.back}>
        <SymbolView name="chevron.left" size={15} tintColor={colors.blue} weight="semibold" />
        <Text style={[styles.backText, { color: colors.blue }]}>Library</Text>
      </Pressable>
      <View style={styles.pageHeader}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>{subtitle}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

function Portal({ accent, background, colors, count, description, icon, label, onPress }: { accent: string; background: string; colors: AppColors; count: number; description: string; icon: SFSymbol; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.portal, { backgroundColor: background }, pressed && styles.portalPressed]}>
      <View style={styles.portalTop}>
        <View style={[styles.portalIcon, { backgroundColor: colors.background }]}><SymbolView name={icon} size={20} tintColor={accent} weight="semibold" /></View>
        <View style={styles.portalIdentity}>
          <Text style={[styles.portalTitle, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.portalCount, { color: accent }]}>{count}</Text>
        </View>
        <Text style={[styles.portalChevron, { color: accent }]}>›</Text>
      </View>
      <Text style={[styles.portalDescription, { color: colors.secondary }]}>{description}</Text>
    </Pressable>
  );
}

function GoalRow({ colors, completed = false, goal, index, onPress }: { colors: AppColors; completed?: boolean; goal: Goal; index: number; onPress(): void }) {
  const accent = completed ? colors.tertiary : colors.yellow;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: completed ? colors.separator : 'rgba(199,141,0,0.18)', borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
      <SymbolView name={completed ? 'star.fill' : 'star'} size={21} tintColor={accent} weight="semibold" />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: completed ? colors.secondary : colors.text }]}>{goal.title}</Text>
        <Text style={[styles.rowMeta, { color: accent }]}>{completed ? 'COMPLETED' : goal.horizon === 'someday' ? 'SOMEDAY · NO DEADLINE' : `${goal.horizon.toUpperCase()} GOAL`}</Text>
      </View>
      <Text style={[styles.chevron, { color: accent }]}>›</Text>
    </Pressable>
  );
}

function EmptyState({ colors, copy, title }: { colors: AppColors; copy: string; title: string }) {
  return <View style={[styles.empty, { backgroundColor: colors.card }]}><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyCopy, { color: colors.secondary }]}>{copy}</Text></View>;
}

function routineSchedule(habit: Habit) {
  const days = habit.weekdays.length === 7 ? 'Every day' : habit.weekdays.map((day) => weekdayLabels[day]).join(' · ');
  if (habit.itemKind === 'event' && habit.startTime) return `${days} · ${habit.startTime}`;
  return `${days} · Creates a task`;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 120 },
  hero: { marginBottom: 24 },
  pageHeader: { marginBottom: 22 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 },
  subtitle: { marginTop: 3, fontSize: 15, lineHeight: 21 },
  portal: { minHeight: 128, borderRadius: 26, padding: 18, marginBottom: 12 },
  portalPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  portalTop: { flexDirection: 'row', alignItems: 'center' },
  portalIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  portalIdentity: { marginLeft: 12, flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  portalTitle: { fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  portalCount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  portalChevron: { fontSize: 31, lineHeight: 32, fontWeight: '300' },
  portalDescription: { marginTop: 12, fontSize: 14, lineHeight: 19 },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  backText: { fontSize: 15, fontWeight: '700' },
  search: { height: 46, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  loading: { marginTop: 30 },
  entry: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, marginBottom: 10 },
  entryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  entryDate: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  entryText: { fontSize: 16, lineHeight: 23 },
  sectionLabel: { marginTop: 24, marginLeft: 10, marginBottom: 8, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  goalList: { borderRadius: 22, overflow: 'hidden' },
  list: { borderRadius: 22, overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  rowMeta: { marginTop: 3, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.5 },
  chevron: { fontSize: 25, lineHeight: 26, fontWeight: '300' },
  empty: { borderRadius: 22, padding: 19 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptyCopy: { marginTop: 5, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.55 },
});
