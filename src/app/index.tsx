import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PlanningItem } from '@/models/planning';

const SAMPLE_ITEMS: PlanningItem[] = [
  {
    id: 'team-call',
    kind: 'event',
    title: 'Team call',
    anchorStart: 'today',
    anchorEnd: 'today',
    precision: 'time',
    altitude: 1,
    startTime: '9:00 AM',
  },
  {
    id: 'lunch-tyler',
    kind: 'event',
    title: 'Lunch with Tyler',
    anchorStart: 'today',
    anchorEnd: 'today',
    precision: 'time',
    altitude: 1,
    startTime: '12:30 PM',
  },
  {
    id: 'finish-video',
    kind: 'task',
    title: 'Finish video',
    anchorStart: 'today',
    anchorEnd: 'today',
    precision: 'day',
    altitude: 1,
  },
  {
    id: 'run-eight',
    kind: 'task',
    title: 'Run 8 miles',
    anchorStart: 'today',
    anchorEnd: 'today',
    precision: 'day',
    altitude: 1,
  },
  {
    id: 'read',
    kind: 'task',
    title: 'Read 20 minutes',
    anchorStart: 'today',
    anchorEnd: 'today',
    precision: 'day',
    altitude: 0,
    habitName: 'Daily reading',
  },
];

type Destination = 'today' | 'timeline';

function formatToday() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = dark ? palette.dark : palette.light;
  const [destination, setDestination] = useState<Destination>('today');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [reflection, setReflection] = useState('');

  const events = useMemo(() => SAMPLE_ITEMS.filter((item) => item.kind === 'event'), []);
  const tasks = useMemo(() => SAMPLE_ITEMS.filter((item) => item.kind === 'task'), []);

  function toggleTask(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={[styles.wordmark, { color: colors.text }]}>Calendream</Text>
        <Pressable accessibilityLabel="Add an item" style={styles.addButton}>
          <Text style={styles.addSymbol}>+</Text>
        </Pressable>
      </View>

      {destination === 'today' ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={[styles.eyebrow, { color: colors.red }]}>TODAY</Text>
            <Text style={[styles.date, { color: colors.text }]}>{formatToday()}</Text>
            <Text style={[styles.daySummary, { color: colors.secondary }]}>2 events · 3 tasks · one clear day</Text>
          </View>

          <View style={[styles.focusCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.focusEyebrow, { color: colors.secondary }]}>UP NEXT</Text>
            <Text style={[styles.focusTitle, { color: colors.text }]}>Team call</Text>
            <Text style={[styles.focusMeta, { color: colors.blue }]}>9:00 AM · in 42 minutes</Text>
          </View>

          <SectionHeader title="Schedule" action="Add event" colors={colors} />
          {events.map((event) => (
            <View key={event.id} style={[styles.eventRow, { borderColor: colors.separator }]}>
              <Text style={[styles.eventTime, { color: colors.secondary }]}>{event.startTime}</Text>
              <View style={[styles.eventRule, { backgroundColor: colors.blue }]} />
              <Text style={[styles.rowTitle, { color: colors.text }]}>{event.title}</Text>
            </View>
          ))}

          <SectionHeader title="Focus" action="Add task" colors={colors} />
          {tasks.map((task) => {
            const done = completed.has(task.id);
            return (
              <Pressable
                key={task.id}
                onPress={() => toggleTask(task.id)}
                style={[styles.taskRow, { borderColor: colors.separator }]}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: done ? colors.blue : colors.tertiary },
                    done && { backgroundColor: colors.blue },
                  ]}
                >
                  {done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.taskCopy}>
                  <Text
                    style={[
                      styles.rowTitle,
                      { color: done ? colors.secondary : colors.text },
                      done && styles.completed,
                    ]}
                  >
                    {task.title}
                  </Text>
                  {task.habitName && (
                    <Text style={[styles.habitLabel, { color: colors.blue }]}>{task.habitName}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}

          <SectionHeader title="Reflection" colors={colors} />
          <TextInput
            multiline
            onChangeText={setReflection}
            placeholder="What mattered today?"
            placeholderTextColor={colors.tertiary}
            style={[
              styles.reflection,
              { color: colors.text, backgroundColor: colors.card },
            ]}
            value={reflection}
          />
        </ScrollView>
      ) : (
        <View style={styles.timelinePlaceholder}>
          <Text style={[styles.eyebrow, { color: colors.red }]}>YOUR LIFE, IN TIME</Text>
          <Text style={[styles.timelineTitle, { color: colors.text }]}>The timeline comes next.</Text>
          <Text style={[styles.timelineBody, { color: colors.secondary }]}>Month, quarter, and year will compress the same life data without turning Today into a calendar grid.</Text>
        </View>
      )}

      <View style={[styles.tabBar, { backgroundColor: colors.chrome, borderColor: colors.separator }]}>
        <TabButton
          active={destination === 'today'}
          label="Today"
          onPress={() => setDestination('today')}
          colors={colors}
        />
        <TabButton
          active={destination === 'timeline'}
          label="Timeline"
          onPress={() => setDestination('timeline')}
          colors={colors}
        />
      </View>
    </SafeAreaView>
  );
}

