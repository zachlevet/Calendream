import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTodayData, type ItemDraft } from '../hooks/use-today';
import type { LocationPlace, PlanningItem } from '../models/planning';
import CalendreamMapKit from '../../modules/calendream-mapkit/src/CalendreamMapKitModule';
import type { MapSuggestion } from '../../modules/calendream-mapkit/src/CalendreamMapKit.types';

type Destination = 'today' | 'timeline';
type EditorState = { kind: 'task' | 'event'; item?: PlanningItem } | null;

function localISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function useLocalToday() {
  const [today, setToday] = useState(localISO);

  useEffect(() => {
    function updateDate() {
      setToday(localISO());
    }

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const midnightTimer = setTimeout(updateDate, nextMidnight.getTime() - now.getTime() + 250);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateDate();
    });

    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, [today]);

  return today;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(dateFromISO(date));
}

function dayEyebrow(date: string, today: string) {
  const difference = daysFromISO(today, date);
  if (difference === 0) return 'TODAY';
  if (difference === 1) return 'TOMORROW';
  if (difference === -1) return 'YESTERDAY';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dateFromISO(date)).toUpperCase();
}

function daysFromISO(start: string, end: string) {
  return Math.round((dateFromISO(end).getTime() - dateFromISO(start).getTime()) / 86_400_000);
}

function daysFromToday(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function addLocalDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return localISO(new Date(year, month - 1, day + amount));
}

function formatShortDate(isoDate: string | null) {
  if (!isoDate) return 'Earlier';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(new Date(year, month - 1, day));
}

