import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTodayData, type ItemDraft } from '../hooks/use-today';
import type { PlanningItem } from '../models/planning';

type Destination = 'today' | 'timeline';
type EditorState = { kind: 'task' | 'event'; item?: PlanningItem } | null;

function localISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatToday() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function daysFromToday(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function timeMinutes(value?: string) {
  if (!value) return -1;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3]?.toLowerCase();
  if (period === 'am' && hour === 12) hour = 0;
  if (period === 'pm' && hour < 12) hour += 12;
  return hour * 60 + minute;
}

export default function HomeScreen() {
  const dark = useColorScheme() === 'dark';
  const colors = dark ? palette.dark : palette.light;
  const today = localISO();
  const data = useTodayData(today);
  const [destination, setDestination] = useState<Destination>('today');
  const [editor, setEditor] = useState<EditorState>(null);
  const [journal, setJournal] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setJournal(data.journal), 0);
    return () => clearTimeout(timer);
  }, [data.journal]);

  const events = useMemo(
    () => data.items
      .filter((item) => item.kind === 'event')
      .sort((a, b) => timeMinutes(a.startTime) - timeMinutes(b.startTime)),
    [data.items],
  );
  const tasks = useMemo(
    () => data.items.filter((item) => item.kind === 'task'),
    [data.items],
  );
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nextEvent = events.find((event) => {
    const minutes = timeMinutes(event.startTime);
    return minutes === -1 || minutes >= currentMinutes;
  });

  async function saveDraft(draft: ItemDraft) {
    await data.saveItem(draft);
    setEditor(null);
  }

  async function removeItem(id: string) {
    await data.deleteItem(id);
    setEditor(null);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={[styles.wordmark, { color: colors.text }]}>Calendream</Text>
        <Pressable
          accessibilityLabel="Add an item"
          onPress={() => setEditor({ kind: 'task' })}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addSymbol}>+</Text>
        </Pressable>
      </View>

      {destination === 'today' ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={[styles.eyebrow, { color: colors.red }]}>TODAY</Text>
            <Text style={[styles.date, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatToday()}
            </Text>
            <Text style={[styles.daySummary, { color: colors.secondary }]}>
              {countLabel(events.length, 'event')} · {countLabel(tasks.length, 'task')}
            </Text>
          </View>

          {data.upcoming.length > 0 && (
            <ScrollView
              horizontal
              contentContainerStyle={styles.upcomingList}
              showsHorizontalScrollIndicator={false}
              style={styles.upcomingScroller}
            >
              {data.upcoming.map((item) => {
                const days = daysFromToday(item.anchorStart ?? today);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setEditor({ kind: 'event', item })}
                    style={[styles.upcomingPill, { backgroundColor: colors.blueSoft }]}
                  >
                    <Text style={[styles.upcomingText, { color: colors.blue }]} numberOfLines={1}>
                      {item.title} · {days === 1 ? 'tomorrow' : `in ${days} days`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.upNextCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardEyebrow, { color: colors.secondary }]}>UP NEXT</Text>
            {nextEvent ? (
              <Pressable onPress={() => setEditor({ kind: 'event', item: nextEvent })}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>{nextEvent.title}</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>
                  {nextEvent.startTime || 'All day'}
                </Text>
              </Pressable>
            ) : events.length > 0 ? (
              <Pressable onPress={() => setEditor({ kind: 'event' })}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>Events complete</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>Plan what comes next</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setEditor({ kind: 'event' })}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>Your day is open</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>Add an event</Text>
              </Pressable>
            )}
          </View>

          {data.loading ? (
            <ActivityIndicator color={colors.blue} style={styles.loader} />
          ) : (
            <>
              <SectionHeader
                action="Add event"
                colors={colors}
                onAction={() => setEditor({ kind: 'event' })}
                title="Events"
              />
              {events.length === 0 ? (
                <EmptyRow colors={colors} label="No events planned" />
              ) : events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => setEditor({ kind: 'event', item: event })}
                  style={({ pressed }) => [
                    styles.eventRow,
                    { borderColor: colors.separator },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.eventTime, { color: colors.secondary }]}>
                    {event.startTime || 'All day'}
                  </Text>
                  <View style={[styles.eventRule, { backgroundColor: colors.blue }]} />
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{event.title}</Text>
                    {event.notes && (
                      <Text style={[styles.rowNote, { color: colors.secondary }]} numberOfLines={1}>
                        {event.notes}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}

              <SectionHeader
                action="Add task"
                colors={colors}
                onAction={() => setEditor({ kind: 'task' })}
                title="Tasks"
              />
              {tasks.length === 0 ? (
                <EmptyRow colors={colors} label="No tasks yet" />
              ) : tasks.map((task) => (
                <View key={task.id} style={[styles.taskRow, { borderColor: colors.separator }]}>
                  <Pressable
                    accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
                    onPress={() => void data.toggleTask(task)}
                    hitSlop={8}
                    style={[
                      styles.checkbox,
                      { borderColor: task.completed ? colors.blue : colors.tertiary },
                      task.completed && { backgroundColor: colors.blue },
                    ]}
                  >
                    {task.completed && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                  <Pressable
                    onPress={() => setEditor({ kind: 'task', item: task })}
                    style={styles.taskCopy}
                  >
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: task.completed ? colors.secondary : colors.text },
                        task.completed && styles.completed,
                      ]}
                    >
                      {task.title}
                    </Text>
                    {task.notes && (
                      <Text style={[styles.rowNote, { color: colors.secondary }]} numberOfLines={1}>
                        {task.notes}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ))}

              <SectionHeader colors={colors} title="Notes" />
              <TextInput
                multiline
                onBlur={() => void data.saveJournal(journal)}
                onChangeText={setJournal}
                placeholder="Journal about today…"
                placeholderTextColor={colors.tertiary}
                style={[styles.journal, { color: colors.text, backgroundColor: colors.card }]}
                value={journal}
              />
              <Text style={[styles.saveHint, { color: colors.tertiary }]}>Saved when you finish editing</Text>
            </>
          )}
        </ScrollView>
      ) : (
        <View style={styles.timelinePlaceholder}>
          <Text style={[styles.eyebrow, { color: colors.red }]}>YOUR LIFE, IN TIME</Text>
          <Text style={[styles.timelineTitle, { color: colors.text }]}>The timeline comes next.</Text>
          <Text style={[styles.timelineBody, { color: colors.secondary }]}>Month, quarter, and year will compress the same life data without turning Today into a calendar grid.</Text>
        </View>
      )}

      <View style={[styles.tabBar, { backgroundColor: colors.chrome, borderColor: colors.separator }]}>
        <TabButton active={destination === 'today'} colors={colors} label="Today" onPress={() => setDestination('today')} />
        <TabButton active={destination === 'timeline'} colors={colors} label="Timeline" onPress={() => setDestination('timeline')} />
      </View>

      <ItemEditor
        colors={colors}
        initial={editor}
        key={`${editor?.item?.id ?? 'new'}-${editor?.kind ?? 'closed'}`}
        onClose={() => setEditor(null)}
        onDelete={removeItem}
        onSave={saveDraft}
        today={today}
      />
    </SafeAreaView>
  );
}

type AppColors = typeof palette.light;

function SectionHeader({ title, action, onAction, colors }: {
  title: string;
  action?: string;
  onAction?: () => void;
  colors: AppColors;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.sectionAction, { color: colors.blue }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyRow({ label, colors }: { label: string; colors: AppColors }) {
  return <Text style={[styles.emptyRow, { color: colors.tertiary, borderColor: colors.separator }]}>{label}</Text>;
}

function TabButton({ active, label, onPress, colors }: {
  active: boolean;
  label: string;
  onPress: () => void;
  colors: AppColors;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <View style={[styles.tabGlyph, { backgroundColor: active ? colors.blue : colors.card }]} />
      <Text style={[styles.tabLabel, { color: active ? colors.blue : colors.secondary }]}>{label}</Text>
    </Pressable>
  );
}

function ItemEditor({ initial, today, colors, onClose, onSave, onDelete }: {
  initial: EditorState;
  today: string;
  colors: AppColors;
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const item = initial?.item;
  const [kind, setKind] = useState<'task' | 'event'>(initial?.kind ?? 'task');
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.anchorStart ?? today);
  const [time, setTime] = useState(item?.startTime ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    await onSave({ id: item?.id, kind, title, date, time, notes });
  }

  function confirmDelete() {
    if (!item) return;
    Alert.alert(`Delete ${item.kind}?`, `“${item.title}” will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(item.id) },
    ]);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(initial)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.editor, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.editorSafe} edges={['top', 'bottom']}>
          <View style={styles.editorBar}>
            <Pressable onPress={onClose}><Text style={[styles.editorButton, { color: colors.blue }]}>Cancel</Text></Pressable>
            <Text style={[styles.editorHeading, { color: colors.text }]}>{item ? 'Edit' : 'New item'}</Text>
            <Pressable disabled={!valid || saving} onPress={() => void submit()}>
              <Text style={[styles.editorButton, { color: valid ? colors.blue : colors.tertiary, fontWeight: '700' }]}>{saving ? 'Saving' : 'Save'}</Text>
            </Pressable>
          </View>

          <View style={[styles.kindPicker, { backgroundColor: colors.card }]}>
            {(['task', 'event'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setKind(option)}
                style={[styles.kindOption, kind === option && { backgroundColor: colors.background }]}
              >
                <Text style={[styles.kindText, { color: kind === option ? colors.text : colors.secondary }]}>
                  {option === 'task' ? 'Task' : 'Event'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <TextInput
              autoFocus
              onChangeText={setTitle}
              placeholder={kind === 'task' ? 'What needs doing?' : 'What is happening?'}
              placeholderTextColor={colors.tertiary}
              style={[styles.titleInput, { color: colors.text, borderColor: colors.separator }]}
              value={title}
            />
            <LabeledInput colors={colors} label="DATE" onChangeText={setDate} placeholder="YYYY-MM-DD" value={date} />
            {kind === 'event' && (
              <LabeledInput colors={colors} label="TIME" onChangeText={setTime} placeholder="9:00 AM or All day" value={time} />
            )}
            <LabeledInput colors={colors} label="NOTES" multiline onChangeText={setNotes} placeholder="Optional details" value={notes} />
          </View>

          {item && (
            <Pressable onPress={confirmDelete} style={[styles.deleteButton, { backgroundColor: colors.card }]}>
              <Text style={[styles.deleteText, { color: colors.red }]}>Delete {item.kind}</Text>
            </Pressable>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledInput({ label, colors, multiline, ...props }: {
  label: string;
  colors: AppColors;
  multiline?: boolean;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={[styles.inputRow, multiline && styles.notesInputRow, { borderColor: colors.separator }]}>
      <Text style={[styles.inputLabel, { color: colors.secondary }]}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.tertiary}
        style={[styles.fieldInput, multiline && styles.notesField, { color: colors.text }]}
      />
    </View>
  );
}

const palette = {
  light: {
    background: '#FFFFFF', card: '#F2F2F7', chrome: 'rgba(249,249,249,0.96)',
    text: '#111111', secondary: '#6C6C70', tertiary: '#AEAEB2', separator: '#E5E5EA',
    blue: '#007AFF', blueSoft: '#E8F2FF', red: '#FF3B30',
  },
  dark: {
    background: '#000000', card: '#1C1C1E', chrome: 'rgba(28,28,30,0.96)',
    text: '#FFFFFF', secondary: '#98989D', tertiary: '#636366', separator: '#2C2C2E',
    blue: '#0A84FF', blueSoft: '#102A43', red: '#FF453A',
  },
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  pressed: { opacity: 0.6 },
  topBar: { height: 44, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
  addSymbol: { color: '#FFFFFF', fontSize: 24, lineHeight: 25, fontWeight: '400' },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 104 },
  hero: { paddingTop: 7, paddingBottom: 12 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  date: { fontSize: 31, fontWeight: '700', letterSpacing: -1, marginTop: 3 },
  daySummary: { fontSize: 14, marginTop: 3 },
  upcomingScroller: { marginHorizontal: -18, marginBottom: 10 },
  upcomingList: { paddingHorizontal: 18, gap: 7 },
  upcomingPill: { minHeight: 28, borderRadius: 14, paddingHorizontal: 11, justifyContent: 'center', maxWidth: 260 },
  upcomingText: { fontSize: 13, fontWeight: '600' },
  upNextCard: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  cardEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  upNextTitle: { fontSize: 19, fontWeight: '700', marginTop: 4, letterSpacing: -0.3 },
  upNextMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  loader: { paddingVertical: 40 },
  sectionHeader: { marginTop: 5, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  sectionAction: { fontSize: 14, fontWeight: '600' },
  eventRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  eventTime: { width: 68, fontSize: 13, fontVariant: ['tabular-nums'] },
  eventRule: { width: 3, height: 27, borderRadius: 2, marginRight: 11 },
  rowCopy: { flex: 1, paddingVertical: 6 },
  rowTitle: { fontSize: 16, fontWeight: '500', letterSpacing: -0.15 },
  rowNote: { fontSize: 12, marginTop: 2 },
  taskRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  taskCopy: { flex: 1, paddingVertical: 8 },
  completed: { textDecorationLine: 'line-through' },
  emptyRow: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 14, paddingTop: 10 },
  journal: { minHeight: 96, borderRadius: 14, padding: 13, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  saveHint: { fontSize: 11, marginTop: 5, marginLeft: 2 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingTop: 8, paddingBottom: 20 },
  tabButton: { flex: 1, alignItems: 'center', gap: 4 },
  tabGlyph: { width: 23, height: 16, borderRadius: 6 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  timelinePlaceholder: { flex: 1, paddingHorizontal: 24, paddingTop: 72 },
  timelineTitle: { fontSize: 34, fontWeight: '700', letterSpacing: -1, marginTop: 8 },
  timelineBody: { fontSize: 17, lineHeight: 25, marginTop: 14, maxWidth: 420 },
  editor: { flex: 1 },
  editorSafe: { flex: 1 },
  editorBar: { height: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorHeading: { fontSize: 16, fontWeight: '700' },
  editorButton: { fontSize: 16 },
  kindPicker: { flexDirection: 'row', marginHorizontal: 18, marginTop: 12, padding: 3, borderRadius: 10 },
  kindOption: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  kindText: { fontSize: 14, fontWeight: '600' },
  formCard: { marginHorizontal: 18, marginTop: 18, borderRadius: 14, overflow: 'hidden' },
  titleInput: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 18, fontWeight: '600' },
  inputRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  notesInputRow: { minHeight: 94, alignItems: 'flex-start', paddingTop: 14 },
  inputLabel: { width: 58, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  fieldInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  notesField: { minHeight: 72, textAlignVertical: 'top', paddingTop: 0 },
  deleteButton: { height: 50, marginHorizontal: 18, marginTop: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 16, fontWeight: '600' },
});