type AppColors = typeof palette.light;

function SectionHeader({ title, action, colors }: { title: string; action?: string; colors: AppColors }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && <Text style={[styles.sectionAction, { color: colors.blue }]}>{action}</Text>}
    </View>
  );
}

function TabButton({ active, label, onPress, colors }: { active: boolean; label: string; onPress: () => void; colors: AppColors }) {
  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <View style={[styles.tabGlyph, { backgroundColor: active ? colors.blue : colors.card }]} />
      <Text style={[styles.tabLabel, { color: active ? colors.blue : colors.secondary }]}>{label}</Text>
    </Pressable>
  );
}

const palette = {
  light: {
    background: '#FFFFFF',
    card: '#F2F2F7',
    chrome: 'rgba(249,249,249,0.96)',
    text: '#111111',
    secondary: '#6C6C70',
    tertiary: '#AEAEB2',
    separator: '#E5E5EA',
    blue: '#007AFF',
    red: '#FF3B30',
  },
  dark: {
    background: '#000000',
    card: '#1C1C1E',
    chrome: 'rgba(28,28,30,0.96)',
    text: '#FFFFFF',
    secondary: '#98989D',
    tertiary: '#636366',
    separator: '#2C2C2E',
    blue: '#0A84FF',
    red: '#FF453A',
  },
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    height: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSymbol: { color: '#FFFFFF', fontSize: 25, lineHeight: 27, fontWeight: '400' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: { paddingTop: 18, paddingBottom: 26 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  date: { fontSize: 34, fontWeight: '700', letterSpacing: -1.2, marginTop: 5 },
  daySummary: { fontSize: 15, marginTop: 7 },
  focusCard: { borderRadius: 20, padding: 18, marginBottom: 28 },
  focusEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  focusTitle: { fontSize: 22, fontWeight: '700', marginTop: 7, letterSpacing: -0.4 },
  focusMeta: { fontSize: 14, fontWeight: '600', marginTop: 5 },
  sectionHeader: {
    marginTop: 10,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  sectionAction: { fontSize: 15, fontWeight: '600' },
  eventRow: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventTime: { width: 76, fontSize: 14, fontVariant: ['tabular-nums'] },
  eventRule: { width: 3, height: 30, borderRadius: 2, marginRight: 13 },
  rowTitle: { fontSize: 17, fontWeight: '500', letterSpacing: -0.2 },
  taskRow: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  taskCopy: { flex: 1, paddingVertical: 8 },
  habitLabel: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  completed: { textDecorationLine: 'line-through' },
  reflection: {
    minHeight: 132,
    borderRadius: 18,
    padding: 16,
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 82,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingTop: 9,
    paddingBottom: 20,
  },
  tabButton: { flex: 1, alignItems: 'center', gap: 5 },
  tabGlyph: { width: 24, height: 17, borderRadius: 6 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  timelinePlaceholder: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 90,
  },
  timelineTitle: { fontSize: 34, fontWeight: '700', letterSpacing: -1, marginTop: 8 },
  timelineBody: { fontSize: 17, lineHeight: 25, marginTop: 14, maxWidth: 420 },
});
