import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { ItemDraft, PlanningItem, TimelineSnapshot, TimelineZoom } from '@/models/planning';
import { addLocalDays, dateFromISO, formatShortDate } from '@/shared/date';
import { eventPhase } from '@/shared/time';
import type { AppColors } from '@/theme/colors';
import { buildTimelinePeriods, isVisibleAtZoom, isoWeekNumber, type TimelinePeriod } from './periods';

interface TimelineScreenProps {
  colors: AppColors;
  dataRevision: number;
  today: string;
  loadRange: (startDate: string, endDate: string) => Promise<TimelineSnapshot>;
  onSaveItem: (draft: ItemDraft) => Promise<void>;
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

export function TimelineScreen({ colors, dataRevision, today, loadRange, onSaveItem, onOpenDay, renderInlineEditor }: TimelineScreenProps) {
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

  const changeZoom = useCallback((nextZoom: TimelineZoom) => {
    if (nextZoom === zoom) return;
    alignedZoom.current = null;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoom(nextZoom);
  }, [zoom]);

  const alignCurrentPeriod = useCallback((y: number) => {
    currentPeriodY.current = y;
    if (alignedZoom.current === zoom) return;
    alignedZoom.current = zoom;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 2), animated: false }), 20);
  }, [zoom]);

  const goHome = useCallback(() => {
    scroll.current?.scrollTo({ y: Math.max(0, currentPeriodY.current - 2), animated: true });
  }, []);

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
                onCurrentLayout={alignCurrentPeriod}
                editingItem={editingItem}
                editingSlot={editingSlot}
                inlineEditor={inlineEditor}
                onEditItem={(item, slot) => void editInline(item, slot)}
                onOpenDay={onOpenDay}
                period={period}
                reflection={snapshot.reflections[period.start]}
                today={today}
                zoom={zoom}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </GestureDetector>

      <View style={styles.dock}>
        <Pressable accessibilityLabel={`Return to the current ${zoom}`} onPress={goHome} style={[styles.homeButton, !glassAvailable && { backgroundColor: fallbackGlass }]}>
          {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.homeGlass} />}
          <SymbolView name="house.fill" size={18} tintColor={colors.text} weight="semibold" />
        </Pressable>
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
  );
}

function Period({ period, zoom, items, loading, reflection, today, colors, editingItem, editingSlot, inlineEditor, onCurrentLayout, onEditItem, onOpenDay }: {
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
  onCurrentLayout: (y: number) => void;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const visibleItems = items.filter((item) => overlaps(item, period) && isVisibleAtZoom(item, zoom));
  const presentStyle = period.current ? { borderTopColor: colors.red, borderTopWidth: 2 } : { borderTopColor: colors.separator };
  const shared = { colors, editingItem, editingSlot, inlineEditor, onEditItem };

  return (
    <View
      onLayout={(event) => { if (period.current) onCurrentLayout(event.nativeEvent.layout.y); }}
      style={[styles.period, presentStyle]}
    >
      {zoom === 'today' ? (
        <DayPage {...shared} date={period.start} items={visibleItems} onOpenDay={onOpenDay} period={period} reflection={reflection} today={today} />
      ) : zoom === 'week' ? (
        <WeekPage {...shared} items={visibleItems} onOpenDay={onOpenDay} period={period} today={today} />
      ) : (
        <CoarsePeriod {...shared} items={visibleItems} loading={loading} onOpenDay={onOpenDay} period={period} zoom={zoom} />
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
      <Text style={[styles.dayEyebrow, { color: dayAccent }]}>{period.eyebrow}</Text>
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
  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(period.start, index));
  return (
    <>
      {period.current && <Text style={[styles.eyebrow, { color: colors.red }]}>This week</Text>}
      <View style={styles.weekTitleRow}>
        <Text style={[styles.weekTitle, { color: colors.text }]}>Week {isoWeekNumber(period.start)}</Text>
        <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.title}</Text>
      </View>
      {days.map((date) => {
        const dayItems = items.filter((item) => item.anchorStart !== null && item.anchorStart <= date && (item.anchorEnd ?? item.anchorStart) >= date);
        const parsed = dateFromISO(date);
        return (
          <View key={date} style={[styles.weekDay, { borderColor: date === today ? colors.red : colors.separator }, date === today && styles.currentWeekDay]}>
            <Pressable onPress={() => onOpenDay(date)} style={styles.weekDayHeader}>
              <Text style={[styles.weekDayName, { color: date === today ? colors.red : colors.text }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsed)}</Text>
              <Text style={[styles.weekDayDate, { color: colors.secondary }]}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed)}</Text>
            </Pressable>
            {dayItems.length ? dayItems.map((item) => { const slot = `week-${date}-${item.id}`; return <View key={`${date}-${item.id}`}><CompactItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; }) : <Text style={[styles.weekOpen, { color: colors.tertiary }]}>Open</Text>}
          </View>
        );
      })}
    </>
  );
}

