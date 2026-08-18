import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { Goal, ItemDraft, PlanningItem, TimelineSnapshot, TimelineZoom } from '@/models/planning';
import { addLocalDays, dateFromISO, formatShortDate, localISO } from '@/shared/date';
import { eventPhase, timeMinutes } from '@/shared/time';
import type { AppColors } from '@/theme/colors';
import { buildTimelinePeriods, dateAtPeriodProgress, isGoalRelevantAtZoom, isGoalVisibleInPeriod, isVisibleAtZoom, monthWeekLabel, progressThroughPeriod, type TimelinePeriod } from './periods';

interface TimelineScreenProps {
  colors: AppColors;
  dataRevision: number;
  today: string;
  loadRange: (startDate: string, endDate: string) => Promise<TimelineSnapshot>;
  onSaveItem: (draft: ItemDraft) => Promise<void>;
  onOpenGoal: (goal: Goal) => void;
  onToggleTask: (item: PlanningItem) => Promise<void>;
  onOpenDay: (date: string) => void;
  renderInlineEditor: (options: TimelineInlineEditorOptions) => ReactNode;
}

export interface TimelineInlineEditorOptions {
  item: PlanningItem;
  date: string;
  onCancel: () => void;
  onDraftChange: (draft: ItemDraft) => void;
  onReveal: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
}

const ZOOM_LEVELS: { id: TimelineZoom; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
];
const TIMELINE_TOP_INSET = 8;

interface PeriodPosition {
  start: string;
  end: string;
  y: number;
  height: number;
}

function dateAtPosition(position: PeriodPosition, viewportY: number) {
  const progress = position.height > 0 ? Math.max(0, Math.min(1, (viewportY - position.y) / position.height)) : 0;
  return dateAtPeriodProgress(position.start, position.end, progress);
}

function yForDate(position: PeriodPosition, date: string) {
  if (position.height <= 0) return position.y;
  return position.y + progressThroughPeriod(position.start, position.end, date) * position.height;
}

