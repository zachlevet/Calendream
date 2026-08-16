import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlanningItem, TimelineSnapshot } from '@/models/planning';
import { addLocalDays, dateFromISO } from '@/shared/date';
import { eventPhase, timeMinutes } from '@/shared/time';
import { orderedWeekdayLabels } from '@/shared/week';
import type { AppColors } from '@/theme/colors';
import { buildCalendarMonth, calendarMonthBounds, orderedCalendarRange } from './compactCalendar';

const DAY_HEIGHT = 40;

interface CompactCalendarOverlayProps {
  colors: AppColors;
  dataRevision: number;
  initialDate: string;
  loadRange: (startDate: string, endDate: string) => Promise<TimelineSnapshot>;
  onAddDate: (date: string) => void;
  onClose: () => void;
  onSelectRange: (startDate: string, endDate: string) => void;
  onViewDate: (date: string) => void;
  selectedStartDate?: string;
  selectedEndDate?: string;
  today: string;
}

export function CompactCalendarOverlay({ colors, dataRevision, initialDate, loadRange, onAddDate, onClose, onSelectRange, onViewDate, selectedStartDate, selectedEndDate, today }: CompactCalendarOverlayProps) {
  const insets = useSafeAreaInsets();
  const initial = dateFromISO(initialDate);
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [eventDates, setEventDates] = useState<Set<string>>(() => new Set());
  const [monthItems, setMonthItems] = useState<PlanningItem[]>([]);
  const [gridWidth, setGridWidth] = useState(0);
  const [selection, setSelection] = useState<{ first: number; last: number } | null>(null);
  const [actionDate, setActionDate] = useState<string | null>(null);
  const cells = useMemo(() => buildCalendarMonth(month), [month]);
  const bounds = useMemo(() => calendarMonthBounds(month), [month]);
  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = colors.background === '#000000' ? 'rgba(36,36,40,0.92)' : 'rgba(250,250,252,0.92)';

  useEffect(() => {
    let active = true;
    void loadRange(bounds.start, bounds.end).then((snapshot) => {
      if (!active) return;
      const marked = new Set<string>();
      snapshot.items.filter((item) => item.kind === 'event' && item.anchorStart).forEach((item) => {
        let date = item.anchorStart! < bounds.start ? bounds.start : item.anchorStart!;
        const end = (item.anchorEnd ?? item.anchorStart!) > bounds.end ? bounds.end : (item.anchorEnd ?? item.anchorStart!);
        while (date <= end) {
          marked.add(date);
          date = addLocalDays(date, 1);
        }
      });
      setEventDates(marked);
      setMonthItems(snapshot.items);
    });
    return () => { active = false; };
  }, [bounds.end, bounds.start, dataRevision, loadRange]);

  const indexAtPoint = useCallback((x: number, y: number) => {
    if (gridWidth <= 0) return null;
    const column = Math.max(0, Math.min(6, Math.floor(x / (gridWidth / 7))));
    const row = Math.max(0, Math.min(5, Math.floor(y / DAY_HEIGHT)));
    const index = row * 7 + column;
    return cells[index]?.date ? index : null;
  }, [cells, gridWidth]);

  const rangeGesture = useMemo(() => {
    return Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(320)
      .minDistance(3)
      .onStart((event) => {
        const index = indexAtPoint(event.x, event.y);
        if (index === null) return;
        setSelection({ first: index, last: index });
      })
      .onUpdate((event) => {
        const firstIndex = indexAtPoint(event.x - event.translationX, event.y - event.translationY);
        const lastIndex = indexAtPoint(event.x, event.y);
        if (firstIndex === null || lastIndex === null) return;
        setSelection({ first: firstIndex, last: lastIndex });
      })
      .onEnd((event) => {
        const firstIndex = indexAtPoint(event.x - event.translationX, event.y - event.translationY);
        const lastIndex = indexAtPoint(event.x, event.y);
        if (firstIndex === null || lastIndex === null) return;
        const range = orderedCalendarRange(cells, firstIndex, lastIndex);
        if (!range) return;
        if (range.start === range.end) setActionDate(range.start);
        else {
          setActionDate(null);
          onSelectRange(range.start, range.end);
        }
        setTimeout(() => setSelection(null), 350);
      });
  }, [cells, indexAtPoint, onSelectRange]);
  const calendarGesture = Gesture.Simultaneous(rangeGesture, Gesture.Native());
  const committedSelection = useMemo(() => {
    if (!selectedStartDate) return null;
    const endDate = selectedEndDate ?? selectedStartDate;
    const selectedIndices = cells
      .map((cell, index) => cell.date && cell.date >= selectedStartDate && cell.date <= endDate ? index : -1)
      .filter((index) => index >= 0);
    if (!selectedIndices.length) return null;
    return { first: selectedIndices[0], last: selectedIndices[selectedIndices.length - 1] };
  }, [cells, selectedEndDate, selectedStartDate]);
  const activeSelection = selection ?? committedSelection;
  const actionIndex = actionDate ? cells.findIndex((cell) => cell.date === actionDate) : -1;
  const selectionStart = activeSelection ? Math.min(activeSelection.first, activeSelection.last) : actionIndex;
  const selectionEnd = activeSelection ? Math.max(activeSelection.first, activeSelection.last) : actionIndex;
  const previewEvents = useMemo(() => {
    if (!actionDate) return [];
    return monthItems
      .filter((item) => item.kind === 'event' && item.anchorStart && item.anchorStart <= actionDate && (item.anchorEnd ?? item.anchorStart) >= actionDate)
      .sort((a, b) => timeMinutes(a.startTime) - timeMinutes(b.startTime) || (a.anchorStart ?? '').localeCompare(b.anchorStart ?? ''));
  }, [actionDate, monthItems]);

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 44 }]}>
      <Pressable accessibilityLabel="Close calendar" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.panel, !glassAvailable && { backgroundColor: fallbackGlass }]}>
        {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.glass} tintColor={colors.background === '#000000' ? 'rgba(44,44,48,0.5)' : 'rgba(255,255,255,0.3)'} />}
        <View style={styles.header}>
          <Pressable accessibilityLabel="Previous month" hitSlop={10} onPress={() => { setActionDate(null); setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)); }} style={styles.monthButton}><Text style={[styles.chevron, { color: colors.blue }]}>‹</Text></Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>{new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month)}</Text>
          <Pressable accessibilityLabel="Next month" hitSlop={10} onPress={() => { setActionDate(null); setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)); }} style={styles.monthButton}><Text style={[styles.chevron, { color: colors.blue }]}>›</Text></Pressable>
        </View>
        <View style={styles.weekdays}>{orderedWeekdayLabels().map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekday, { color: colors.secondary }]}>{label}</Text>)}</View>
        <GestureDetector gesture={calendarGesture}>
          <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={styles.grid}>
            {cells.map((cell, index) => {
              const selected = index >= selectionStart && index <= selectionEnd && Boolean(cell.date);
              const first = selected && index === selectionStart;
              const last = selected && index === selectionEnd;
              const current = cell.date === today;
              return (
                <Pressable accessibilityLabel={cell.date ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromISO(cell.date)) : undefined} disabled={!cell.date} key={`${cell.date ?? 'empty'}-${index}`} onPress={() => { if (!selection && cell.date) setActionDate(cell.date); }} style={styles.dayCell}>
                  {selected && <View style={[styles.rangeFill, { backgroundColor: colors.blueSoft }, first && styles.rangeFirst, last && styles.rangeLast]} />}
                  {current && !selected && <View style={[styles.todayCircle, { borderColor: colors.red }]} />}
                  <Text style={[styles.dayNumber, { color: selected ? colors.blue : cell.date ? colors.text : 'transparent' }, current && !selected && { color: colors.red, fontWeight: '800' }]}>{cell.day ?? ''}</Text>
                  {cell.date && eventDates.has(cell.date) && <View style={[styles.eventDot, { backgroundColor: colors.blue }]} />}
                </Pressable>
              );
            })}
          </View>
        </GestureDetector>
        {actionDate ? (
          <View style={[styles.actionStrip, { borderColor: colors.separator }]}>
            <View style={styles.actionHeader}>
              <Text numberOfLines={1} style={[styles.actionDate, { color: colors.text }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(dateFromISO(actionDate))}</Text>
              <View style={styles.actionButtons}>
                <Pressable accessibilityLabel={`View ${actionDate}`} onPress={() => onViewDate(actionDate)} style={[styles.viewButton, { backgroundColor: colors.card }]}><Text style={[styles.viewButtonText, { color: colors.blue }]}>View day</Text></Pressable>
                <Pressable accessibilityLabel={`Add on ${actionDate}`} onPress={() => onAddDate(actionDate)} style={[styles.addButton, { backgroundColor: colors.blue }]}><Text style={styles.addButtonText}>＋ Add</Text></Pressable>
              </View>
            </View>
            <View style={styles.previewList}>
              {previewEvents.length ? previewEvents.slice(0, 3).map((item) => <CalendarPreviewEvent colors={colors} item={item} key={item.id} />) : <Text style={[styles.previewEmpty, { color: colors.tertiary }]}>Nothing planned yet</Text>}
              {previewEvents.length > 3 && <Text style={[styles.previewMore, { color: colors.secondary }]}>+{previewEvents.length - 3} more</Text>}
            </View>
          </View>
        ) : <Text style={[styles.hint, { color: colors.tertiary }]}>Tap a day to select · hold and drag for a trip</Text>}
      </View>
    </View>
  );
}