function CoarsePeriod({ period, zoom, items, loading, colors, editingItem, editingSlot, inlineEditor, onEditItem, onOpenDay }: {
  period: TimelinePeriod;
  zoom: TimelineZoom;
  items: PlanningItem[];
  loading: boolean;
  colors: AppColors;
  editingItem: PlanningItem | null;
  editingSlot: string | null;
  inlineEditor: ReactNode;
  onEditItem: (item: PlanningItem, slot: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const limit = { month: 9, quarter: 9, year: 12 }[zoom as 'month' | 'quarter' | 'year'];
  const shownItems = items.slice(0, limit);
  return (
    <>
      {period.eyebrow && <Text style={[styles.eyebrow, { color: colors.red }]}>{period.eyebrow}</Text>}
      <Pressable onPress={() => onOpenDay(period.start)}>
        <View style={styles.periodTitleRow}>
          <Text style={[zoom === 'year' ? styles.yearTitle : styles.periodTitle, { color: colors.text }]}>{period.title}</Text>
          {period.subtitle && <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.subtitle}</Text>}
        </View>
      </Pressable>
      {!loading && !shownItems.length ? <Text style={[styles.empty, { color: colors.tertiary }]}>Open</Text> : shownItems.map((item) => { const slot = `${period.id}-${item.id}`; return <View key={item.id}><CompactItem colors={colors} item={item} onPress={() => onEditItem(item, slot)} />{editingItem?.id === item.id && editingSlot === slot && inlineEditor}</View>; })}
      {items.length > shownItems.length && <Text style={[styles.more, { color: colors.secondary }]}>+{items.length - shownItems.length} more</Text>}
    </>
  );
}

function TimelineSectionHeader({ title, colors, onPress }: { title: string; colors: AppColors; onPress: () => void }) {
  return <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Pressable hitSlop={8} onPress={onPress}><Text style={[styles.sectionAction, { color: colors.blue }]}>Add {title.slice(0, -1).toLowerCase()}</Text></Pressable></View>;
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

function overlaps(item: PlanningItem, period: TimelinePeriod) {
  return item.anchorStart !== null && item.anchorStart <= period.end && (item.anchorEnd ?? item.anchorStart) >= period.start;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, timeline: { flex: 1 }, content: { paddingHorizontal: 18, paddingBottom: 170 },
  period: { paddingTop: 18, paddingBottom: 24, borderTopWidth: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 2 },
  periodTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  periodTitle: { fontSize: 29, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8 },
  yearTitle: { fontSize: 42, lineHeight: 47, fontWeight: '700', letterSpacing: -1.3 }, periodSubtitle: { fontSize: 14, fontWeight: '600' },
  dayEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, dayTitle: { fontSize: 31, fontWeight: '700', letterSpacing: -1, marginTop: 3 }, daySubtitle: { fontSize: 14, marginTop: 3 },
  sectionHeader: { marginTop: 10, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }, sectionAction: { fontSize: 14, fontWeight: '600' },
  timelineItem: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }, eventTime: { width: 68, fontSize: 13, fontVariant: ['tabular-nums'] }, itemRule: { width: 3, height: 25, borderRadius: 2, marginRight: 10 }, itemCopy: { flex: 1, paddingVertical: 6 }, itemTitle: { fontSize: 16, fontWeight: '500' }, itemNote: { fontSize: 12, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, openRow: { height: 42, fontSize: 14, paddingTop: 10 },
  reflection: { marginTop: 12 }, reflectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 }, reflectionBox: { minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' }, reflectionText: { fontSize: 16, lineHeight: 22 },
  weekTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }, weekTitle: { fontSize: 29, fontWeight: '700', letterSpacing: -0.8 }, weekDay: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth }, currentWeekDay: { borderTopWidth: 2 }, weekDayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }, weekDayName: { fontSize: 17, fontWeight: '700' }, weekDayDate: { fontSize: 13, fontWeight: '600' }, weekOpen: { fontSize: 13, paddingVertical: 6 },
  compactItem: { minHeight: 39, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }, compactDate: { width: 72, fontSize: 12, fontVariant: ['tabular-nums'] }, compactTitle: { flex: 1, fontSize: 15, fontWeight: '500' }, empty: { fontSize: 14, marginTop: 10 }, more: { fontSize: 12, fontWeight: '600', marginTop: 7, marginLeft: 85 },
  dock: { position: 'absolute', width: '75%', alignSelf: 'center', bottom: 92, borderRadius: 27, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  homeButton: { position: 'absolute', left: -58, top: 2, width: 50, height: 50, borderRadius: 25, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  homeGlass: { position: 'absolute', inset: 0, borderRadius: 25 },
  dockSurface: { minHeight: 54, borderRadius: 27, overflow: 'hidden' },
  dockGlass: { position: 'absolute', inset: 0, borderRadius: 27 },
  dockContent: { minHeight: 54, flexDirection: 'row', alignItems: 'center', padding: 5, gap: 1 },
  dockButton: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, overflow: 'hidden' },
  activeLens: { position: 'absolute', inset: 0, borderRadius: 22 },
  dockLabel: { fontSize: 11, fontWeight: '700', letterSpacing: -0.2 },
});