function dateFromISO(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDestination(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .format(dateFromISO(isoDate));
}

function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    .format(dateFromISO(isoDate));
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

async function openItemInMaps(item: PlanningItem) {
  if (!item.location) return;
  if (CalendreamMapKit && item.locationPlace) {
    const place = item.locationPlace;
    await CalendreamMapKit.openInMapsAsync(place.name, place.address, place.latitude, place.longitude);
    return;
  }
  const query = encodeURIComponent(item.location);
  await Linking.openURL(`http://maps.apple.com/?q=${query}`);
}

export default function HomeScreen() {
  const dark = useColorScheme() === 'dark';
  const colors = dark ? palette.dark : palette.light;
  const today = useLocalToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const data = useTodayData(selectedDate, today);
  const [destination, setDestination] = useState<Destination>('today');
  const [editor, setEditor] = useState<EditorState>(null);
  const [journal, setJournal] = useState('');
  const [briefingSessionActive, setBriefingSessionActive] = useState(false);
  const [inlineEditor, setInlineEditor] = useState<EditorState>(null);
  const todayScroll = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSelectedDate(today), 0);
    return () => clearTimeout(timer);
  }, [today]);

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
  const currentMinutes = selectedDate === today ? now.getHours() * 60 + now.getMinutes() : selectedDate > today ? -1 : Number.MAX_SAFE_INTEGER;
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

  async function saveInline(draft: ItemDraft) {
    await data.saveItem(draft);
    setInlineEditor(null);
  }

  function moveTask(taskId: string, targetIndex: number) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const target = Math.max(0, Math.min(tasks.length - 1, targetIndex));
    if (index < 0 || target === index) return;
    const ordered = [...tasks];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    void data.reorderTasks(ordered.map((task) => task.id));
  }

  function revealInline(y: number) {
    setTimeout(() => todayScroll.current?.scrollTo({ y: Math.max(0, y - 150), animated: true }), 80);
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

      {destination === 'today' && (
        <CompactDateRail colors={colors} onSelect={(date) => {
          setSelectedDate(date);
          setInlineEditor(null);
          setEditor(null);
        }} selectedDate={selectedDate} today={today} />
      )}

      {destination === 'today' ? (
        <View style={styles.dayPage}>
        <ScrollView
          key={selectedDate}
          ref={todayScroll}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {data.upcoming.length > 0 && (
            <ScrollView
              horizontal
              contentContainerStyle={styles.upcomingList}
              showsHorizontalScrollIndicator={false}
              style={styles.upcomingScroller}
            >
              {data.upcoming.map((item) => {
                const days = daysFromToday(item.anchorStart ?? selectedDate);
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
              <Pressable onPress={() => setInlineEditor({ kind: 'event', item: nextEvent })}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>{nextEvent.title}</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>
                  {nextEvent.startTime || 'All day'}
                </Text>
              </Pressable>
            ) : events.length > 0 ? (
              <Pressable onPress={() => setInlineEditor({ kind: 'event' })}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>Events complete</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>Plan what comes next</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setInlineEditor({ kind: 'event' })}>
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
                onAction={() => setInlineEditor(inlineEditor?.kind === 'event' && !inlineEditor.item ? null : { kind: 'event' })}
                title="Events"
              />
              {events.length === 0 ? (
                <EmptyRow colors={colors} label="No events planned" />
              ) : events.map((event) => (
                <Fragment key={event.id}>
                <Pressable
                  onPress={() => setInlineEditor({ kind: 'event', item: event })}
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
                    {(event.notes || event.location) && (
                      <Text style={[styles.rowNote, { color: colors.secondary }]} numberOfLines={1}>
                        {[event.location, event.notes].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                  {event.location && (
                    <Pressable
                      accessibilityLabel={`Open ${event.location} in Maps`}
                      hitSlop={8}
                      onPress={(pressEvent) => {
                        pressEvent.stopPropagation();
                        void openItemInMaps(event);
                      }}
                      style={[styles.mapsButton, { backgroundColor: colors.blueSoft }]}
                    >
                      <Text style={[styles.mapsButtonText, { color: colors.blue }]}>Maps</Text>
                    </Pressable>
                  )}
                </Pressable>
                {inlineEditor?.item?.id === event.id && (
                <InlineComposer colors={colors} initial={event} key={event.id} kind="event" onCancel={() => setInlineEditor(null)} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
                )}
                </Fragment>
              ))}
              {inlineEditor?.kind === 'event' && !inlineEditor.item && (
                <InlineComposer colors={colors} key="new-event" kind="event" onCancel={() => setInlineEditor(null)} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
              )}

              <SectionHeader
                action="Add task"
                colors={colors}
                onAction={() => setInlineEditor(inlineEditor?.kind === 'task' && !inlineEditor.item ? null : { kind: 'task' })}
                title="Tasks"
              />
              {tasks.length === 0 ? (
                <EmptyRow colors={colors} label="No tasks yet" />
              ) : tasks.map((task, index) => (
                <DraggableTaskRow colors={colors} index={index} key={task.id} onEdit={() => setEditor({ kind: 'task', item: task })} onMove={moveTask} onToggle={() => void data.toggleTask(task)} task={task} />
              ))}
              {inlineEditor?.kind === 'task' && !inlineEditor.item && (
                <InlineComposer colors={colors} key="new-task" kind="task" onCancel={() => setInlineEditor(null)} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
              )}

              <SectionHeader colors={colors} title="Notes" />
              <TextInput
                multiline
                onBlur={() => void data.saveJournal(journal)}
                onChangeText={setJournal}
                placeholder={selectedDate < today ? 'What happened this day?' : selectedDate > today ? 'Plan or leave a note for this day…' : 'Journal about today…'}
                placeholderTextColor={colors.tertiary}
                style={[styles.journal, { color: colors.text, backgroundColor: colors.card }]}
                value={journal}
              />
              <Text style={[styles.saveHint, { color: colors.tertiary }]}>Saved when you finish editing</Text>
            </>
          )}
        </ScrollView>
        </View>
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
        today={selectedDate}
      />
      <MorningBriefing
        colors={colors}
        onDismissTask={async (id) => {
          setBriefingSessionActive(true);
          await data.dismissOverdueTask(id);
        }}
        onMoveTask={async (id, date) => {
          setBriefingSessionActive(true);
          await data.moveOverdueTask(id, date);
        }}
        onSkip={async () => {
          setBriefingSessionActive(false);
          await data.skipMorningReview();
        }}
        tasks={data.overdueTasks}
        today={today}
        visible={selectedDate === today && (data.morningReviewDue || briefingSessionActive) && data.overdueTasks.length > 0}
      />
    </SafeAreaView>
  );
}

type AppColors = typeof palette.light;

function CompactDateRail({ today, selectedDate, colors, onSelect }: {
  today: string;
  selectedDate: string;
  colors: AppColors;
  onSelect: (date: string) => void;
}) {
  const [browse] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const nearbyDays = Array.from({ length: 3 }, (_, index) => addLocalDays(selectedDate, index + 1));
  const browseDays = Array.from({ length: 7 }, (_, index) => addLocalDays(selectedDate, index - 3));

  const settle = (targetDate?: string) => {
    if (targetDate) onSelect(targetDate);
    Animated.parallel([
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
      Animated.timing(browse, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      Animated.timing(browse, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    },
    onPanResponderMove: (_, gesture) => drag.setValue(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      const distance = gesture.dx + gesture.vx * 35;
      const steps = Math.max(-3, Math.min(3, Math.round(-distance / 54)));
      settle(steps === 0 ? undefined : addLocalDays(selectedDate, steps));
    },
    onPanResponderTerminate: () => settle(),
  });

  const titleMotion = {
    opacity: browse.interpolate({ inputRange: [0, 0.72], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [{ translateX: browse.interpolate({ inputRange: [0, 1], outputRange: [0, -36] }) }],
  };
  const compactMotion = {
    opacity: browse.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' }),
  };
  const browseMotion = {
    opacity: browse,
    transform: [{ translateX: Animated.multiply(drag, 0.18) }],
  };

  return (
    <View {...responder.panHandlers} style={[styles.compactDateHeader, { borderColor: colors.separator }]}>
      <Animated.View pointerEvents="none" style={[styles.compactDateCopy, titleMotion]}>
        <Text style={[styles.compactEyebrow, { color: selectedDate === today ? colors.red : colors.blue }]}>{dayEyebrow(selectedDate, today)}</Text>
        <Text adjustsFontSizeToFit numberOfLines={2} style={[styles.compactDateTitle, { color: colors.text }]}>{formatDay(selectedDate)}</Text>
      </Animated.View>

      <Animated.View style={[styles.nearbyRail, compactMotion]}>
        {nearbyDays.map((date) => <RailDay colors={colors} date={date} key={date} onSelect={onSelect} selectedDate={selectedDate} today={today} />)}
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.browseRail, browseMotion]}>
        {browseDays.map((date) => <RailDay colors={colors} date={date} key={date} onSelect={(next) => settle(next)} selectedDate={selectedDate} today={today} />)}
      </Animated.View>
    </View>
  );
}

function RailDay({ date, today, selectedDate, colors, onSelect }: {
  date: string;
  today: string;
  selectedDate: string;
  colors: AppColors;
  onSelect: (date: string) => void;
}) {
  const selected = date === selectedDate;
  const actualToday = date === today;
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(dateFromISO(date));
  return (
    <Pressable accessibilityLabel={formatDay(date)} onPress={() => onSelect(date)} style={styles.dayRailItem}>
      <Text style={[styles.dayRailLabel, { color: actualToday ? colors.red : colors.secondary }]}>{weekday}</Text>
      <View style={[
        styles.dayRailOrb,
        actualToday && !selected && { borderColor: colors.red, borderWidth: 1.5 },
        selected && { backgroundColor: colors.blue },
      ]}>
        <Text style={[styles.dayRailNumber, { color: selected ? '#FFFFFF' : colors.text }]}>{dateFromISO(date).getDate()}</Text>
      </View>
    </Pressable>
  );
}

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

function DraggableTaskRow({ task, index, colors, onToggle, onEdit, onMove }: {
  task: PlanningItem;
  index: number;
  colors: AppColors;
  onToggle: () => void;
  onEdit: () => void;
  onMove: (id: string, targetIndex: number) => void;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const [dragging, setDragging] = useState(false);
  const [suppressPress, setSuppressPress] = useState(false);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => dragging && Math.abs(gesture.dy) > 2,
    onPanResponderMove: (_, gesture) => translateY.setValue(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      const target = index + Math.round(gesture.dy / 48);
      setDragging(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 24 }).start();
      onMove(task.id, target);
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [dragging, index, onMove, task.id, translateY]);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[styles.taskRow, { borderColor: colors.separator, transform: [{ translateY }] }]}
    >
      <Pressable
        accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        hitSlop={8}
        onPress={onToggle}
        style={[
          styles.checkbox,
          { borderColor: task.completed ? colors.blue : colors.tertiary },
          task.completed && { backgroundColor: colors.blue },
        ]}
      >
        {task.completed && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>
      <Pressable
        delayLongPress={280}
        onLongPress={() => {
          setDragging(true);
          setSuppressPress(true);
          Animated.spring(translateY, { toValue: -2, useNativeDriver: true, speed: 30 }).start();
        }}
        onPress={() => {
          if (suppressPress) {
            setSuppressPress(false);
            return;
          }
          onEdit();
        }}
        style={styles.taskCopy}
      >
        <Text style={[styles.rowTitle, { color: task.completed ? colors.secondary : colors.text }, task.completed && styles.completed]}>{task.title}</Text>
        {task.notes && <Text style={[styles.rowNote, { color: colors.secondary }]} numberOfLines={1}>{task.notes}</Text>}
      </Pressable>
    </Animated.View>
  );
}

function InlineTimePicker({ value, colors, onChange }: {
  value: string;
  colors: AppColors;
  onChange: (value: string) => void;
}) {
  const [selectedTime, setSelectedTime] = useState(() => {
    const date = new Date();
    const match = value.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i);
    let hour = Number(match?.[1] ?? 9);
    const minute = Number(match?.[2] ?? 0);
    const period = match?.[3]?.toUpperCase();
    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour < 12) hour += 12;
    date.setHours(hour, minute, 0, 0);
    return date;
  });

  return (
    <View style={styles.wheelPickerWrap}>
      <DateTimePicker
        accentColor={colors.blue}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        mode="time"
        onValueChange={(_, nextTime) => {
          setSelectedTime(nextTime);
          onChange(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(nextTime));
        }}
        textColor={colors.text}
        value={selectedTime}
      />
    </View>
  );
}

function InlineComposer({ kind, today, colors, initial, onCancel, onReveal, onSave }: {
  kind: 'task' | 'event';
  today: string;
  colors: AppColors;
  initial?: PlanningItem;
  onCancel: () => void;
  onReveal: (y: number) => void;
  onSave: (draft: ItemDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [time, setTime] = useState(initial?.startTime ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [locationPlace, setLocationPlace] = useState<LocationPlace | undefined>(initial?.locationPlace);
  const [timeOpen, setTimeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const layoutY = useRef(0);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave({ id: initial?.id, kind, title, date: today, time, notes, location, locationPlace });
  }

  function focusComposer() {
    onReveal(layoutY.current);
  }

  return (
    <View onLayout={(event) => { layoutY.current = event.nativeEvent.layout.y; }} style={[styles.inlineComposer, { backgroundColor: colors.card }]}>
      <TextInput
        autoFocus
        onChangeText={setTitle}
        onFocus={focusComposer}
        onSubmitEditing={() => kind === 'task' && void submit()}
        placeholder={kind === 'event' ? 'Event' : 'Task'}
        placeholderTextColor={colors.tertiary}
        returnKeyType={kind === 'task' ? 'done' : 'next'}
        style={[styles.inlineTitle, { color: colors.text, borderColor: colors.separator }]}
        value={title}
      />
      {kind === 'event' && (
        <>
          <Pressable onPress={() => {
            Keyboard.dismiss();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setTimeOpen((open) => !open);
            focusComposer();
          }} style={[styles.inlineTimeButton, { borderColor: colors.separator }]}>
            <Text style={[styles.inlineTimeValue, { color: time ? colors.text : colors.tertiary }]}>{time || 'Time'}</Text>
          </Pressable>
          {timeOpen && <InlineTimePicker colors={colors} onChange={setTime} value={time} />}
        </>
      )}
      <TextInput
        onChangeText={setNotes}
        onFocus={focusComposer}
        placeholder={kind === 'task' ? 'Subtext (optional)' : 'Notes (optional)'}
        placeholderTextColor={colors.tertiary}
        style={[styles.inlineField, { color: colors.text, borderColor: colors.separator }]}
        value={notes}
      />
      {kind === 'event' && (
        <LocationInput
          colors={colors}
          onFocus={focusComposer}
          onPlaceChange={(place) => {
            setLocationPlace(place);
            setLocation(place.address);
          }}
          onTextChange={(text) => {
            setLocation(text);
            setLocationPlace(undefined);
          }}
          value={location}
        />
      )}
      <View style={styles.inlineActions}>
        <Pressable onPress={onCancel} hitSlop={8}><Text style={[styles.inlineAction, { color: colors.secondary }]}>Cancel</Text></Pressable>
        <Pressable disabled={!title.trim() || saving} onPress={() => void submit()} style={[styles.inlineSave, { backgroundColor: title.trim() ? colors.blue : colors.tertiary }]}>
          <Text style={styles.inlineSaveText}>{saving ? 'Saving…' : initial ? `Save ${kind}` : `Add ${kind}`}</Text>
        </Pressable>
      </View>
    </View>
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
  const [location, setLocation] = useState(item?.location ?? '');
  const [locationPlace, setLocationPlace] = useState<LocationPlace | undefined>(item?.locationPlace);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const initialMonth = dateFromISO(item?.anchorStart ?? today);
  const [visibleMonth, setVisibleMonth] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    await onSave({ id: item?.id, kind, title, date, time, notes, location, locationPlace });
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

          <ScrollView keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
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
              placeholder={kind === 'task' ? 'Task' : 'Event'}
              placeholderTextColor={colors.tertiary}
              style={[styles.titleInput, { color: colors.text, borderColor: colors.separator }]}
              value={title}
            />
            <Pressable onPress={() => setDateOpen((open) => !open)} style={[styles.inputRow, { borderColor: colors.separator }]}>
              <Text style={[styles.inputLabel, { color: colors.secondary }]}>DATE</Text>
              <Text style={[styles.dateValue, { color: colors.text }]} numberOfLines={1}>{formatLongDate(date)}</Text>
              <Text style={[styles.dateChevron, { color: colors.blue }]}>{dateOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {dateOpen && (
              <View style={styles.editorCalendar}>
                <MiniCalendar
                  colors={colors}
                  selected={date}
                  today={today}
                  visibleMonth={visibleMonth}
                  onChangeMonth={setVisibleMonth}
                  onSelect={(nextDate) => {
                    setDate(nextDate);
                    setDateOpen(false);
                  }}
                />
              </View>
            )}
            {kind === 'event' && (
              <>
                <Pressable onPress={() => {
                  Keyboard.dismiss();
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setTimeOpen((open) => !open);
                }} style={[styles.inputRow, { borderColor: colors.separator }]}>
                  <Text style={[styles.inputLabel, { color: colors.secondary }]}>TIME</Text>
                  <Text style={[styles.dateValue, { color: time ? colors.text : colors.tertiary }]}>{time || 'Choose a time'}</Text>
                </Pressable>
                {timeOpen && <View style={styles.editorWheel}><InlineTimePicker colors={colors} onChange={setTime} value={time} /></View>}
              </>
            )}
            <LabeledInput colors={colors} label="NOTES" multiline onChangeText={setNotes} placeholder="Optional details" value={notes} />
            {kind === 'event' && (
              <LocationInput
                colors={colors}
                labeled
                onPlaceChange={(place) => {
                  setLocationPlace(place);
                  setLocation(place.address);
                }}
                onTextChange={(text) => {
                  setLocation(text);
                  setLocationPlace(undefined);
                }}
                value={location}
              />
            )}
          </View>

          {item && (
            <Pressable onPress={confirmDelete} style={[styles.deleteButton, { backgroundColor: colors.card }]}>
              <Text style={[styles.deleteText, { color: colors.red }]}>Delete {item.kind}</Text>
            </Pressable>
          )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LocationInput({ value, colors, labeled, onFocus, onTextChange, onPlaceChange }: {
  value: string;
  colors: AppColors;
  labeled?: boolean;
  onFocus?: () => void;
  onTextChange: (value: string) => void;
  onPlaceChange: (place: LocationPlace) => void;
}) {
  const [suggestions, setSuggestions] = useState<MapSuggestion[]>([]);
  const [resolving, setResolving] = useState(false);
  const [selectionCommitted, setSelectionCommitted] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (!CalendreamMapKit || query.length < 2 || resolving || selectionCommitted) return;
    let current = true;
    const timer = setTimeout(() => {
      void CalendreamMapKit.suggestAsync(query)
        .then((results) => { if (current) setSuggestions(results); })
        .catch(() => { if (current) setSuggestions([]); });
    }, 220);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [resolving, selectionCommitted, value]);

  async function selectSuggestion(suggestion: MapSuggestion) {
    if (!CalendreamMapKit) return;
    setResolving(true);
    setSuggestions([]);
    try {
      const query = [suggestion.title, suggestion.subtitle].filter(Boolean).join(', ');
      const place = await CalendreamMapKit.resolveAsync(query);
      setSelectionCommitted(true);
      onPlaceChange(place);
    } catch {
      Alert.alert('Location unavailable', 'Calendream could not resolve that place. Try another result.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <View>
      <View style={[labeled ? styles.inputRow : styles.locationInputRow, { borderColor: colors.separator }]}>
        {labeled && <Text style={[styles.inputLabel, { color: colors.secondary }]}>PLACE</Text>}
        <TextInput
          autoCorrect={false}
          onChangeText={(text) => {
            setSelectionCommitted(false);
            onTextChange(text);
            setSuggestions([]);
          }}
          onFocus={onFocus}
          placeholder={resolving ? 'Finding place…' : 'Location (optional)'}
          placeholderTextColor={colors.tertiary}
          style={[labeled ? styles.fieldInput : styles.locationInput, { color: colors.text }]}
          value={value}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={[styles.locationSuggestions, { backgroundColor: colors.background, borderColor: colors.separator }]}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={`${suggestion.title}-${suggestion.subtitle}-${index}`}
              onPress={() => void selectSuggestion(suggestion)}
              style={[styles.locationSuggestion, index > 0 && { borderColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={[styles.locationSuggestionTitle, { color: colors.text }]} numberOfLines={1}>{suggestion.title}</Text>
              {!!suggestion.subtitle && <Text style={[styles.locationSuggestionSubtitle, { color: colors.secondary }]} numberOfLines={1}>{suggestion.subtitle}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
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

function MorningBriefing({ visible, tasks, today, colors, onMoveTask, onDismissTask, onSkip }: {
  visible: boolean;
  tasks: PlanningItem[];
  today: string;
  colors: AppColors;
  onMoveTask: (id: string, date: string) => Promise<void>;
  onDismissTask: (id: string) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const task = tasks[0];
  const [choosingDate, setChoosingDate] = useState(false);
  const [targetDate, setTargetDate] = useState(addLocalDays(today, 1));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = dateFromISO(today);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  function moveTask(id: string, date: string) {
    setChoosingDate(false);
    setTargetDate(addLocalDays(today, 1));
    void onMoveTask(id, date);
  }

  function dismissTask(task: PlanningItem) {
    Alert.alert('Dismiss task?', `“${task.title}” will be removed entirely.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Dismiss', style: 'destructive', onPress: () => {
        setChoosingDate(false);
        void onDismissTask(task.id);
      } },
    ]);
  }

  return (
    <Modal animationType="slide" onRequestClose={() => void onSkip()} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={[styles.briefing, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.briefingHeader}>
          <View style={styles.briefingTitleRow}>
            <View>
              <Text style={[styles.briefingEyebrow, { color: colors.red }]}>GOOD MORNING</Text>
              <Text style={[styles.briefingTitle, { color: colors.text }]}>Let’s reset your day.</Text>
            </View>
            <Pressable accessibilityLabel="Skip unfinished task review for today" onPress={() => void onSkip()} hitSlop={12} style={[styles.reviewClose, { backgroundColor: colors.card }]}>
              <Text style={[styles.reviewCloseText, { color: colors.secondary }]}>×</Text>
            </Pressable>
          </View>
          <Text style={[styles.briefingBody, { color: colors.secondary }]}>A quick check-in before you begin. Give each unfinished task a home.</Text>
        </View>

        {task && (
          <ScrollView contentContainerStyle={styles.briefingContent} showsVerticalScrollIndicator={false}>
            <View style={styles.reviewProgress}>
              <Text style={[styles.reviewCount, { color: colors.secondary }]}>{countLabel(tasks.length, 'task')} to sort</Text>
              <View style={[styles.progressTrack, { backgroundColor: colors.separator }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.red }]} />
              </View>
            </View>

            <View style={[styles.rolloverCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.rolloverDate, { color: colors.secondary }]}>LEFT FROM {formatShortDate(task.anchorStart).toUpperCase()}</Text>
              <Text style={[styles.rolloverTitle, { color: colors.text }]}>{task.title}</Text>
              {task.notes && <Text style={[styles.rolloverNotes, { color: colors.secondary }]}>{task.notes}</Text>}
            </View>

            {choosingDate ? (
              <MiniCalendar
                colors={colors}
                selected={targetDate}
                today={today}
                visibleMonth={visibleMonth}
                onChangeMonth={setVisibleMonth}
                onSelect={setTargetDate}
              />
            ) : (
              <View style={styles.reviewActions}>
                <Pressable onPress={() => moveTask(task.id, today)} style={[styles.reviewPrimary, { backgroundColor: colors.blue }]}>
                  <Text style={styles.reviewPrimaryText}>Move to Today</Text>
                </Pressable>
                <Pressable onPress={() => setChoosingDate(true)} style={[styles.reviewSecondary, { backgroundColor: colors.card }]}>
                  <Text style={[styles.reviewSecondaryText, { color: colors.blue }]}>Choose another day</Text>
                </Pressable>
                <Pressable onPress={() => dismissTask(task)} style={styles.reviewDismiss}>
                  <Text style={[styles.dismissActionText, { color: colors.red }]}>Dismiss task</Text>
                </Pressable>
              </View>
            )}

            {choosingDate && (
              <View style={styles.calendarFooter}>
                <Pressable onPress={() => setChoosingDate(false)} style={styles.calendarCancel}>
                  <Text style={[styles.reviewSecondaryText, { color: colors.secondary }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => moveTask(task.id, targetDate)} style={[styles.calendarConfirm, { backgroundColor: colors.blue }]}>
                  <Text style={styles.reviewPrimaryText}>Move to {formatDestination(targetDate)}</Text>
                </Pressable>
              </View>
            )}
            <Pressable onPress={() => void onSkip()} style={styles.skipTodayButton}>
              <Text style={[styles.skipTodayText, { color: colors.secondary }]}>Skip for today</Text>
              <Text style={[styles.skipTodaySubtext, { color: colors.tertiary }]}>Leave the remaining tasks in the past</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function MiniCalendar({ colors, selected, today, visibleMonth, onChangeMonth, onSelect }: {
  colors: AppColors;
  selected: string;
  today: string;
  visibleMonth: Date;
  onChangeMonth: (date: Date) => void;
  onSelect: (date: string) => void;
}) {
  const quickDates = Array.from({ length: 5 }, (_, index) => addLocalDays(today, index + 1));
  const firstWeekday = visibleMonth.getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(visibleMonth);
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);

  return (
    <View style={[styles.calendarCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.quickLabel, { color: colors.secondary }]}>QUICK PICK</Text>
      <View style={styles.quickDays}>
        {quickDates.map((isoDate) => {
          const date = dateFromISO(isoDate);
          const active = isoDate === selected;
          return (
            <Pressable key={isoDate} onPress={() => onSelect(isoDate)} style={[styles.quickDay, { backgroundColor: active ? colors.blue : colors.background }]}>
              <Text style={[styles.quickWeekday, { color: active ? '#FFFFFF' : colors.secondary }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)}</Text>
              <Text style={[styles.quickNumber, { color: active ? '#FFFFFF' : colors.text }]}>{date.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.monthHeader}>
        <Text style={[styles.monthTitle, { color: colors.text }]}>{monthTitle}</Text>
        <View style={styles.monthControls}>
          <Pressable hitSlop={8} onPress={() => onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}><Text style={[styles.monthArrow, { color: colors.blue }]}>‹</Text></Pressable>
          <Pressable hitSlop={8} onPress={() => onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}><Text style={[styles.monthArrow, { color: colors.blue }]}>›</Text></Pressable>
        </View>
      </View>
      <View style={styles.calendarGrid}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekdayLabel, { color: colors.tertiary }]}>{label}</Text>)}
        {cells.map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.calendarCell} />;
          const isoDate = localISO(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
          const disabled = isoDate < today;
          const active = isoDate === selected;
          const isToday = isoDate === today;
          return (
            <Pressable key={isoDate} disabled={disabled} onPress={() => onSelect(isoDate)} style={styles.calendarCell}>
              <View style={[styles.calendarDay, isToday && { borderColor: colors.red, borderWidth: 1.5 }, active && { backgroundColor: colors.blue, borderWidth: 0 }]}>
                <Text style={[styles.calendarNumber, { color: disabled ? colors.tertiary : active ? '#FFFFFF' : colors.text }]}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
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
  compactDateHeader: { height: 76, marginHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden' },
  compactDateCopy: { width: '57%', justifyContent: 'center' },
  compactEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.9, marginBottom: 3 },
  compactDateTitle: { fontSize: 19, lineHeight: 22, fontWeight: '700', letterSpacing: -0.45 },
  nearbyRail: { position: 'absolute', right: 0, top: 9, bottom: 8, width: '40%', flexDirection: 'row', alignItems: 'center' },
  browseRail: { position: 'absolute', left: 0, right: 0, top: 9, bottom: 8, flexDirection: 'row', alignItems: 'center' },
  dayRailItem: { flex: 1, alignItems: 'center', gap: 3 },
  dayRailLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.35 },
  dayRailOrb: { width: 34, height: 34, borderRadius: 17, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayRailNumber: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayPage: { flex: 1 },
  wordmark: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
  addSymbol: { color: '#FFFFFF', fontSize: 24, lineHeight: 25, fontWeight: '400' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 104 },
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
  mapsButton: { height: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  mapsButtonText: { fontSize: 12, fontWeight: '700' },
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
  inlineComposer: { borderRadius: 14, paddingHorizontal: 13, paddingBottom: 11, marginTop: 8 },
  inlineTitle: { height: 48, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 17, fontWeight: '600' },
  inlineField: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  locationInputRow: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  locationInput: { minHeight: 42, fontSize: 15 },
  locationSuggestions: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden', marginTop: 6 },
  locationSuggestion: { minHeight: 48, paddingHorizontal: 11, paddingVertical: 7, justifyContent: 'center' },
  locationSuggestionTitle: { fontSize: 14, fontWeight: '600' },
  locationSuggestionSubtitle: { fontSize: 11, marginTop: 2 },
  inlineTimeButton: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  inlineTimeValue: { flex: 1, fontSize: 15, fontWeight: '500' },
  wheelPickerWrap: { height: 168, overflow: 'hidden', justifyContent: 'center' },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 10 },
  inlineAction: { fontSize: 14, fontWeight: '600' },
  inlineSave: { height: 34, borderRadius: 10, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  inlineSaveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  kindPicker: { flexDirection: 'row', marginHorizontal: 18, marginTop: 12, padding: 3, borderRadius: 10 },
  kindOption: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  kindText: { fontSize: 14, fontWeight: '600' },
  formCard: { marginHorizontal: 18, marginTop: 18, borderRadius: 14, overflow: 'hidden' },
  titleInput: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 18, fontWeight: '600' },
  inputRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  notesInputRow: { minHeight: 94, alignItems: 'flex-start', paddingTop: 14 },
  inputLabel: { width: 58, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dateValue: { flex: 1, fontSize: 15, fontWeight: '500' },
  dateChevron: { fontSize: 18, marginLeft: 6 },
  editorCalendar: { paddingHorizontal: 10, paddingBottom: 10 },
  editorWheel: { paddingHorizontal: 10 },
  fieldInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  notesField: { minHeight: 72, textAlignVertical: 'top', paddingTop: 0 },
  deleteButton: { height: 50, marginHorizontal: 18, marginTop: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 16, fontWeight: '600' },
  briefing: { flex: 1 },
  briefingHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  briefingTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  briefingEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  briefingTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -0.9, marginTop: 4 },
  briefingBody: { fontSize: 16, lineHeight: 22, marginTop: 9, maxWidth: 360 },
  reviewClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reviewCloseText: { fontSize: 25, lineHeight: 27, fontWeight: '400' },
  briefingContent: { paddingHorizontal: 18, paddingBottom: 30 },
  reviewProgress: { marginBottom: 12 },
  reviewCount: { fontSize: 13, fontWeight: '600', marginBottom: 7 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { width: '28%', height: 3, borderRadius: 2 },
  rolloverCard: { borderRadius: 18, padding: 17 },
  rolloverDate: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  rolloverTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3, marginTop: 4 },
  rolloverNotes: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  reviewActions: { gap: 9, marginTop: 14 },
  reviewPrimary: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reviewPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  reviewSecondary: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reviewSecondaryText: { fontSize: 15, fontWeight: '600' },
  reviewDismiss: { height: 40, alignItems: 'center', justifyContent: 'center' },
  dismissActionText: { fontSize: 13, fontWeight: '600' },
  calendarCard: { borderRadius: 18, padding: 14, marginTop: 12 },
  quickLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 8 },
  quickDays: { flexDirection: 'row', gap: 7 },
  quickDay: { flex: 1, height: 54, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  quickWeekday: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  quickNumber: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  monthHeader: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  monthTitle: { fontSize: 16, fontWeight: '700' },
  monthControls: { flexDirection: 'row', gap: 22, paddingRight: 5 },
  monthArrow: { fontSize: 28, lineHeight: 30, fontWeight: '400' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayLabel: { width: '14.285%', textAlign: 'center', fontSize: 10, fontWeight: '700', height: 25 },
  calendarCell: { width: '14.285%', height: 36, alignItems: 'center', justifyContent: 'center' },
  calendarDay: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  calendarNumber: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  calendarFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  calendarCancel: { height: 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  calendarConfirm: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  skipTodayButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 4 },
  skipTodayText: { fontSize: 14, fontWeight: '600' },
  skipTodaySubtext: { fontSize: 11, marginTop: 3 },
});
