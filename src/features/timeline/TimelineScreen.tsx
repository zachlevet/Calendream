import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { ItemDraft, PlanningItem, TimelineSnapshot, TimelineZoom } from '@/models/planning';
import { addLocalDays, dateFromISO, formatShortDate, localISO } from '@/shared/date';
import { eventPhase, timeMinutes } from '@/shared/time';
import type { AppColors } from '@/theme/colors';
import { buildTimelinePeriods, isVisibleAtZoom, isoWeekNumber, type TimelinePeriod } from './periods';

interface TimelineScreenProps {
  colors: AppColors;
  dataRevision: number;
  today: string;
  loadRange: (startDate: string, endDate: string) => Promise<TimelineSnapshot>;
  onSaveItem: (draft: ItemDraft) => Promise<void>;
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
const TIMELINE_TOP_INSET = 92;

export function TimelineScreen({ colors, dataRevision, today, loadRange, onSaveItem, onToggleTask, onOpenDay, renderInlineEditor }: TimelineScreenProps) {
  const [zoom, setZoom] = useState<TimelineZoom>('today');
  const [snapshot, setSnapshot] = useState<TimelineSnapshot>({ items: [], reflections: {} });
  const [loading, setLoading] = useState(true);
  const [pinchScale] = useState(() => new Animated.Value(1));
  const [editingItem, setEditingItem] = useState<PlanningItem | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<ItemDraft | null>(null);
  const scroll = useRef<ScrollView>(null);
  const editorView = useRef<View>(null);
  const scrollOffset = useRef(0);
  const currentPeriodY = useRef(0);
  const focusDate = useRef(today);
  const periodPositions = useRef(new Map<string, { start: string; end: string; y: number }>());
  const keyboardTop = useRef(Dimensions.get('window').height);
  const alignedZoom = useRef<TimelineZoom | null>(null);
  const loadedRange = useRef('');
  const periods = useMemo(() => buildTimelinePeriods(zoom, today), [today, zoom]);
  const firstDate = periods[0].start;
  const lastDate = periods[periods.length - 1].end;

  useEffect(() => {
    let cancelled = false;
    const rangeKey = `${firstDate}:${lastDate}`;
    const rangeChanged = loadedRange.current !== rangeKey;
    loadedRange.current = rangeKey;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadRange(firstDate, lastDate).then((nextSnapshot) => {
        if (cancelled) return;
        if (rangeChanged) {
          periodPositions.current.clear();
          alignedZoom.current = null;
        }
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
    setInlineDraft({ id: item.id, kind: item.kind, title: item.title, date: item.anchorStart ?? today, time: item.startTime, notes: item.notes, location: item.location, locationPlace: item.locationPlace });
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

  const changeZoom = useCallback((nextZoom: TimelineZoom, requestedDate?: string) => {
    if (nextZoom === zoom) return;
    const viewportY = scrollOffset.current + 48;
    const visiblePeriod = [...periodPositions.current.values()].sort((a, b) => a.y - b.y).filter((position) => position.y <= viewportY).at(-1);
    const visibleAnchor = visiblePeriod && today >= visiblePeriod.start && today <= visiblePeriod.end ? today : visiblePeriod?.start;
    focusDate.current = requestedDate ?? visibleAnchor ?? focusDate.current;
    periodPositions.current.clear();
    alignedZoom.current = null;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoom(nextZoom);
  }, [today, zoom]);

  const alignPeriod = useCallback((period: TimelinePeriod, y: number) => {
    periodPositions.current.set(period.id, { start: period.start, end: period.end, y });
    if (period.current) currentPeriodY.current = y;
    if (alignedZoom.current === zoom) return;
    if (focusDate.current < period.start || focusDate.current > period.end) return;
    alignedZoom.current = zoom;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - TIMELINE_TOP_INSET), animated: false }), 20);
  }, [zoom]);

  const goHome = useCallback(() => {
    focusDate.current = today;
    scroll.current?.scrollTo({ y: Math.max(0, currentPeriodY.current - TIMELINE_TOP_INSET), animated: true });
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
          <ScrollView directionalLockEnabled onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} ref={scroll} contentContainerStyle={styles.content} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
            {periods.map((period) => (
              <Period
                colors={colors}
                items={snapshot.items}
                key={period.id}
                loading={loading}
                onPeriodLayout={alignPeriod}
                editingItem={editingItem}
                editingSlot={editingSlot}
                inlineEditor={inlineEditor}
                onEditItem={(item, slot) => void editInline(item, slot)}
                onOpenDay={onOpenDay}
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
                    onPress={() => changeZoom(level.id)}
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

function Period({ period, zoom, items, loading, reflection, today, colors, editingItem, editingSlot, inlineEditor, onPeriodLayout, onEditItem, onOpenDay, onToggleTask, onZoomToDate }: {
  period: TimelinePeriod;
  zoom: TimelineZoom;
  items: PlanningItem[];
  loading: boolean;
  reflection?: string;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onPeriodLayout: (period: TimelinePeriod, y: number) => void;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
  onToggleTask: (item: PlanningItem) => void;
  onZoomToDate: (date: string, zoom: TimelineZoom) => void;
}) {
  const visibleItems = items.filter((item) => overlaps(item, period) && isVisibleAtZoom(item, zoom));
  const presentStyle = period.current ? { borderTopWidth: 0 } : { borderTopColor: colors.separator };
  const shared = { colors, editingItem, editingSlot, inlineEditor, onEditItem };

  return (
    <View
      onLayout={(event) => onPeriodLayout(period, event.nativeEvent.layout.y)}
      style={[styles.period, presentStyle]}
    >
      {zoom === 'today' ? (
        <DayPage {...shared} date={period.start} items={visibleItems} onOpenDay={onOpenDay} period={period} reflection={reflection} today={today} />
      ) : zoom === 'week' ? (
        <WeekPage {...shared} items={visibleItems} onOpenDay={onOpenDay} period={period} today={today} />
      ) : zoom === 'month' ? (
        <MonthPage {...shared} items={visibleItems} loading={loading} onOpenDay={onOpenDay} onToggleTask={onToggleTask} onZoomToDate={onZoomToDate} period={period} today={today} />
      ) : zoom === 'quarter' ? (
        <QuarterPage {...shared} items={visibleItems} loading={loading} onOpenDay={onOpenDay} onToggleTask={onToggleTask} onZoomToDate={onZoomToDate} period={period} today={today} />
      ) : (
        <YearPage {...shared} items={visibleItems} loading={loading} onOpenDay={onOpenDay} onToggleTask={onToggleTask} onZoomToDate={onZoomToDate} period={period} today={today} />
      )}
    </View>
  );
}

function DayPage({ date, period, items, reflection, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenDay }: {
  date: string;
  period: TimelinePeriod;
  items: PlanningItem[];
  reflection?: string;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const events = items.filter((item) => item.kind === 'event');
  const tasks = items.filter((item) => item.kind === 'task');
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

      <TimelineSectionHeader colors={colors} onPress={() => onOpenDay(date)} title="Events" />
      {events.length ? events.map((item) => { const slot = `day-${date}-${item.id}`; return <View key={item.id}><TimelineItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; }) : <Text style={[styles.openRow, { color: colors.tertiary }]}>No events planned</Text>}
      <TimelineSectionHeader colors={colors} onPress={() => onOpenDay(date)} title="Tasks" />
      {tasks.length ? tasks.map((item) => { const slot = `day-${date}-${item.id}`; return <View key={item.id}><TimelineItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; }) : <Text style={[styles.openRow, { color: colors.tertiary }]}>No tasks yet</Text>}

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

function WeekPage({ period, items, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenDay }: {
  period: TimelinePeriod;
  items: PlanningItem[];
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(period.start, index))
    .map((date) => ({
      date,
      items: items
        .filter((item) => item.anchorStart !== null && item.anchorStart <= date && (item.anchorEnd ?? item.anchorStart) >= date)
        .sort((a, b) => a.kind.localeCompare(b.kind) || timeMinutes(a.startTime) - timeMinutes(b.startTime) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
    .filter((day) => day.items.length > 0);
  return (
    <>
      {period.current && <CurrentMarker colors={colors} label="This week" />}
      <View style={styles.weekTitleRow}>
        <Text style={[styles.weekTitle, { color: colors.text }]}>Week {isoWeekNumber(period.start)}</Text>
        <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.title}</Text>
      </View>
      {!days.length && <Text style={[styles.emptyWeek, { color: colors.tertiary }]}>No events or tasks yet, let’s get planning :)</Text>}
      {days.map(({ date, items: dayItems }) => {
        const parsed = dateFromISO(date);
        return (
          <View key={date} style={[styles.weekDay, { borderColor: colors.separator }]}>
            <Pressable onPress={() => onOpenDay(date)} style={styles.weekDayHeader}>
              <Text style={[styles.weekDayName, { color: date === today ? colors.red : colors.text }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsed)}</Text>
              <Text style={[styles.weekDayDate, { color: colors.secondary }]}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed)}</Text>
            </Pressable>
            {dayItems.map((item) => { const slot = `week-${date}-${item.id}`; return <View key={`${date}-${item.id}`}><CompactItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; })}
          </View>
        );
      })}
    </>
  );
}

interface EditorialPeriodProps {
  period: TimelinePeriod;
  items: PlanningItem[];
  loading: boolean;
  today: string;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
  onToggleTask: (item: PlanningItem) => void;
  onZoomToDate: (date: string, zoom: TimelineZoom) => void;
}

function MonthPage({ period, items, loading, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onToggleTask, onZoomToDate }: EditorialPeriodProps) {
  const events = items.filter((item) => item.kind === 'event' && item.anchorStart !== null && (
    (item.anchorStart >= period.start && item.anchorStart <= period.end)
    || (period.current && item.anchorStart <= today && (item.anchorEnd ?? item.anchorStart) >= today)
  )).sort(compareAnchors);
  const goals = items.filter((item) => item.kind === 'task');
  const trips = events.filter(isTrip).length;
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

      {goals.map((goal) => {
        const slot = `${period.id}-goal-${goal.id}`;
        return <View key={goal.id}><GoalBlurb colors={colors} goal={goal} onPress={() => onEditItem(goal, slot)} onToggle={() => onToggleTask(goal)} scope="Monthly goal" />{editingItem?.id === goal.id && editingSlot === slot && inlineEditor}</View>;
      })}

      {!loading && !events.length && !goals.length ? <Text style={[styles.editorialEmpty, { color: colors.tertiary }]}>An open month. Let’s make something happen.</Text> : (
        <View style={styles.monthSpine}>
          {events.map((event) => {
            const slot = `${period.id}-event-${event.id}`;
            return <View key={event.id}><EditorialEventRow colors={colors} event={event} onPress={() => onEditItem(event, slot)} period={period} today={today} />{editingItem?.id === event.id && editingSlot === slot && <View style={styles.spineEditor}>{inlineEditor}</View>}</View>;
          })}
        </View>
      )}
    </>
  );
}

function QuarterPage({ period, items, loading, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onToggleTask, onZoomToDate }: EditorialPeriodProps) {
  const goals = items.filter((item) => item.kind === 'task');
  const events = items.filter((item) => item.kind === 'event').sort(compareAnchors);
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
      {goals.map((goal) => { const slot = `${period.id}-goal-${goal.id}`; return <View key={goal.id}><GoalBlurb colors={colors} goal={goal} onPress={() => onEditItem(goal, slot)} onToggle={() => onToggleTask(goal)} scope="Quarter goal" />{editingItem?.id === goal.id && editingSlot === slot && inlineEditor}</View>; })}
      {!loading && !events.length && !goals.length && <Text style={[styles.editorialEmpty, { color: colors.tertiary }]}>A clear quarter. Plenty of room to plan.</Text>}
      <View style={styles.quarterMonths}>
        {months.map((month) => (
          <View key={month.start} style={[styles.quarterMonth, { borderColor: colors.separator }]}>
            <Pressable onPress={() => onZoomToDate(month.start, 'month')}><Text style={[styles.quarterMonthTitle, { color: month.start <= today && month.end >= today ? colors.red : colors.text }]}>{month.title}</Text></Pressable>
            {!month.events.length ? <Text style={[styles.quarterOpen, { color: colors.tertiary }]}>Open</Text> : month.events.map((event) => {
              const slot = `${period.id}-${month.start}-${event.id}`;
              return <View key={event.id}><EditorialCompactEvent colors={colors} event={event} onPress={() => onEditItem(event, slot)} />{editingItem?.id === event.id && editingSlot === slot && inlineEditor}</View>;
            })}
          </View>
        ))}
      </View>
    </>
  );
}

function YearPage({ period, items, loading, today, colors, editingItem, editingSlot, inlineEditor, onEditItem, onToggleTask, onZoomToDate }: EditorialPeriodProps) {
  const goals = items.filter((item) => item.kind === 'task');
  const events = items.filter((item) => item.kind === 'event').sort(compareAnchors);
  const year = Number(period.title);
  const months = Array.from({ length: 12 }, (_, month) => {
    const start = localISO(new Date(year, month, 1));
    const end = localISO(new Date(year, month + 1, 0));
    return { start, end, title: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month, 1)), events: events.filter((item) => item.anchorStart !== null && item.anchorStart >= start && item.anchorStart <= end) };
  });
  return (
    <>
      {period.eyebrow && <CurrentMarker colors={colors} label={period.eyebrow} />}
      <View style={styles.editorialHeader}>
        <Text style={[styles.yearTitle, { color: colors.text }]}>{period.title}</Text>
        <Text style={[styles.periodSummary, { color: colors.secondary }]}>{summaryLabel(events.length, 'moment')} · {summaryLabel(goals.length, 'goal')}</Text>
      </View>
      {goals.map((goal) => { const slot = `${period.id}-goal-${goal.id}`; return <View key={goal.id}><GoalBlurb colors={colors} goal={goal} onPress={() => onEditItem(goal, slot)} onToggle={() => onToggleTask(goal)} scope="Year goal" />{editingItem?.id === goal.id && editingSlot === slot && inlineEditor}</View>; })}
      {!loading && !events.length && !goals.length && <Text style={[styles.editorialEmpty, { color: colors.tertiary }]}>An unwritten year.</Text>}
      <View style={styles.yearGrid}>
        {months.flatMap((month) => {
          const cell = <View key={month.start} style={[styles.yearMonth, { backgroundColor: colors.card }]}>
            <Pressable onPress={() => onZoomToDate(month.start, 'month')} style={styles.yearMonthHeader}><Text style={[styles.yearMonthTitle, { color: month.start <= today && month.end >= today ? colors.red : colors.text }]}>{month.title}</Text><Text style={[styles.yearMonthCount, { color: colors.secondary }]}>{month.events.length || ''}</Text></Pressable>
            {month.events.slice(0, 2).map((event) => { const slot = `${period.id}-${month.start}-${event.id}`; return <Pressable key={event.id} onPress={() => onEditItem(event, slot)} style={styles.yearEvent}><View style={[styles.yearEventDot, { backgroundColor: isTrip(event) ? colors.amber : eventAccent(event, colors) }]} /><Text numberOfLines={1} style={[styles.yearEventText, { color: colors.secondary }]}>{event.title}</Text></Pressable>; })}
          </View>;
          const selected = month.events.find((event) => editingItem?.id === event.id && editingSlot === `${period.id}-${month.start}-${event.id}`);
          return selected ? [cell, <View key={`${month.start}-editor`} style={styles.yearInlineEditor}>{inlineEditor}</View>] : [cell];
        })}
      </View>
    </>
  );
}

function TimelineSectionHeader({ title, colors, onPress }: { title: string; colors: AppColors; onPress: () => void }) {
  return <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Pressable hitSlop={8} onPress={onPress}><Text style={[styles.sectionAction, { color: colors.blue }]}>Add {title.slice(0, -1).toLowerCase()}</Text></Pressable></View>;
}

function CurrentMarker({ colors, label }: { colors: AppColors; label: string }) {
  return <View style={styles.currentMarker}><Text style={[styles.dayEyebrow, { color: colors.red }]}>{label}</Text><View style={[styles.currentMarkerLine, { backgroundColor: colors.red }]} /></View>;
}

function GoalBlurb({ goal, scope, colors, onPress, onToggle }: { goal: PlanningItem; scope: string; colors: AppColors; onPress: () => void; onToggle: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.goalBlurb, { backgroundColor: colors.amberSoft }, pressed && { opacity: 0.65 }]}>
      <Pressable accessibilityLabel={goal.completed ? `Mark ${goal.title} incomplete` : `Complete ${goal.title}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onToggle(); }} style={[styles.goalCheck, { borderColor: colors.amber }, goal.completed && { backgroundColor: colors.amber }]}>{goal.completed && <Text style={styles.checkmark}>✓</Text>}</Pressable>
      <View style={styles.goalCopy}>
        <Text style={[styles.goalScope, { color: colors.amber }]}>{scope}</Text>
        <Text style={[styles.goalTitle, { color: colors.text }, goal.completed && styles.goalCompleted]}>{goal.title}</Text>
      </View>
    </Pressable>
  );
}

function EditorialEventRow({ event, period, today, colors, onPress }: { event: PlanningItem; period: TimelinePeriod; today: string; colors: AppColors; onPress: () => void }) {
  const start = event.anchorStart ?? period.start;
  const date = dateFromISO(start < period.start ? period.start : start);
  const trip = isTrip(event);
  const milestone = !trip && event.altitude >= 4;
  const phase = eventPhase(event);
  const subdued = phase === 'past';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.editorialEvent, pressed && { opacity: 0.58 }]}>
      <View style={styles.dateGutter}>
        <Text style={[styles.gutterWeekday, { color: start === today ? colors.red : subdued ? colors.tertiary : colors.secondary }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase()}</Text>
        <Text style={[styles.gutterDay, { color: subdued ? colors.tertiary : colors.text }]}>{date.getDate()}</Text>
      </View>
      <View style={styles.spineRail}>
        <View style={[trip ? styles.tripRail : milestone ? styles.milestoneDot : styles.spineDot, { backgroundColor: trip || milestone ? colors.amber : eventAccent(event, colors) }]} />
      </View>
      <View style={[styles.editorialEventBody, trip && { backgroundColor: colors.amberSoft }]}>
        <View style={styles.editorialEventHeading}>
          <Text numberOfLines={2} style={[styles.editorialEventTitle, { color: subdued ? colors.secondary : colors.text }]}>{event.title}</Text>
          <Text style={[styles.editorialEventMeta, { color: trip ? colors.amber : colors.secondary }]}>{trip ? eventRange(event) : event.startTime || (milestone ? 'Milestone' : 'All day')}</Text>
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
      <View style={[trip ? styles.compactTripMark : styles.compactEventMark, { backgroundColor: trip ? colors.amber : eventAccent(event, colors) }]} />
      <View style={styles.editorialCompactCopy}>
        <Text numberOfLines={1} style={[styles.editorialCompactTitle, { color: eventPhase(event) === 'past' ? colors.secondary : colors.text }]}>{event.title}</Text>
        <Text style={[styles.editorialCompactMeta, { color: colors.secondary }]}>{trip ? eventRange(event) : formatShortDate(event.anchorStart)}</Text>
      </View>
    </Pressable>
  );
}

function TimelineItem({ item, colors, onPress }: { item: PlanningItem; colors: AppColors; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.timelineItem, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}>{item.kind === 'task' ? <View style={[styles.checkbox, { borderColor: item.completed ? colors.blue : colors.tertiary }, item.completed && { backgroundColor: colors.blue }]}>{item.completed && <Text style={styles.checkmark}>✓</Text>}</View> : <><Text style={[styles.eventTime, { color: colors.secondary }]}>{item.startTime || 'All day'}</Text><View style={[styles.itemRule, { backgroundColor: eventAccent(item, colors) }]} /></>}<View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: item.completed ? colors.tertiary : colors.text }]}>{item.title}</Text>{item.notes && <Text numberOfLines={1} style={[styles.itemNote, { color: colors.secondary }]}>{item.notes}</Text>}</View></Pressable>;
}

function CompactItem({ item, colors, onPress }: { item: PlanningItem; colors: AppColors; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.compactItem, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}><Text style={[styles.compactDate, { color: colors.secondary }]}>{item.startTime ?? formatShortDate(item.anchorStart)}</Text><View style={[styles.itemRule, { backgroundColor: item.kind === 'event' ? eventAccent(item, colors) : colors.tertiary }]} /><Text numberOfLines={1} style={[styles.compactTitle, { color: item.completed ? colors.tertiary : colors.text }]}>{item.title}</Text></Pressable>;
}

function eventAccent(event: PlanningItem, colors: AppColors) {
  const phase = eventPhase(event);
  return phase === 'past' ? colors.tertiary : phase === 'current' ? colors.red : colors.blue;
}

function compareAnchors(a: PlanningItem, b: PlanningItem) {
  return (a.anchorStart ?? '').localeCompare(b.anchorStart ?? '') || timeMinutes(a.startTime) - timeMinutes(b.startTime);
}

function isTrip(item: PlanningItem) {
  return item.kind === 'event' && item.anchorStart !== null && item.anchorEnd !== null && item.anchorEnd > item.anchorStart;
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
  currentMarkerLine: { flex: 1, height: 1, marginLeft: 9, borderRadius: 1 },
  sectionHeader: { marginTop: 10, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }, sectionAction: { fontSize: 14, fontWeight: '600' },
  timelineItem: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }, eventTime: { width: 68, fontSize: 13, fontVariant: ['tabular-nums'] }, itemRule: { width: 3, height: 25, borderRadius: 2, marginRight: 10 }, itemCopy: { flex: 1, paddingVertical: 6 }, itemTitle: { fontSize: 16, fontWeight: '500' }, itemNote: { fontSize: 12, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, openRow: { height: 42, fontSize: 14, paddingTop: 10 },
  reflection: { marginTop: 12 }, reflectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 }, reflectionBox: { minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' }, reflectionText: { fontSize: 16, lineHeight: 22 },
  weekTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }, weekTitle: { fontSize: 29, fontWeight: '700', letterSpacing: -0.8 }, weekDay: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth }, weekDayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }, weekDayName: { fontSize: 17, fontWeight: '700' }, weekDayDate: { fontSize: 13, fontWeight: '600' }, weekOpen: { fontSize: 13, paddingVertical: 6 },
  emptyWeek: { fontSize: 15, lineHeight: 21, paddingVertical: 12 },
  compactItem: { minHeight: 39, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }, compactDate: { width: 72, fontSize: 12, fontVariant: ['tabular-nums'] }, compactTitle: { flex: 1, fontSize: 15, fontWeight: '500' }, empty: { fontSize: 14, marginTop: 10 }, more: { fontSize: 12, fontWeight: '600', marginTop: 7, marginLeft: 85 },
  editorialHeader: { marginBottom: 12 },
  periodSummary: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  editorialEmpty: { fontSize: 15, lineHeight: 21, paddingVertical: 18 },
  goalBlurb: { minHeight: 66, borderRadius: 17, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 13 },
  goalCheck: { width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  goalCopy: { flex: 1 },
  goalScope: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  goalTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
  goalCompleted: { textDecorationLine: 'line-through', opacity: 0.62 },
  monthSpine: { paddingTop: 2 },
  editorialEvent: { minHeight: 62, flexDirection: 'row', alignItems: 'stretch' },
  dateGutter: { width: 48, alignItems: 'flex-end', paddingRight: 8, paddingTop: 8 },
  gutterWeekday: { fontSize: 8, fontWeight: '800', letterSpacing: 0.45 },
  gutterDay: { fontSize: 18, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spineRail: { width: 18, alignItems: 'center', paddingTop: 14 },
  spineDot: { width: 7, height: 7, borderRadius: 4 },
  milestoneDot: { width: 9, height: 9, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  tripRail: { width: 4, minHeight: 36, borderRadius: 2 },
  editorialEventBody: { flex: 1, minHeight: 54, justifyContent: 'center', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8 },
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
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearMonth: { width: '48.7%', minHeight: 86, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 9 },
  yearMonthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  yearMonthTitle: { fontSize: 15, fontWeight: '700' },
  yearMonthCount: { fontSize: 10, fontWeight: '700' },
  yearEvent: { minHeight: 24, flexDirection: 'row', alignItems: 'center' },
  yearEventDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  yearEventText: { flex: 1, fontSize: 10, fontWeight: '600' },
  yearInlineEditor: { width: '100%', marginBottom: 8 },
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
