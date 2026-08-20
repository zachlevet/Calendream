import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import type { ItemDraft, PlanningItem } from '@/models/planning';
import { formatDestination, formatShortDate } from '@/shared/date';
import type { AppColors } from '@/theme/colors';
import { type CaptureKind, parseQuickCapture } from './parseQuickCapture';
import { findAmbiguousTime, resolveAmbiguousTime, type TimePeriod } from './timePeriod';

interface QuickCaptureSheetProps {
  colors: AppColors;
  date: string;
  dateLocked?: boolean;
  endDate?: string;
  initialKind?: CaptureKind;
  visible: boolean;
  onClose: () => void;
  onDeleteItem: (id: string) => Promise<void>;
  onFindRemoval: (query: string, date: string) => Promise<PlanningItem | null>;
  onSave: (draft: ItemDraft) => Promise<void>;
}

const KINDS: CaptureKind[] = ['task', 'event', 'trip'];

export function QuickCaptureSheet({ colors, date, dateLocked = false, endDate, initialKind, visible, onClose, onDeleteItem, onFindRemoval, onSave }: QuickCaptureSheetProps) {
  const [text, setText] = useState('');
  const [override, setOverride] = useState<CaptureKind | null>(initialKind ?? null);
  const [choosingKind, setChoosingKind] = useState(false);
  const [choosingPeriod, setChoosingPeriod] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod | null>(null);
  const [saving, setSaving] = useState(false);
  const ambiguousTime = useMemo(() => findAmbiguousTime(text), [text]);
  const resolvedText = useMemo(() => timePeriod && ambiguousTime ? resolveAmbiguousTime(text, timePeriod) : text, [ambiguousTime, text, timePeriod]);
  const parsed = useMemo(() => parseQuickCapture(resolvedText, date), [date, resolvedText]);
  const kind = override ?? (ambiguousTime ? 'event' : parsed.kind);
  const captureDate = dateLocked ? date : parsed.date;
  const captureEndDate = endDate ?? parsed.endDate;
  const dateLabel = captureEndDate && captureEndDate !== captureDate
    ? `${formatShortDate(captureDate)}–${formatShortDate(captureEndDate)}`
    : formatDestination(captureDate);
  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = colors.background === '#000000' ? 'rgba(28,28,31,0.94)' : 'rgba(252,252,253,0.94)';

  function close() {
    setText('');
    setOverride(null);
    setChoosingKind(false);
    setChoosingPeriod(false);
    setTimePeriod(null);
    setSaving(false);
    onClose();
  }

  async function submit() {
    if (!parsed.title || saving || (ambiguousTime && !timePeriod)) return;
    try {
      setSaving(true);
      if (parsed.action === 'remove') {
        const match = await onFindRemoval(parsed.title, captureDate);
        setSaving(false);
        if (!match) {
          Alert.alert('Nothing found', `Calendream couldn’t find “${parsed.title}” on ${formatShortDate(captureDate)}.`);
          return;
        }
        Alert.alert(`Remove ${match.kind}?`, `“${match.title}” will be removed from ${formatShortDate(captureDate)}.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              setSaving(true);
              void onDeleteItem(match.id)
                .then(close)
                .catch((error) => Alert.alert('Item not removed', readableError(error)))
                .finally(() => setSaving(false));
            },
          },
        ]);
        return;
      }
      await onSave({
        kind: kind === 'task' ? 'task' : 'event',
        title: parsed.title,
        date: captureDate,
        endDate: kind === 'task' ? undefined : captureEndDate,
        time: kind === 'task' ? undefined : parsed.time,
        altitude: kind === 'trip' ? 4 : kind === 'event' ? 1 : 0,
        eventType: kind === 'trip' ? 'trip' : 'event',
      });
      close();
    } catch (error) {
      Alert.alert(parsed.action === 'remove' ? 'Item not removed' : 'Item not saved', readableError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={close} presentationStyle="overFullScreen" transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <Pressable accessibilityLabel="Close quick capture" onPress={close} style={styles.backdrop} />
        <View style={[styles.sheet, { borderColor: colors.separator }, !glassAvailable && { backgroundColor: fallbackGlass }]}>
          {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.sheetGlass} tintColor={colors.background === '#000000' ? 'rgba(36,36,40,0.78)' : 'rgba(255,255,255,0.78)'} />}
          <View style={styles.handle} />
          <Text style={[styles.heading, { color: colors.text }]}>New item</Text>
          <View style={styles.inputArea}>
            <TextInput
              autoFocus
              multiline
              onChangeText={(value) => {
                setText(value);
                setTimePeriod(null);
                setChoosingPeriod(false);
                if (!dateLocked) setOverride(null);
              }}
              onSubmitEditing={() => void submit()}
              placeholder={endDate && endDate !== date
                ? `Event from ${formatShortDate(date)}–${formatShortDate(endDate)}`
                : dateLocked ? `Add something on ${formatShortDate(date)}` : 'Morning run at 7 a.m.'}
              placeholderTextColor={colors.tertiary}
              returnKeyType="done"
              style={[styles.input, { color: colors.text }, ambiguousTime && styles.inputWithPeriod]}
              value={text}
            />
            {ambiguousTime && (
              <View style={styles.periodResolver}>
                {choosingPeriod ? (['AM', 'PM'] as TimePeriod[]).map((period) => (
                  <Pressable
                    accessibilityLabel={`Use ${period} for ${ambiguousTime.display}`}
                    key={period}
                    onPress={() => { setTimePeriod(period); setChoosingPeriod(false); }}
                    style={[styles.periodChoice, { backgroundColor: colors.blue }]}
                  >
                    <Text style={styles.periodChoiceText}>{period}</Text>
                  </Pressable>
                )) : (
                  <Pressable
                    accessibilityLabel={`Choose AM or PM for ${ambiguousTime.display}`}
                    onPress={() => setChoosingPeriod(true)}
                    style={[styles.periodPrompt, { backgroundColor: timePeriod ? colors.blueSoft : colors.card }]}
                  >
                    <Text style={[styles.periodPromptText, { color: timePeriod ? colors.blue : colors.secondary }]}>{timePeriod ?? 'AM or PM?'}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.metadata}>
              {(dateLocked || parsed.endDate) && (
                <View style={[styles.datePill, { backgroundColor: colors.card }]}>
                  <Text style={[styles.dateText, { color: colors.secondary }]}>{dateLabel}</Text>
                </View>
              )}
              {parsed.time && kind !== 'task' && <Text style={[styles.time, { color: colors.secondary }]}>{parsed.time}</Text>}
              {parsed.action === 'create' ? <Pressable
                accessibilityLabel={`Detected as ${kind}. Tap to change.`}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setChoosingKind((open) => !open);
                }}
                style={[styles.kindOrb, { backgroundColor: kind === 'trip' ? colors.orangeSoft : kind === 'event' ? colors.blueSoft : colors.card }]}
              >
                <Text style={[styles.kindText, { color: kind === 'trip' ? colors.orange : kind === 'event' ? colors.blue : colors.secondary }]}>{kind}</Text>
              </Pressable> : (
                <View style={[styles.kindOrb, { backgroundColor: colors.redSoft }]}>
                  <Text style={[styles.kindText, { color: colors.red }]}>remove</Text>
                </View>
              )}
              {parsed.action === 'create' && choosingKind && KINDS.filter((option) => option !== kind).map((option) => (
                <Pressable
                  accessibilityLabel={`Change to ${option}`}
                  key={option}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setOverride(option);
                    setChoosingKind(false);
                  }}
                  style={[styles.kindOrb, {
                    backgroundColor: option === 'trip' ? colors.orangeSoft : option === 'event' ? colors.blueSoft : colors.card,
                  }]}
                >
                  <Text style={[styles.kindText, {
                    color: option === 'trip' ? colors.orange : option === 'event' ? colors.blue : colors.secondary,
                  }]}>{option}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityLabel="Save new item"
              disabled={!parsed.title || saving || Boolean(ambiguousTime && !timePeriod)}
              onPress={() => void submit()}
              style={[styles.addButton, { backgroundColor: parsed.title && !(ambiguousTime && !timePeriod) ? colors.red : colors.tertiary }]}
            >
              <Text style={styles.addButtonText}>{saving ? '…' : parsed.action === 'remove' ? '−' : '↑'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'Something unexpected happened. Please try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.06)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14, overflow: 'hidden' },
  sheetGlass: { position: 'absolute', inset: 0 },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', alignSelf: 'center', marginBottom: 13 },
  heading: { fontSize: 15, fontWeight: '700' },
  inputArea: { position: 'relative' },
  input: { minHeight: 70, maxHeight: 150, paddingTop: 10, paddingBottom: 8, fontSize: 22, lineHeight: 29, fontWeight: '500', textAlignVertical: 'top' },
  inputWithPeriod: { paddingRight: 94 },
  periodResolver: { position: 'absolute', right: 0, bottom: 8, flexDirection: 'row', gap: 5 },
  periodPrompt: { minHeight: 30, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  periodPromptText: { fontSize: 12, fontWeight: '800' },
  periodChoice: { minWidth: 38, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  periodChoiceText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  footer: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metadata: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  datePill: { minHeight: 29, borderRadius: 15, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  kindOrb: { minHeight: 29, borderRadius: 15, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  kindText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  addButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 22, lineHeight: 23, fontWeight: '700' },
});