export function TimelineScreen({ colors, dataRevision, today, loadRange, onSaveItem, onOpenGoal, onToggleTask, onOpenDay, renderInlineEditor }: TimelineScreenProps) {
  const [zoom, setZoom] = useState<TimelineZoom>('today');
  const [snapshot, setSnapshot] = useState<TimelineSnapshot>({ items: [], goals: [], reflections: {} });
  const [loading, setLoading] = useState(true);
  const [, setClockRevision] = useState(0);
  const [pinchScale] = useState(() => new Animated.Value(1));
  const [editingItem, setEditingItem] = useState<PlanningItem | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<ItemDraft | null>(null);
  const scroll = useRef<ScrollView>(null);
  const editorView = useRef<View>(null);
  const scrollOffset = useRef(0);
  const currentPeriod = useRef<PeriodPosition | null>(null);
  const focusDate = useRef(today);
  const alignPeriodFromStart = useRef(false);
  const periodPositions = useRef(new Map<string, PeriodPosition>());
  const keyboardTop = useRef(Dimensions.get('window').height);
  const alignedZoom = useRef<TimelineZoom | null>(null);
  const periods = useMemo(() => buildTimelinePeriods(zoom, today), [today, zoom]);
  const firstDate = periods[0].start;
  const lastDate = periods[periods.length - 1].end;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadRange(firstDate, lastDate).then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dataRevision, firstDate, lastDate, loadRange]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => { keyboardTop.current = event.endCoordinates.screenY; });
    const hide = Keyboard.addListener(hideEvent, () => { keyboardTop.current = Dimensions.get('window').height; });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClockRevision((revision) => revision + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const closeInlineEditor = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingItem(null);
    setEditingSlot(null);
    setInlineDraft(null);
    Keyboard.dismiss();
  }, []);

  const editInline = useCallback(async (item: PlanningItem, slot: string) => {
    if (editingItem && inlineDraft?.title.trim()) await onSaveItem(inlineDraft);
    if (editingItem?.id === item.id && editingSlot === slot) {
      closeInlineEditor();
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInlineDraft({ id: item.id, kind: item.kind, title: item.title, date: item.anchorStart ?? today, endDate: item.anchorEnd ?? undefined, precision: item.precision, altitude: item.altitude, eventType: item.eventType, time: item.startTime, endTime: item.endTime, notes: item.notes, location: item.location, locationPlace: item.locationPlace });
    setEditingItem(item);
    setEditingSlot(slot);
  }, [closeInlineEditor, editingItem, editingSlot, inlineDraft, onSaveItem, today]);

  const saveInline = useCallback(async (draft: ItemDraft) => {
    await onSaveItem(draft);
    closeInlineEditor();
  }, [closeInlineEditor, onSaveItem]);

  const revealInline = useCallback(() => {
    setTimeout(() => editorView.current?.measureInWindow((_x, y, _width, height) => {
      const overlap = y + height + 12 - keyboardTop.current;
      if (overlap > 0) scroll.current?.scrollTo({ y: scrollOffset.current + overlap, animated: true });
    }), Platform.OS === 'ios' ? 90 : 140);
  }, []);

  // The callbacks read layout refs only after focus/keyboard events.
  // eslint-disable-next-line react-hooks/refs
  const inlineEditor = editingItem ? <View ref={editorView}>{renderInlineEditor({ item: editingItem, date: editingItem.anchorStart ?? today, onCancel: closeInlineEditor, onDraftChange: setInlineDraft, onReveal: revealInline, onSave: saveInline })}</View> : null;

  const changeZoom = useCallback((nextZoom: TimelineZoom, requestedDate?: string, alignment: 'date' | 'period' = 'date') => {
    if (nextZoom === zoom) return;
    const viewportY = scrollOffset.current + Math.min(250, Dimensions.get('window').height * 0.32);
    const positions = [...periodPositions.current.values()].sort((a, b) => a.y - b.y);
    const visiblePeriod = positions.find((position) => viewportY >= position.y && viewportY <= position.y + position.height)
      ?? positions.reduce<PeriodPosition | undefined>((nearest, position) => {
        if (!nearest) return position;
        const distance = Math.abs(position.y + position.height / 2 - viewportY);
        const nearestDistance = Math.abs(nearest.y + nearest.height / 2 - viewportY);
        return distance < nearestDistance ? position : nearest;
      }, undefined);
    const visibleAnchor = visiblePeriod ? dateAtPosition(visiblePeriod, viewportY) : undefined;
    focusDate.current = requestedDate ?? visibleAnchor ?? focusDate.current;
    alignPeriodFromStart.current = alignment === 'period';
    periodPositions.current.clear();
    alignedZoom.current = null;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoom(nextZoom);
  }, [zoom]);

  const alignPeriod = useCallback((period: TimelinePeriod, y: number, height: number) => {
    const position = { start: period.start, end: period.end, y, height };
    periodPositions.current.set(period.id, position);
    if (period.current) currentPeriod.current = position;
  }, []);

  const alignToFocus = useCallback(() => {
    if (loading || alignedZoom.current === zoom) return true;
    const position = [...periodPositions.current.values()].find((candidate) => focusDate.current >= candidate.start && focusDate.current <= candidate.end);
    if (!position) return false;
    alignedZoom.current = zoom;
    const targetY = alignPeriodFromStart.current ? position.y : yForDate(position, focusDate.current);
    alignPeriodFromStart.current = false;
    scroll.current?.scrollTo({ y: Math.max(0, targetY - TIMELINE_TOP_INSET), animated: false });
    return true;
  }, [loading, zoom]);

  useEffect(() => {
    if (loading) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryAlignment = () => {
      attempts += 1;
      if (alignToFocus() || attempts >= 12) return;
      timer = setTimeout(tryAlignment, 40);
    };
    timer = setTimeout(tryAlignment, 0);
    return () => { if (timer) clearTimeout(timer); };
  }, [alignToFocus, loading, snapshot]);

  const goHome = useCallback(() => {
    focusDate.current = today;
    alignPeriodFromStart.current = false;
    if (currentPeriod.current) scroll.current?.scrollTo({ y: Math.max(0, currentPeriod.current.y - TIMELINE_TOP_INSET), animated: true });
  }, [today]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((event) => pinchScale.setValue(Math.max(0.82, Math.min(1.18, event.scale))))
    // Animated.Value is only mutated after gesture events, not while rendering.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((event) => {
      const index = ZOOM_LEVELS.findIndex((level) => level.id === zoom);
      if (event.scale < 0.88 && index < ZOOM_LEVELS.length - 1) changeZoom(ZOOM_LEVELS[index + 1].id);
      if (event.scale > 1.12 && index > 0) changeZoom(ZOOM_LEVELS[index - 1].id);
      Animated.timing(pinchScale, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    })
    .onFinalize(() => Animated.timing(pinchScale, { toValue: 1, duration: 220, useNativeDriver: true }).start());
  // The native gesture represents the vertical ScrollView. Composing it with
  // pinch keeps one-finger scrolling and two-finger zoom active at the same time.
  const timelineGesture = Gesture.Simultaneous(Gesture.Native(), pinch);

  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = colors.background === '#000000' ? 'rgba(58,58,62,0.82)' : 'rgba(118,118,128,0.34)';
  const fallbackLens = colors.background === '#000000' ? 'rgba(10,132,255,0.82)' : 'rgba(0,122,255,0.78)';

  return (
    <View style={styles.screen}>
      <GestureDetector gesture={timelineGesture}>
        <Animated.View style={[styles.timeline, { transform: [{ scale: pinchScale }] }]}>
          <ScrollView directionalLockEnabled onContentSizeChange={() => setTimeout(alignToFocus, 0)} onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} ref={scroll} contentContainerStyle={styles.content} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
            {periods.map((period) => (
              <Period
                colors={colors}
                goals={snapshot.goals}
                items={snapshot.items}
                key={period.id}
                loading={loading}
                onPeriodLayout={alignPeriod}
                editingItem={editingItem}
                editingSlot={editingSlot}
                inlineEditor={inlineEditor}
                onEditItem={(item, slot) => void editInline(item, slot)}
                onOpenDay={onOpenDay}
                onOpenGoal={onOpenGoal}
                onToggleTask={(item) => void onToggleTask(item)}
                onZoomToDate={(date, nextZoom) => changeZoom(nextZoom, date)}
                period={period}
                reflection={snapshot.reflections[period.start]}
                today={today}
                zoom={zoom}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </GestureDetector>

      <View style={styles.dockGroup}>
        <View style={styles.homeShell}>
          <Pressable accessibilityLabel={`Return to the current ${zoom}`} onPress={goHome} style={[styles.homeButton, !glassAvailable && { backgroundColor: fallbackGlass }]}>
            {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.homeGlass} tintColor={colors.background === '#000000' ? 'rgba(70,70,74,0.5)' : 'rgba(118,118,128,0.25)'} />}
            <SymbolView name="house.fill" size={18} tintColor={colors.text} weight="semibold" />
          </Pressable>
        </View>
        <View style={styles.dock}>
          <View style={[styles.dockSurface, !glassAvailable && { backgroundColor: fallbackGlass }]}>
            {glassAvailable && <GlassView glassEffectStyle="regular" style={styles.dockGlass} tintColor={colors.background === '#000000' ? 'rgba(70,70,74,0.5)' : 'rgba(118,118,128,0.25)'} />}
            <View style={styles.dockContent}>
              {ZOOM_LEVELS.map((level) => {
                const active = level.id === zoom;
                return (
                  <Pressable
                    accessibilityLabel={`${level.label} timeline view`}
                    key={level.id}
                    onPress={() => level.id === zoom ? goHome() : changeZoom(level.id, today, 'period')}
                    style={styles.dockButton}
                  >
                    {active && (glassAvailable
                      ? <GlassView glassEffectStyle="regular" isInteractive style={styles.activeLens} tintColor={colors.blue} />
                      : <View style={[styles.activeLens, { backgroundColor: fallbackLens }]} />)}
                    <Text numberOfLines={1} style={[styles.dockLabel, { color: active ? '#FFFFFF' : colors.text }]}>{level.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function Period({ period, zoom, items, goals, loading, reflection, today, colors, editingItem, editingSlot, inlineEditor, onPeriodLayout, onEditItem, onOpenDay, onOpenGoal, onToggleTask, onZoomToDate }: {
  period: TimelinePeriod;
  zoom: TimelineZoom;
  items: PlanningItem[];
  goals: Goal[];
  loading: boolean;
  reflection?: string;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onPeriodLayout: (period: TimelinePeriod, y: number, height: number) => void;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
  onOpenGoal: (goal: Goal) => void;
  onToggleTask: (item: PlanningItem) => void;
  onZoomToDate: (date: string, zoom: TimelineZoom) => void;
}) {
  const visibleItems = items.filter((item) => overlaps(item, period) && isVisibleAtZoom(item, zoom));
  const currentGoals = period.current
    ? goals.filter((goal) => !goal.completed && isGoalVisibleInPeriod(goal, period) && isGoalRelevantAtZoom(goal, zoom))
    : [];
  const presentStyle = period.current ? { borderTopWidth: 0 } : { borderTopColor: colors.separator };
  const shared = { colors, editingItem, editingSlot, inlineEditor, onEditItem };

  return (
    <View
      onLayout={(event) => onPeriodLayout(period, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
      style={[styles.period, presentStyle]}
    >
      {zoom === 'today' ? (
        <DayPage {...shared} date={period.start} goals={currentGoals} items={visibleItems} onOpenDay={onOpenDay} onOpenGoal={onOpenGoal} onToggleTask={onToggleTask} period={period} reflection={reflection} today={today} />
      ) : zoom === 'week' ? (
        <WeekPage {...shared} goals={currentGoals} items={visibleItems} onOpenDay={onOpenDay} onOpenGoal={onOpenGoal} onToggleTask={onToggleTask} period={period} today={today} />
      ) : zoom === 'month' ? (
        <MonthPage {...shared} goals={currentGoals} items={visibleItems} loading={loading} onOpenDay={onOpenDay} onOpenGoal={onOpenGoal} onZoomToDate={onZoomToDate} period={period} today={today} />
      ) : zoom === 'quarter' ? (
        <QuarterPage {...shared} goals={currentGoals} items={visibleItems} loading={loading} onOpenDay={onOpenDay} onOpenGoal={onOpenGoal} onZoomToDate={onZoomToDate} period={period} today={today} />
      ) : (
        <YearPage {...shared} goals={currentGoals} items={visibleItems} loading={loading} onOpenDay={onOpenDay} onOpenGoal={onOpenGoal} onZoomToDate={onZoomToDate} period={period} today={today} />
      )}
    </View>
  );
}

function DayPage({ date, period, items, goals, reflection, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenDay, onOpenGoal, onToggleTask }: {
  date: string;
  period: TimelinePeriod;
  items: PlanningItem[];
  goals: Goal[];
  reflection?: string;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
  onOpenGoal: (goal: Goal) => void;
  onToggleTask: (item: PlanningItem) => void;
}) {
  const events = items.filter((item) => item.kind === 'event');
  const tasks = items.filter((item) => item.kind === 'task');
  const eventBoundaryId = period.current ? events.find((item) => !isPastAtMoment(item, today))?.id : undefined;
  const dayAccent = date < today ? colors.tertiary : date === today ? colors.red : colors.blue;
  return (
    <>
      {period.current ? (
        <CurrentMarker colors={colors} label={period.eyebrow ?? 'Today'} />
      ) : <Text style={[styles.dayEyebrow, { color: dayAccent }]}>{period.eyebrow}</Text>}
      <Pressable onPress={() => onOpenDay(date)}>
        <Text style={[styles.dayTitle, { color: colors.text }]}>{period.title}</Text>
        {period.subtitle && <Text style={[styles.daySubtitle, { color: colors.secondary }]}>{period.subtitle}</Text>}
      </Pressable>

      <GoalSection colors={colors} goals={goals} onOpen={onOpenGoal} />

      <TimelineSectionHeader colors={colors} onPress={() => onOpenDay(date)} title="Events" />
      {events.length ? events.map((item) => { const slot = `day-${date}-${item.id}`; return <View key={item.id}>{item.id === eventBoundaryId && <CurrentMomentDivider colors={colors} />}<TimelineItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} onToggleTask={() => onToggleTask(item)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; }) : <>{period.current && <CurrentMomentDivider colors={colors} />}<Text style={[styles.openRow, { color: colors.tertiary }]}>No events planned</Text></>}
      {period.current && events.length > 0 && !eventBoundaryId && <CurrentMomentDivider colors={colors} />}
      <TimelineSectionHeader colors={colors} onPress={() => onOpenDay(date)} title="Tasks" />
      {tasks.length ? tasks.map((item) => { const slot = `day-${date}-${item.id}`; return <View key={item.id}><TimelineItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} onToggleTask={() => onToggleTask(item)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; }) : <Text style={[styles.openRow, { color: colors.tertiary }]}>No tasks yet</Text>}

      {(reflection || date <= today) && (
        <View style={styles.reflection}>
          <Text style={[styles.reflectionTitle, { color: colors.text }]}>Daily Reflection</Text>
          <Pressable onPress={() => onOpenDay(date)} style={[styles.reflectionBox, { borderColor: colors.separator }]}>
            <Text numberOfLines={3} style={[styles.reflectionText, { color: reflection ? colors.text : colors.tertiary }]}>{reflection || 'Write something…'}</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

function WeekPage({ period, items, goals, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenDay, onOpenGoal, onToggleTask }: {
  period: TimelinePeriod;
  items: PlanningItem[];
  goals: Goal[];
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
  onOpenGoal: (goal: Goal) => void;
  onToggleTask: (item: PlanningItem) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(period.start, index))
    .map((date) => ({
      date,
      items: items
        .filter((item) => item.anchorStart !== null && item.anchorStart <= date && (item.anchorEnd ?? item.anchorStart) >= date)
        .sort((a, b) => a.kind.localeCompare(b.kind) || timeMinutes(a.startTime) - timeMinutes(b.startTime) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
    .filter((day) => day.items.length > 0);
  const weekBoundary = period.current
    ? days.flatMap((day) => day.items.map((item) => ({ date: day.date, item }))).find(({ item }) => !isPastAtMoment(item, today))
    : undefined;
  return (
    <>
      {period.current && <CurrentMarker colors={colors} label="This week" />}
      <View style={styles.weekTitleRow}>
        <Text style={[styles.weekTitle, { color: colors.text }]}>{monthWeekLabel(period.start)}</Text>
        <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.title}</Text>
      </View>
      <GoalSection colors={colors} goals={goals} onOpen={onOpenGoal} />
      {!days.length && <Text style={[styles.emptyWeek, { color: colors.tertiary }]}>No events or tasks yet, let’s get planning :)</Text>}
      {days.map(({ date, items: dayItems }) => {
        const boundaryAtStart = weekBoundary?.date === date && weekBoundary.item.id === dayItems[0]?.id;
        return (
          <View key={date} style={[styles.weekDay, { borderColor: colors.separator }, boundaryAtStart && styles.weekDayAtMoment]}>
            <Pressable accessibilityLabel={`Open ${date}`} onPress={() => onOpenDay(date)} style={styles.weekDateButton}>
              <TimelineDateGutter colors={colors} date={date} today={today} />
            </Pressable>
            <View style={styles.weekDayItems}>
              {dayItems.map((item) => { const slot = `week-${date}-${item.id}`; const boundary = weekBoundary?.date === date && weekBoundary.item.id === item.id; return <View key={`${date}-${item.id}`}>{boundary && <CurrentMomentDivider colors={colors} week />}<CompactItem colors={colors} hideTopBorder={boundary} item={item} onPress={() => onEditItem(item, slot)} onToggleTask={() => onToggleTask(item)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; })}
            </View>
          </View>
        );
      })}
      {period.current && days.length > 0 && !weekBoundary && <CurrentMomentDivider colors={colors} />}
    </>
  );
}

interface EditorialPeriodProps {
  period: TimelinePeriod;
  items: PlanningItem[];
  goals: Goal[];
  loading: boolean;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
  onOpenGoal: (goal: Goal) => void;
  onZoomToDate: (date: string, zoom: TimelineZoom) => void;
}

function MonthPage({ period, items, goals, loading, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenGoal, onZoomToDate }: EditorialPeriodProps) {
  const events = items.filter((item) => item.kind === 'event' && overlaps(item, period)).sort(compareAnchors);
  const trips = events.filter(isTrip).length;
  const nestedEventIds = new Set(events.filter((event) => !isTrip(event) && events.some((trip) => isTrip(trip) && trip.anchorStart !== null && trip.anchorEnd !== null && event.anchorStart !== null && event.anchorStart >= trip.anchorStart && event.anchorStart <= trip.anchorEnd)).map((event) => event.id));
  const topLevelEvents = events.filter((event) => !nestedEventIds.has(event.id));
  const monthBoundaryId = period.current ? topLevelEvents.find((event) => !isPastAtMoment(event, today))?.id : undefined;
  return (
    <>
      {period.eyebrow && <CurrentMarker colors={colors} label={period.eyebrow} />}
      <View style={styles.editorialHeader}>
        <Pressable onPress={() => onZoomToDate(period.start, 'week')}>
          <View style={styles.periodTitleRow}>
            <Text style={[styles.periodTitle, { color: colors.text }]}>{period.title}</Text>
            {period.subtitle && <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.subtitle}</Text>}
          </View>
        </Pressable>
        <Text style={[styles.periodSummary, { color: colors.secondary }]}>{summaryLabel(events.length - trips, 'event')} · {summaryLabel(trips, 'trip')} · {summaryLabel(goals.length, 'goal')}</Text>
      </View>

      <GoalSection colors={colors} goals={goals} onOpen={onOpenGoal} />

      {!loading && !events.length && !goals.length ? <Text style={[styles.editorialEmpty, { color: colors.tertiary }]}>An open month. Let’s make something happen.</Text> : (
        <View style={styles.monthSpine}>
          {topLevelEvents.map((event) => {
            const slot = `${period.id}-event-${event.id}`;
            if (isTrip(event)) {
              const tripEvents = events.filter((candidate) => !isTrip(candidate) && candidate.anchorStart !== null && event.anchorStart !== null && event.anchorEnd !== null && candidate.anchorStart >= event.anchorStart && candidate.anchorStart <= event.anchorEnd);
              return <View key={event.id}>{event.id === monthBoundaryId && <CurrentMomentDivider colors={colors} />}<MonthTripGroup colors={colors} editingItem={editingItem} editingSlot={editingSlot} event={event} events={tripEvents} inlineEditor={inlineEditor} onEditItem={onEditItem} period={period} today={today} /></View>;
            }
            return <View key={event.id}>{event.id === monthBoundaryId && <CurrentMomentDivider colors={colors} />}<EditorialEventRow colors={colors} event={event} onPress={() => onEditItem(event, slot)} period={period} today={today} />{editingItem?.id === event.id && editingSlot === slot && <View style={styles.spineEditor}>{inlineEditor}</View>}</View>;
          })}
          {period.current && topLevelEvents.length > 0 && !monthBoundaryId && <CurrentMomentDivider colors={colors} />}
        </View>
      )}
    </>
  );
}

function QuarterPage({ period, items, goals, loading, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenGoal, onZoomToDate }: EditorialPeriodProps) {
  const events = items.filter((item) => item.kind === 'event').sort(compareAnchors);
  const quarterBoundaryId = period.current ? events.find((event) => !isPastAtMoment(event, today))?.id : undefined;
  const months = Array.from({ length: 3 }, (_, index) => {
    const startDate = dateFromISO(period.start);
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
    const start = localISO(date);
    const end = localISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    return { start, end, title: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date), events: events.filter((item) => item.anchorStart !== null && item.anchorStart >= start && item.anchorStart <= end) };
  });
  return (
    <>
      {period.eyebrow && <CurrentMarker colors={colors} label={period.eyebrow} />}
      <View style={styles.editorialHeader}>
        <Text style={[styles.periodTitle, { color: colors.text }]}>{period.title} <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.subtitle}</Text></Text>
        <Text style={[styles.periodSummary, { color: colors.secondary }]}>{summaryLabel(events.length, 'major event')} · {summaryLabel(goals.length, 'goal')}</Text>
      </View>
      <GoalSection colors={colors} goals={goals} onOpen={onOpenGoal} />
      {!loading && !events.length && !goals.length && <Text style={[styles.editorialEmpty, { color: colors.tertiary }]}>A clear quarter. Plenty of room to plan.</Text>}
      <View style={styles.quarterMonths}>
        {months.map((month) => (
          <View key={month.start} style={[styles.quarterMonth, { borderColor: colors.separator }]}>
            <Pressable onPress={() => onZoomToDate(month.start, 'month')}><Text style={[styles.quarterMonthTitle, { color: month.start <= today && month.end >= today ? colors.red : colors.text }]}>{month.title}</Text></Pressable>
            {!month.events.length ? <Text style={[styles.quarterOpen, { color: colors.tertiary }]}>Open</Text> : month.events.map((event) => {
              const slot = `${period.id}-${month.start}-${event.id}`;
              return <View key={event.id}>{event.id === quarterBoundaryId && <CurrentMomentDivider colors={colors} />}<EditorialCompactEvent colors={colors} event={event} onPress={() => onEditItem(event, slot)} />{editingItem?.id === event.id && editingSlot === slot && inlineEditor}</View>;
            })}
          </View>
        ))}
        {period.current && events.length > 0 && !quarterBoundaryId && <CurrentMomentDivider colors={colors} />}
      </View>
    </>
  );
}

function YearPage({ period, items, goals, loading, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenGoal, onZoomToDate }: EditorialPeriodProps) {
  const events = items.filter((item) => item.kind === 'event').sort(compareAnchors);
  const year = Number(period.title);
  const months = Array.from({ length: 12 }, (_, month) => {
    const start = localISO(new Date(year, month, 1));
    const end = localISO(new Date(year, month + 1, 0));
    return { start, end, title: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month, 1)), events: events.filter((item) => item.anchorStart !== null && item.anchorStart >= start && item.anchorStart <= end) };
  });
  const visibleYearEvents = months.flatMap((month) => month.events.slice(0, 3));
  const yearBoundaryId = period.current ? visibleYearEvents.find((event) => !isPastAtMoment(event, today))?.id : undefined;
  return (
    <>
      {period.eyebrow && <CurrentMarker colors={colors} label={period.eyebrow} />}
      <View style={styles.editorialHeader}>
        <Text style={[styles.yearTitle, { color: colors.text }]}>{period.title}</Text>
        <Text style={[styles.periodSummary, { color: colors.secondary }]}>{summaryLabel(events.length, 'moment')} · {summaryLabel(goals.length, 'goal')}</Text>
      </View>
      <GoalSection colors={colors} goals={goals} onOpen={onOpenGoal} />
      {!loading && !events.length && !goals.length && <Text style={[styles.editorialEmpty, { color: colors.tertiary }]}>An unwritten year.</Text>}
      <View style={styles.yearIndex}>
        {months.map((month) => {
          const currentMonth = month.start <= today && month.end >= today;
          const pastMonth = month.end < today;
          return (
            <View key={month.start} style={styles.yearMonthSection}>
              <Pressable onPress={() => onZoomToDate(month.start, 'month')} style={styles.yearMonthSeparator}>
                <Text style={[styles.yearMonthLabel, { color: currentMonth ? colors.red : pastMonth ? colors.tertiary : colors.secondary }]}>{month.title.toUpperCase()}</Text>
                <View style={[styles.yearMonthLine, { backgroundColor: colors.separator }]} />
                <Text style={[styles.yearMonthCount, { color: colors.tertiary }]}>{month.events.length || ''}</Text>
              </Pressable>
              {!month.events.length ? (
                <Text style={[styles.yearMonthOpen, { color: colors.tertiary }]}>Open</Text>
              ) : month.events.slice(0, 3).map((event) => {
                const slot = `${period.id}-${month.start}-${event.id}`;
                return (
                  <View key={event.id}>
                    {event.id === yearBoundaryId && <CurrentMomentDivider colors={colors} />}
                    <Pressable onPress={() => onEditItem(event, slot)} style={styles.yearMoment}>
                      <View style={[isTrip(event) ? styles.yearTripMark : styles.yearEventDot, { backgroundColor: isTrip(event) ? (eventPhase(event) === 'past' ? colors.tertiary : colors.orange) : eventAccent(event, colors) }]} />
                      <Text numberOfLines={1} style={[styles.yearEventText, { color: eventPhase(event) === 'past' || pastMonth ? colors.secondary : colors.text }]}>{event.title}</Text>
                      <Text style={[styles.yearMomentDate, { color: eventPhase(event) === 'past' ? colors.tertiary : isTrip(event) ? colors.orange : colors.secondary }]}>{isTrip(event) ? eventRange(event) : formatShortDate(event.anchorStart)}</Text>
                    </Pressable>
                    {editingItem?.id === event.id && editingSlot === slot && <View style={styles.yearInlineEditor}>{inlineEditor}</View>}
                  </View>
                );
              })}
              {month.events.length > 3 && <Text style={[styles.yearMore, { color: colors.secondary }]}>+{month.events.length - 3} more</Text>}
            </View>
          );
        })}
        {period.current && visibleYearEvents.length > 0 && !yearBoundaryId && <CurrentMomentDivider colors={colors} />}
      </View>
    </>
  );
}

function TimelineSectionHeader({ title, colors, onPress }: { title: string; colors: AppColors; onPress: () => void }) {
  return <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Pressable hitSlop={8} onPress={onPress}><Text style={[styles.sectionAction, { color: colors.blue }]}>Add {title.slice(0, -1).toLowerCase()}</Text></Pressable></View>;
}

function CurrentMarker({ colors, label }: { colors: AppColors; label: string }) {
  return <View style={styles.currentMarker}><Text style={[styles.dayEyebrow, { color: colors.red }]}>{label}</Text></View>;
}

function CurrentMomentDivider({ colors, week = false }: { colors: AppColors; week?: boolean }) {
  return <View accessibilityLabel="Current moment" style={[styles.currentMomentDivider, week && styles.currentMomentDividerWeek, { backgroundColor: colors.red }]} />;
}

function GoalSection({ goals, colors, onOpen }: { goals: Goal[]; colors: AppColors; onOpen: (goal: Goal) => void }) {
  if (!goals.length) return null;
  return <View style={styles.goalSection}>{goals.map((goal) => <GoalBlurb colors={colors} goal={goal} key={goal.id} onOpen={() => onOpen(goal)} />)}</View>;
}

function GoalBlurb({ goal, colors, onOpen }: { goal: Goal; colors: AppColors; onOpen: () => void }) {
  const scope = `${goal.scope[0].toUpperCase()}${goal.scope.slice(1)} goal · through ${formatShortDate(goal.targetDate)}`;
  return (
    <Pressable accessibilityLabel={`Open goal ${goal.title}`} onPress={onOpen} style={[styles.goalBlurb, { backgroundColor: colors.yellowSoft }]}>
      <View style={styles.goalStar}>
        <Text style={[styles.goalStarIcon, { color: colors.yellow }]}>{goal.completed ? '★' : '☆'}</Text>
      </View>
      <View style={styles.goalCopy}>
        <Text style={[styles.goalScope, { color: colors.yellow }]}>{scope}</Text>
        <Text style={[styles.goalTitle, { color: colors.yellow }, goal.completed && styles.goalCompleted]}>{goal.title}</Text>
      </View>
    </Pressable>
  );
}

function MonthTripGroup({ event, events, period, today, colors, editingItem, editingSlot, inlineEditor, onEditItem }: {
  event: PlanningItem;
  events: PlanningItem[];
  period: TimelinePeriod;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
}) {
  const tripPast = eventPhase(event) === 'past';
  const tripSlot = `${period.id}-event-${event.id}`;
  return (
    <View style={styles.monthTripGroup}>
      <EditorialEventRow colors={colors} event={event} onPress={() => onEditItem(event, tripSlot)} period={period} today={today} tripRailMode="start" />
      {editingItem?.id === event.id && editingSlot === tripSlot && <View style={styles.spineEditor}>{inlineEditor}</View>}
      {events.map((child) => {
        const slot = `${period.id}-trip-${event.id}-${child.id}`;
        return <View key={child.id}><EditorialEventRow colors={colors} event={child} onPress={() => onEditItem(child, slot)} period={period} today={today} tripRailMode="event" tripSubdued={tripPast} />{editingItem?.id === child.id && editingSlot === slot && <View style={styles.spineEditor}>{inlineEditor}</View>}</View>;
      })}
    </View>
  );
}

function TimelineDateGutter({ date, today, colors, subdued = false }: { date: string; today: string; colors: AppColors; subdued?: boolean }) {
  const parsed = dateFromISO(date);
  return (
    <View style={styles.dateGutter}>
      <Text style={[styles.gutterWeekday, { color: date === today ? colors.red : subdued ? colors.tertiary : colors.secondary }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parsed).toUpperCase()}</Text>
      <Text style={[styles.gutterDay, { color: subdued ? colors.tertiary : colors.text }]}>{parsed.getDate()}</Text>
    </View>
  );
}

function EditorialEventRow({ event, period, today, colors, onPress, tripRailMode, tripSubdued = false }: { event: PlanningItem; period: TimelinePeriod; today: string; colors: AppColors; onPress: () => void; tripRailMode?: 'start' | 'event'; tripSubdued?: boolean }) {
  const start = event.anchorStart ?? period.start;
  const visibleDate = start < period.start ? period.start : start;
  const trip = isTrip(event);
  const phase = eventPhase(event);
  const subdued = phase === 'past';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.editorialEvent, pressed && { opacity: 0.58 }]}>
      <TimelineDateGutter colors={colors} date={visibleDate} subdued={subdued} today={today} />
      <View style={styles.spineRail}>
        {tripRailMode === 'start' ? (
          <View style={[styles.tripStartSegment, { backgroundColor: subdued ? colors.tertiary : colors.orange }]} />
        ) : tripRailMode === 'event' ? (
          <>
            <View style={[styles.tripSegmentTop, { backgroundColor: tripSubdued ? colors.tertiary : colors.orange }]} />
            <View style={[styles.tripEventDot, { backgroundColor: eventAccent(event, colors) }]} />
            <View style={[styles.tripSegmentBottom, { backgroundColor: tripSubdued ? colors.tertiary : colors.orange }]} />
          </>
        ) : (
          <View style={[trip ? styles.tripRail : styles.spineDot, { backgroundColor: subdued ? colors.tertiary : trip ? colors.orange : eventAccent(event, colors) }]} />
        )}
      </View>
      <View style={styles.editorialEventBody}>
        <View style={styles.editorialEventHeading}>
          <Text numberOfLines={2} style={[styles.editorialEventTitle, { color: subdued ? colors.secondary : colors.text }]}>{event.title}</Text>
          <Text style={[styles.editorialEventMeta, { color: subdued ? colors.tertiary : trip ? colors.orange : colors.secondary }]}>{trip ? eventRange(event) : event.startTime || 'All day'}</Text>
        </View>
        {(event.location || event.notes) && <Text numberOfLines={1} style={[styles.editorialEventNote, { color: colors.secondary }]}>{[event.location, event.notes].filter(Boolean).join(' · ')}</Text>}
      </View>
    </Pressable>
  );
}

function EditorialCompactEvent({ event, colors, onPress }: { event: PlanningItem; colors: AppColors; onPress: () => void }) {
  const trip = isTrip(event);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.editorialCompact, pressed && { opacity: 0.58 }]}>
      <View style={[trip ? styles.compactTripMark : styles.compactEventMark, { backgroundColor: eventPhase(event) === 'past' ? colors.tertiary : trip ? colors.orange : eventAccent(event, colors) }]} />
      <View style={styles.editorialCompactCopy}>
        <Text numberOfLines={1} style={[styles.editorialCompactTitle, { color: eventPhase(event) === 'past' ? colors.secondary : colors.text }]}>{event.title}</Text>
        <Text style={[styles.editorialCompactMeta, { color: colors.secondary }]}>{trip ? eventRange(event) : formatShortDate(event.anchorStart)}</Text>
      </View>
    </Pressable>
  );
}

function TimelineItem({ item, colors, onPress, onToggleTask }: { item: PlanningItem; colors: AppColors; onPress: () => void; onToggleTask: () => void }) {
  const recessed = Boolean(item.completed) || (item.kind === 'event' && eventPhase(item) === 'past');
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.timelineItem, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}>{item.kind === 'task' ? <Pressable accessibilityLabel={item.completed ? `Mark ${item.title} incomplete` : `Complete ${item.title}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onToggleTask(); }} style={[styles.checkbox, { borderColor: item.completed ? colors.blue : colors.tertiary }, item.completed && { backgroundColor: colors.blue }]}>{item.completed && <Text style={styles.checkmark}>✓</Text>}</Pressable> : <><Text style={[styles.eventTime, { color: recessed ? colors.tertiary : colors.secondary }]}>{item.startTime || 'All day'}</Text><View style={[styles.itemRule, { backgroundColor: eventAccent(item, colors) }]} /></>}<View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: recessed ? colors.tertiary : colors.text }, item.completed && styles.taskCompleted]}>{item.title}</Text>{item.notes && <Text numberOfLines={1} style={[styles.itemNote, { color: recessed ? colors.tertiary : colors.secondary }]}>{item.notes}</Text>}</View></Pressable>;
}

function CompactItem({ item, colors, hideTopBorder = false, onPress, onToggleTask }: { item: PlanningItem; colors: AppColors; hideTopBorder?: boolean; onPress: () => void; onToggleTask: () => void }) {
  const trip = isTrip(item);
  const past = item.kind === 'event' && eventPhase(item) === 'past';
  const eventColor = past ? colors.tertiary : trip ? colors.orange : eventAccent(item, colors);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.compactItem, { borderColor: colors.separator }, hideTopBorder && styles.compactItemAtMoment, pressed && { opacity: 0.55 }]}>
      {item.kind === 'task' ? (
        <>
          <Pressable accessibilityLabel={item.completed ? `Mark ${item.title} incomplete` : `Complete ${item.title}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onToggleTask(); }} style={[styles.weekTaskCheckbox, { borderColor: item.completed ? colors.blue : colors.tertiary }, item.completed && { backgroundColor: colors.blue }]}>
            {item.completed && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
          <Text numberOfLines={1} style={[styles.compactTitle, { color: item.completed ? colors.tertiary : colors.text }, item.completed && styles.taskCompleted]}>{item.title}</Text>
        </>
      ) : (
        <>
          <View style={[styles.itemRule, { backgroundColor: eventColor }]} />
          <Text numberOfLines={1} style={[styles.compactTitle, { color: past ? colors.secondary : colors.text }]}>{item.title}</Text>
          <Text style={[styles.compactMeta, { color: past ? colors.tertiary : trip ? eventColor : colors.secondary }]}>{item.startTime ?? 'All day'}</Text>
        </>
      )}
    </Pressable>
  );
}

function eventAccent(event: PlanningItem, colors: AppColors) {
  const phase = eventPhase(event);
  return phase === 'past' ? colors.tertiary : phase === 'current' ? colors.red : colors.blue;
}

function isPastAtMoment(item: PlanningItem, today: string) {
  if ((item.anchorEnd ?? item.anchorStart ?? '') < today) return true;
  if ((item.anchorStart ?? '') > today) return false;
  return item.kind === 'event' ? eventPhase(item) === 'past' : false;
}

function compareAnchors(a: PlanningItem, b: PlanningItem) {
  return (a.anchorStart ?? '').localeCompare(b.anchorStart ?? '') || timeMinutes(a.startTime) - timeMinutes(b.startTime);
}

function isTrip(item: PlanningItem) {
  return item.kind === 'event' && (item.eventType === 'trip' || (item.anchorStart !== null && item.anchorEnd !== null && item.anchorEnd > item.anchorStart));
}

function eventRange(item: PlanningItem) {
  if (!item.anchorStart) return 'Someday';
  if (!item.anchorEnd || item.anchorEnd === item.anchorStart) return formatShortDate(item.anchorStart);
  return `${formatShortDate(item.anchorStart)}–${formatShortDate(item.anchorEnd)}`;
}

function summaryLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function overlaps(item: PlanningItem, period: TimelinePeriod) {
  return item.anchorStart !== null && item.anchorStart <= period.end && (item.anchorEnd ?? item.anchorStart) >= period.start;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, timeline: { flex: 1 }, content: { paddingHorizontal: 18, paddingBottom: 170 },
  period: { paddingTop: 18, paddingBottom: 24, borderTopWidth: 1 },
  periodTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  periodTitle: { fontSize: 29, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8 },
  yearTitle: { fontSize: 42, lineHeight: 47, fontWeight: '700', letterSpacing: -1.3 }, periodSubtitle: { fontSize: 14, fontWeight: '600' },
  dayEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, dayTitle: { fontSize: 31, fontWeight: '700', letterSpacing: -1, marginTop: 3 }, daySubtitle: { fontSize: 14, marginTop: 3 },
  currentMarker: { minHeight: 14, flexDirection: 'row', alignItems: 'center' },
  currentMomentDivider: { height: 1, borderRadius: 1, marginVertical: 4 },
  currentMomentDividerWeek: { marginLeft: -48 },
  sectionHeader: { marginTop: 10, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }, sectionAction: { fontSize: 14, fontWeight: '600' },
  timelineItem: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }, eventTime: { width: 68, fontSize: 13, fontVariant: ['tabular-nums'] }, itemRule: { width: 3, height: 25, borderRadius: 2, marginRight: 10 }, itemCopy: { flex: 1, paddingVertical: 6 }, itemTitle: { fontSize: 16, fontWeight: '500' }, itemNote: { fontSize: 12, marginTop: 2 },
  taskCompleted: { textDecorationLine: 'line-through' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, openRow: { height: 42, fontSize: 14, paddingTop: 10 },
  reflection: { marginTop: 12 }, reflectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 }, reflectionBox: { minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' }, reflectionText: { fontSize: 16, lineHeight: 22 },
  weekTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }, weekTitle: { fontSize: 29, fontWeight: '700', letterSpacing: -0.8 }, weekDay: { minHeight: 58, flexDirection: 'row', alignItems: 'stretch', paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth }, weekDayAtMoment: { borderTopWidth: 0 }, weekDateButton: { width: 48, alignSelf: 'stretch', justifyContent: 'center' }, weekDayItems: { flex: 1, justifyContent: 'center' }, weekOpen: { fontSize: 13, paddingVertical: 6 },
  emptyWeek: { fontSize: 15, lineHeight: 21, paddingVertical: 12 },
  compactItem: { minHeight: 39, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }, compactItemAtMoment: { borderTopWidth: 0 }, compactTitle: { flex: 1, fontSize: 15, fontWeight: '500' }, compactMeta: { flexShrink: 0, marginLeft: 10, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] }, weekTaskCheckbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, empty: { fontSize: 14, marginTop: 10 }, more: { fontSize: 12, fontWeight: '600', marginTop: 7, marginLeft: 85 },
  editorialHeader: { marginBottom: 12 },
  periodSummary: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  editorialEmpty: { fontSize: 15, lineHeight: 21, paddingVertical: 18 },
  goalSection: { marginBottom: 2 },
  goalBlurb: { minHeight: 42, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5, marginBottom: 5 },
  goalStar: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  goalStarIcon: { fontSize: 18, lineHeight: 20, fontWeight: '600' },
  goalCopy: { flex: 1 },
  goalScope: { fontSize: 7, fontWeight: '800', letterSpacing: 0.65, textTransform: 'uppercase', marginBottom: 1 },
  goalTitle: { fontSize: 13, lineHeight: 16, fontWeight: '600' },
  goalCompleted: { textDecorationLine: 'line-through', opacity: 0.62 },
  monthSpine: { paddingTop: 2 },
  monthTripGroup: { position: 'relative' },
  editorialEvent: { minHeight: 62, flexDirection: 'row', alignItems: 'stretch' },
  dateGutter: { width: 48, alignItems: 'center', justifyContent: 'center', paddingBottom: 4 },
  gutterWeekday: { width: 48, textAlign: 'center', fontSize: 8, fontWeight: '800', letterSpacing: 0.45 },
  gutterDay: { width: 48, textAlign: 'center', fontSize: 18, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spineRail: { width: 18, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  spineDot: { width: 7, height: 7, borderRadius: 4 },
  tripRail: { width: 4, minHeight: 36, borderRadius: 2 },
  tripStartSegment: { position: 'absolute', top: 14, bottom: 0, width: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  tripSegmentTop: { position: 'absolute', top: 0, height: 22, width: 4 },
  tripEventDot: { position: 'absolute', top: 27, width: 7, height: 7, borderRadius: 4 },
  tripSegmentBottom: { position: 'absolute', top: 39, bottom: 0, width: 4 },
  editorialEventBody: { flex: 1, minHeight: 62, justifyContent: 'center', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  editorialEventHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  editorialEventTitle: { flex: 1, fontSize: 15, lineHeight: 19, fontWeight: '600' },
  editorialEventMeta: { fontSize: 10, fontWeight: '700' },
  editorialEventNote: { fontSize: 11, marginTop: 3 },
  spineEditor: { marginLeft: 58, marginBottom: 12 },
  quarterMonths: { gap: 4 },
  quarterMonth: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, paddingBottom: 9 },
  quarterMonthTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.35, marginBottom: 5 },
  quarterOpen: { fontSize: 13, paddingVertical: 6 },
  editorialCompact: { minHeight: 42, flexDirection: 'row', alignItems: 'center' },
  compactEventMark: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 5, marginRight: 11 },
  compactTripMark: { width: 4, height: 28, borderRadius: 2, marginHorizontal: 6, marginRight: 12 },
  editorialCompactCopy: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  editorialCompactTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  editorialCompactMeta: { fontSize: 10, fontWeight: '600' },
  yearIndex: { gap: 2 },
  yearMonthSection: { minHeight: 54, paddingBottom: 8 },
  yearMonthSeparator: { height: 24, flexDirection: 'row', alignItems: 'center' },
  yearMonthLabel: { width: 34, fontSize: 9, fontWeight: '800', letterSpacing: 0.65 },
  yearMonthLine: { flex: 1, height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  yearMonthCount: { width: 12, textAlign: 'right', fontSize: 9, fontWeight: '700' },
  yearMonthOpen: { fontSize: 11, marginLeft: 42, paddingVertical: 4 },
  yearMoment: { minHeight: 32, marginLeft: 39, flexDirection: 'row', alignItems: 'center' },
  yearEventDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  yearTripMark: { width: 3, height: 22, borderRadius: 2, marginLeft: 1, marginRight: 10 },
  yearEventText: { flex: 1, fontSize: 12, fontWeight: '600' },
  yearMomentDate: { marginLeft: 7, fontSize: 9, fontWeight: '600' },
  yearMore: { marginLeft: 53, fontSize: 10, fontWeight: '600', paddingTop: 2 },
  yearInlineEditor: { marginLeft: 39, marginBottom: 8 },
  dockGroup: { position: 'absolute', width: '90%', alignSelf: 'center', bottom: 92, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dock: { flex: 1, borderRadius: 27, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  homeShell: { width: 54, height: 54, borderRadius: 27, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  homeButton: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  homeGlass: { position: 'absolute', inset: 0, borderRadius: 27 },
  dockSurface: { minHeight: 54, borderRadius: 27, overflow: 'hidden' },
  dockGlass: { position: 'absolute', inset: 0, borderRadius: 27 },
  dockContent: { minHeight: 54, flexDirection: 'row', alignItems: 'center', padding: 5, gap: 1 },
  dockButton: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, overflow: 'hidden' },
  activeLens: { position: 'absolute', inset: 0, borderRadius: 22 },
  dockLabel: { fontSize: 11, fontWeight: '700', letterSpacing: -0.2 },
});
