import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { TimelineSnapshot } from '@/models/planning';
import { addLocalDays, dateFromISO } from '@/shared/date';
import { orderedWeekdayLabels } from '@/shared/week';
import type { AppColors } from '@/theme/colors';
import { buildCalendarMonth, calendarMonthBounds, orderedCalendarRange } from './compactCalendar';

const DAY_HEIGHT = 40;

interface CompactCalendarOverlayProps {
  colors: AppColors;
  dataRevision: number;
  initialDate: string;
  loadRange: (startDate: string, endDate: string) => Promise<TimelineSnapshot>;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  onSelectRange: (startDate: string, endDate: string) => void;
  today: string;
}

export function CompactCalendarOverlay({ colors, dataRevision, initialDate, loadRange, onClose, onSelectDate, onSelectRange, today }: CompactCalendarOverlayProps) {
  const initial = dateFromISO(initialDate);
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [eventDates, setEventDates] = useState<Set<string>>(() => new Set());
  const [gridWidth, setGridWidth] = useState(0);
  const [selection, setSelection] = useState<{ first: number; last: number } | null>(null);
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
        if (range.start === range.end) onSelectDate(range.start);
        else onSelectRange(range.start, range.end);
        setTimeout(() => setSelection(null), 350);
      });
  }, [cells, indexAtPoint, onSelectDate, onSelectRange]);
  const calendarGesture = Gesture.Simultaneous(rangeGesture, Gesture.Native());
  const selectionStart = selection ? Math.min(selection.first, selection.last) : -1;
  const selectionEnd = selection ? Math.max(selection.first, selection.last) : -1;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable accessibilityLabel="Close calendar" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.panel, !glassAvailable && { backgroundColor: fallbackGlass }]}>
        {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.glass} tintColor={colors.background === '#000000' ? 'rgba(44,44,48,0.5)' : 'rgba(255,255,255,0.3)'} />}
        <View style={styles.header}>
          <Pressable accessibilityLabel="Previous month" hitSlop={10} onPress={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={styles.monthButton}><Text style={[styles.chevron, { color: colors.blue }]}>‹</Text></Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>{new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month)}</Text>
          <Pressable accessibilityLabel="Next month" hitSlop={10} onPress={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={styles.monthButton}><Text style={[styles.chevron, { color: colors.blue }]}>›</Text></Pressable>
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
                <Pressable accessibilityLabel={cell.date ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromISO(cell.date)) : undefined} disabled={!cell.date} key={`${cell.date ?? 'empty'}-${index}`} onPress={() => { if (!selection && cell.date) onSelectDate(cell.date); }} style={styles.dayCell}>
                  {selected && <View style={[styles.rangeFill, { backgroundColor: colors.blueSoft }, first && styles.rangeFirst, last && styles.rangeLast]} />}
                  {current && !selected && <View style={[styles.todayCircle, { borderColor: colors.red }]} />}
                  <Text style={[styles.dayNumber, { color: selected ? colors.blue : cell.date ? colors.text : 'transparent' }, current && !selected && { color: colors.red, fontWeight: '800' }]}>{cell.day ?? ''}</Text>
                  {cell.date && eventDates.has(cell.date) && <View style={[styles.eventDot, { backgroundColor: colors.blue }]} />}
                </Pressable>
              );
            })}
          </View>
        </GestureDetector>
        <Text style={[styles.hint, { color: colors.tertiary }]}>Tap a day to add · hold and drag for a trip</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', zIndex: 40, top: 48, left: 0, right: 0, bottom: 78 },
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
});
