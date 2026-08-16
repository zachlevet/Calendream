import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { PlanningItem, TimelineZoom } from '@/models/planning';
import { formatShortDate } from '@/shared/date';
import type { AppColors } from '@/theme/colors';
import { buildTimelinePeriods, isVisibleAtZoom, type TimelinePeriod } from './periods';

interface TimelineScreenProps {
  colors: AppColors;
  dataRevision: number;
  today: string;
  loadRange: (startDate: string, endDate: string) => Promise<PlanningItem[]>;
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
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinchScale] = useState(() => new Animated.Value(1));
  const periods = useMemo(() => buildTimelinePeriods(zoom, today), [today, zoom]);
  const firstDate = periods[0].start;
  const lastDate = periods[periods.length - 1].end;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadRange(firstDate, lastDate).then((nextItems) => {
        if (cancelled) return;
        setItems(nextItems);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoom(nextZoom);
  }, [zoom]);

  const pinch = useMemo(() => Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((event) => pinchScale.setValue(Math.max(0.82, Math.min(1.18, event.scale))))
    .onEnd((event) => {
      const index = ZOOM_LEVELS.findIndex((level) => level.id === zoom);
      if (event.scale < 0.88 && index < ZOOM_LEVELS.length - 1) changeZoom(ZOOM_LEVELS[index + 1].id);
      if (event.scale > 1.12 && index > 0) changeZoom(ZOOM_LEVELS[index - 1].id);
      Animated.timing(pinchScale, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    })
    .onFinalize(() => Animated.timing(pinchScale, { toValue: 1, duration: 220, useNativeDriver: true }).start()), [changeZoom, pinchScale, zoom]);

  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

  return (
    <View style={styles.screen}>
      <GestureDetector gesture={pinch}>
        <Animated.View style={[styles.timeline, { transform: [{ scale: pinchScale }] }]}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {periods.map((period) => (
              <Period
                colors={colors}
                items={items}
                key={period.id}
                loading={loading}
                onEditItem={onEditItem}
                onOpenDay={onOpenDay}
                period={period}
                zoom={zoom}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </GestureDetector>

      <View style={[styles.dock, !glassAvailable && { backgroundColor: colors.chrome, borderColor: colors.separator }]}> 
        {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.dockGlass} />}
        <View style={styles.dockContent}>
          {ZOOM_LEVELS.map((level) => {
            const active = level.id === zoom;
            return (
              <Pressable
                accessibilityLabel={`${level.label} timeline view`}
                key={level.id}
                onPress={() => changeZoom(level.id)}
                style={[styles.dockButton, active && { backgroundColor: colors.blue }]}
              >
                <Text style={[styles.dockLabel, { color: active ? '#FFFFFF' : colors.secondary }]}>{level.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Period({ period, zoom, items, loading, colors, onEditItem, onOpenDay }: {
  period: TimelinePeriod;
  zoom: TimelineZoom;
  items: PlanningItem[];
  loading: boolean;
  colors: AppColors;
  onEditItem: (item: PlanningItem) => void;
  onOpenDay: (date: string) => void;
}) {
  const visibleItems = items.filter((item) => (
    item.anchorStart !== null
    && item.anchorStart <= period.end
    && (item.anchorEnd ?? item.anchorStart) >= period.start
    && isVisibleAtZoom(item, zoom)
  ));
  const limit = { today: 12, week: 10, month: 7, quarter: 6, year: 8 }[zoom];
  const shownItems = visibleItems.slice(0, limit);

  return (
    <View style={[styles.period, { borderColor: colors.separator }]}> 
      {period.eyebrow && <Text style={[styles.eyebrow, { color: colors.red }]}>{period.eyebrow}</Text>}
      <Pressable onPress={() => onOpenDay(period.start)}>
        <View style={styles.periodTitleRow}>
          <Text style={[zoom === 'year' ? styles.yearTitle : styles.periodTitle, { color: colors.text }]}>{period.title}</Text>
          {period.subtitle && <Text style={[styles.periodSubtitle, { color: colors.secondary }]}>{period.subtitle}</Text>}
        </View>
      </Pressable>

      {!loading && shownItems.length === 0 ? (
        <Text style={[styles.empty, { color: colors.tertiary }]}>Open</Text>
      ) : shownItems.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onEditItem(item)}
          style={({ pressed }) => [styles.itemRow, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}
        >
          <Text style={[styles.itemDate, { color: colors.secondary }]}>
            {item.startTime ?? (item.anchorStart === period.start ? 'All day' : formatShortDate(item.anchorStart))}
          </Text>
          <View style={[styles.itemRule, { backgroundColor: item.altitude >= 4 ? colors.amber : item.kind === 'event' ? colors.blue : colors.tertiary }]} />
          <Text numberOfLines={1} style={[styles.itemTitle, { color: item.completed ? colors.tertiary : colors.text }]}>{item.title}</Text>
        </Pressable>
      ))}
      {visibleItems.length > shownItems.length && (
        <Text style={[styles.more, { color: colors.secondary }]}>+{visibleItems.length - shownItems.length} more</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  timeline: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 170 },
  period: { paddingTop: 18, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 2 },
  periodTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  periodTitle: { fontSize: 29, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8 },
  yearTitle: { fontSize: 42, lineHeight: 47, fontWeight: '700', letterSpacing: -1.3 },
  periodSubtitle: { fontSize: 14, fontWeight: '600' },
  empty: { fontSize: 14, marginTop: 10 },
  itemRow: { minHeight: 42, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  itemDate: { width: 72, fontSize: 12, fontVariant: ['tabular-nums'] },
  itemRule: { width: 3, height: 24, borderRadius: 2, marginRight: 10 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '500' },
  more: { fontSize: 12, fontWeight: '600', marginTop: 7, marginLeft: 85 },
  dock: { position: 'absolute', left: 10, right: 10, bottom: 88, minHeight: 54, borderRadius: 27, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  dockGlass: { position: 'absolute', inset: 0, borderRadius: 27 },
  dockContent: { minHeight: 54, flexDirection: 'row', alignItems: 'center', padding: 5, gap: 2 },
  dockButton: { flex: 1, minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dockLabel: { fontSize: 11, fontWeight: '700' },
});
