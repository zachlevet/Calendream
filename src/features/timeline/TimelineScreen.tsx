import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { PlanningItem, TimelineSnapshot, TimelineZoom } from '@/models/planning';
import { addLocalDays, dateFromISO, formatShortDate } from '@/shared/date';
import type { AppColors } from '@/theme/colors';
import { buildTimelinePeriods, isVisibleAtZoom, isoWeekNumber, type TimelinePeriod } from './periods';

interface TimelineScreenProps {
  colors: AppColors;
  dataRevision: number;
  today: string;
  loadRange: (startDate: string, endDate: string) => Promise<TimelineSnapshot>;
  onEditItem: (item: PlanningItem) => void;
  onOpenDay: (date: string) => void;
}

const ZOOM_LEVELS: { id: TimelineZoom; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
];

export function TimelineScreen({ colors, dataRevision, today, loadRange, onEditItem, onOpenDay }: TimelineScreenProps) {
  const [zoom, setZoom] = useState<TimelineZoom>('today');
  const [snapshot, setSnapshot] = useState<TimelineSnapshot>({ items: [], reflections: {} });
  const [loading, setLoading] = useState(true);
  const [pinchScale] = useState(() => new Animated.Value(1));
  const [dockScale] = useState(() => new Animated.Value(1));
  const scroll = useRef<ScrollView>(null);
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

  const changeZoom = useCallback((nextZoom: TimelineZoom) => {
    if (nextZoom === zoom) return;
    alignedZoom.current = null;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoom(nextZoom);
  }, [zoom]);

  const alignCurrentPeriod = useCallback((y: number) => {
    if (alignedZoom.current === zoom) return;
    alignedZoom.current = zoom;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 2), animated: false }), 20);
  }, [zoom]);

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

  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = colors.background === '#000000' ? 'rgba(34,34,38,0.72)' : 'rgba(248,248,250,0.72)';
  const animateDock = (toValue: number) => Animated.spring(dockScale, {
    toValue,
    damping: 18,
    stiffness: 260,
    mass: 0.55,
    useNativeDriver: true,
  }).start();

  return (
    <View style={styles.screen}>
      <GestureDetector gesture={pinch}>
        <Animated.View style={[styles.timeline, { transform: [{ scale: pinchScale }] }]}>
          <ScrollView ref={scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {periods.map((period) => (
              <Period
                colors={colors}
                items={snapshot.items}
                key={period.id}
                loading={loading}
                onCurrentLayout={alignCurrentPeriod}
                onEditItem={onEditItem}
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

      <Animated.View style={[styles.dock, { transform: [{ scale: dockScale }] }]}>
        <View style={[styles.dockSurface, !glassAvailable && { backgroundColor: fallbackGlass, borderColor: colors.background === '#000000' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.82)' }]}>
          {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.dockGlass} />}
          <View style={styles.dockContent}>
            {ZOOM_LEVELS.map((level) => {
              const active = level.id === zoom;
              return (
                <Pressable
                  accessibilityLabel={`${level.label} timeline view`}
                  key={level.id}
                  onPress={() => changeZoom(level.id)}
                  onPressIn={() => animateDock(1.045)}
                  onPressOut={() => animateDock(1)}
                  style={[styles.dockButton, active && { backgroundColor: colors.blue }]}
                >
                  <Text numberOfLines={1} style={[styles.dockLabel, { color: active ? '#FFFFFF' : colors.secondary }]}>{level.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function Period({ period, zoom, items, loading, reflection, today, colors, onCurrentLayout, onEditItem, onOpenDay }: {
  period: TimelinePeriod;
  zoom: TimelineZoom;
  items: PlanningItem[];
  loading: boolean;
  reflection?: string;
  today: string;
  colors: AppColors;
  onCurrentLayout: (y: number) => void;
  onEditItem: (item: PlanningItem) => void;
  onOpenDay: (date: string) => void;
}) {
  const visibleItems = items.filter((item) => overlaps(item, period) && isVisibleAtZoom(item, zoom));
  const presentStyle = period.current ? { borderTopColor: colors.red, borderTopWidth: 2 } : { borderTopColor: colors.separator };
  const shared = { colors, onEditItem };

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

function DayPage({ date, period, items, reflection, today, colors, onEditItem, onOpenDay }: {
  date: string;
  period: TimelinePeriod;
  items: PlanningItem[];
  reflection?: string;
  today: string;
  colors: AppColors;
  onEditItem: (item: PlanningItem) => void;
  onOpenDay: (date: string) => void;
}) {
  const events = items.filter((item) => item.kind === 'event');
  const tasks = items.filter((item) => item.kind === 'task');
  return (
    <>
      <Text style={[styles.dayEyebrow, { color: period.current ? colors.red : colors.secondary }]}>{period.eyebrow}</Text>
      <Pressable onPress={() => onOpenDay(date)}>
        <Text style={[styles.dayTitle, { color: colors.text }]}>{period.title}</Text>
        {period.subtitle && <Text style={[styles.daySubtitle, { color: colors.secondary }]}>{period.subtitle}</Text>}
      </Pressable>

      <TimelineSectionHeader colors={colors} onPress={() => onOpenDay(date)} title="Events" />
      {events.length ? events.map((item) => <TimelineItem colors={colors} item={item} key={item.id} onPress={() => onEditItem(item)} />) : <Text style={[styles.openRow, { color: colors.tertiary }]}>No events planned</Text>}
      <TimelineSectionHeader colors={colors} onPress={() => onOpenDay(date)} title="Tasks" />
      {tasks.length ? tasks.map((item) => <TimelineItem colors={colors} item={item} key={item.id} onPress={() => onEditItem(item)} />) : <Text style={[styles.openRow, { color: colors.tertiary }]}>No tasks yet</Text>}

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

function WeekPage({ period, items, today, colors, onEditItem, onOpenDay }: {
  period: TimelinePeriod;
  items: PlanningItem[];
  today: string;
  colors: AppColors;
  onEditItem: (item: PlanningItem) => void;
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
            {dayItems.length ? dayItems.map((item) => <CompactItem colors={colors} item={item} key={`${date}-${item.id}`} onPress={() => onEditItem(item)} />) : <Text style={[styles.weekOpen, { color: colors.tertiary }]}>Open</Text>}
          </View>
        );
      })}
    </>
  );
}

function CoarsePeriod({ period, zoom, items, loading, colors, onEditItem, onOpenDay }: {
  period: TimelinePeriod;
  zoom: TimelineZoom;
  items: PlanningItem[];
  loading: boolean;
  colors: AppColors;
  onEditItem: (item: PlanningItem) => void;
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
      {!loading && !shownItems.length ? <Text style={[styles.empty, { color: colors.tertiary }]}>Open</Text> : shownItems.map((item) => <CompactItem colors={colors} item={item} key={item.id} onPress={() => onEditItem(item)} />)}
      {items.length > shownItems.length && <Text style={[styles.more, { color: colors.secondary }]}>+{items.length - shownItems.length} more</Text>}
    </>
  );
}

function TimelineSectionHeader({ title, colors, onPress }: { title: string; colors: AppColors; onPress: () => void }) {
  return <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Pressable hitSlop={8} onPress={onPress}><Text style={[styles.sectionAction, { color: colors.blue }]}>Add {title.slice(0, -1).toLowerCase()}</Text></Pressable></View>;
}

function TimelineItem({ item, colors, onPress }: { item: PlanningItem; colors: AppColors; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.timelineItem, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}>{item.kind === 'task' ? <View style={[styles.checkbox, { borderColor: item.completed ? colors.blue : colors.tertiary }, item.completed && { backgroundColor: colors.blue }]}>{item.completed && <Text style={styles.checkmark}>✓</Text>}</View> : <><Text style={[styles.eventTime, { color: colors.secondary }]}>{item.startTime || 'All day'}</Text><View style={[styles.itemRule, { backgroundColor: item.altitude >= 4 ? colors.amber : colors.blue }]} /></>}<View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: item.completed ? colors.tertiary : colors.text }]}>{item.title}</Text>{item.notes && <Text numberOfLines={1} style={[styles.itemNote, { color: colors.secondary }]}>{item.notes}</Text>}</View></Pressable>;
}

function CompactItem({ item, colors, onPress }: { item: PlanningItem; colors: AppColors; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.compactItem, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}><Text style={[styles.compactDate, { color: colors.secondary }]}>{item.startTime ?? formatShortDate(item.anchorStart)}</Text><View style={[styles.itemRule, { backgroundColor: item.altitude >= 4 ? colors.amber : item.kind === 'event' ? colors.blue : colors.tertiary }]} /><Text numberOfLines={1} style={[styles.compactTitle, { color: item.completed ? colors.tertiary : colors.text }]}>{item.title}</Text></Pressable>;
}

function overlaps(item: PlanningItem, period: TimelinePeriod) {
  return item.anchorStart !== null && item.anchorStart <= period.end && (item.anchorEnd ?? item.anchorStart) >= period.start;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, timeline: { flex: 1 }, content: { paddingHorizontal: 18, paddingBottom: 170 },
  period: { paddingTop: 16, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth },
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
  dock: { position: 'absolute', width: '58%', alignSelf: 'center', bottom: 92, borderRadius: 23, shadowColor: '#000000', shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 8 },
  dockSurface: { minHeight: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  dockGlass: { position: 'absolute', inset: 0, borderRadius: 23 },
  dockContent: { minHeight: 46, flexDirection: 'row', alignItems: 'center', padding: 4, gap: 1 },
  dockButton: { flex: 1, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  dockLabel: { fontSize: 9, fontWeight: '700', letterSpacing: -0.15 },
});