function CalendarPreviewEvent({ item, colors }: { item: PlanningItem; colors: AppColors }) {
  const trip = item.eventType === 'trip' || Boolean(item.anchorStart && item.anchorEnd && item.anchorEnd > item.anchorStart);
  const past = eventPhase(item) === 'past';
  const accent = past ? colors.tertiary : trip ? colors.orange : colors.blue;
  return (
    <View style={styles.previewRow}>
      <View style={[trip ? styles.previewTripMark : styles.previewEventDot, { backgroundColor: accent }]} />
      <Text numberOfLines={1} style={[styles.previewTitle, { color: past ? colors.secondary : colors.text }]}>{item.title}</Text>
      <Text style={[styles.previewMeta, { color: trip ? accent : colors.secondary }]}>{item.startTime ?? (trip ? 'Trip' : 'All day')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', zIndex: 40, left: 0, right: 0, bottom: 78 },
  backdrop: { position: 'absolute', inset: 0 },
  panel: { marginHorizontal: 10, borderRadius: 24, overflow: 'hidden', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 9, shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  glass: { position: 'absolute', inset: 0, borderRadius: 24 },
  header: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  chevron: { fontSize: 29, lineHeight: 31, fontWeight: '400' },
  monthTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  weekdays: { height: 22, flexDirection: 'row', alignItems: 'center' },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 9, fontWeight: '800' },
  grid: { height: DAY_HEIGHT * 6, flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', height: DAY_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  rangeFill: { position: 'absolute', left: 0, right: 0, top: 4, bottom: 4 },
  rangeFirst: { borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  rangeLast: { borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  todayCircle: { position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 1.5 },
  dayNumber: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  eventDot: { position: 'absolute', bottom: 0, width: 4, height: 4, borderRadius: 2 },
  hint: { textAlign: 'center', fontSize: 10, fontWeight: '600', marginTop: 2 },
  actionStrip: { minHeight: 43, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, marginTop: 3 },
  actionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionDate: { flex: 1, fontSize: 12, fontWeight: '700' },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewButton: { height: 30, borderRadius: 15, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  viewButtonText: { fontSize: 11, fontWeight: '700' },
  addButton: { height: 30, borderRadius: 15, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  previewList: { paddingTop: 5 },
  previewRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center' },
  previewEventDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 5, marginRight: 9 },
  previewTripMark: { width: 3, height: 18, borderRadius: 2, marginHorizontal: 6, marginRight: 10 },
  previewTitle: { flex: 1, fontSize: 12, fontWeight: '600' },
  previewMeta: { marginLeft: 8, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  previewEmpty: { minHeight: 27, paddingTop: 6, fontSize: 11 },
  previewMore: { paddingLeft: 20, paddingTop: 2, paddingBottom: 2, fontSize: 10, fontWeight: '600' },
});
