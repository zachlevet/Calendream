import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import type { ItemDraft } from '@/models/planning';
import { formatDestination, formatShortDate } from '@/shared/date';
import type { AppColors } from '@/theme/colors';
import { type CaptureKind, parseQuickCapture } from './parseQuickCapture';

interface QuickCaptureSheetProps {
  colors: AppColors;
  date: string;
  dateLocked?: boolean;
  endDate?: string;
  initialKind?: CaptureKind;
  visible: boolean;
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
}

const KINDS: CaptureKind[] = ['task', 'event', 'trip'];

export function QuickCaptureSheet({ colors, date, dateLocked = false, endDate, initialKind, visible, onClose, onSave }: QuickCaptureSheetProps) {
  const [text, setText] = useState('');
  const [override, setOverride] = useState<CaptureKind | null>(initialKind ?? null);
  const [choosingKind, setChoosingKind] = useState(false);
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseQuickCapture(text, date), [date, text]);
  const kind = override ?? parsed.kind;
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
    setSaving(false);
    onClose();
  }

  async function submit() {
    if (!parsed.title || saving) return;
    setSaving(true);
    await onSave({
      kind: kind === 'task' ? 'task' : 'event',
      title: parsed.title,
      date: captureDate,
      endDate: kind === 'task' ? undefined : captureEndDate,
      time: kind === 'task' ? undefined : parsed.time,
      altitude: kind === 'trip' ? 4 : kind === 'event' ? 1 : 0,
      eventType: kind === 'trip' ? 'trip' : 'event',
    });
    setSaving(false);
    close();
  }

  return (
    <Modal animationType="fade" onRequestClose={close} presentationStyle="overFullScreen" transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <Pressable accessibilityLabel="Close quick capture" onPress={close} style={styles.backdrop} />
        <View style={[styles.sheet, { borderColor: colors.separator }, !glassAvailable && { backgroundColor: fallbackGlass }]}>
          {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.sheetGlass} tintColor={colors.background === '#000000' ? 'rgba(36,36,40,0.78)' : 'rgba(255,255,255,0.78)'} />}
          <View style={styles.handle} />
          <Text style={[styles.heading, { color: colors.text }]}>New item</Text>
          <TextInput
            autoFocus
            multiline
            onChangeText={(value) => {
              setText(value);
              if (!dateLocked) setOverride(null);
            }}
            onSubmitEditing={() => void submit()}
            placeholder={endDate && endDate !== date
              ? `Event from ${formatShortDate(date)}–${formatShortDate(endDate)}`
              : dateLocked ? `Add something on ${formatShortDate(date)}` : 'Morning run at 7 a.m.'}
            placeholderTextColor={colors.tertiary}
            returnKeyType="done"
            style={[styles.input, { color: colors.text }]}
            value={text}
          />

          <View style={styles.footer}>
            <View style={styles.metadata}>
              {(dateLocked || parsed.endDate) && (
                <View style={[styles.datePill, { backgroundColor: colors.card }]}>
                  <Text style={[styles.dateText, { color: colors.secondary }]}>{dateLabel}</Text>
                </View>
              )}
              {parsed.time && kind !== 'task' && <Text style={[styles.time, { color: colors.secondary }]}>{parsed.time}</Text>}
              <Pressable
                accessibilityLabel={`Detected as ${kind}. Tap to change.`}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setChoosingKind((open) => !open);
                }}
                style={[styles.kindOrb, { backgroundColor: kind === 'trip' ? colors.amberSoft : kind === 'event' ? colors.blueSoft : colors.card }]}
              >
                <Text style={[styles.kindText, { color: kind === 'trip' ? colors.amber : kind === 'event' ? colors.blue : colors.secondary }]}>{kind}</Text>
              </Pressable>
              {choosingKind && KINDS.filter((option) => option !== kind).map((option) => (
                <Pressable
                  accessibilityLabel={`Change to ${option}`}
                  key={option}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setOverride(option);
                    setChoosingKind(false);
                  }}
                  style={[styles.kindOrb, {
                    backgroundColor: option === 'trip' ? colors.amberSoft : option === 'event' ? colors.blueSoft : colors.card,
                  }]}
                >
                  <Text style={[styles.kindText, {
                    color: option === 'trip' ? colors.amber : option === 'event' ? colors.blue : colors.secondary,
                  }]}>{option}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityLabel="Save new item"
              disabled={!parsed.title || saving}
              onPress={() => void submit()}
              style={[styles.addButton, { backgroundColor: parsed.title ? colors.red : colors.tertiary }]}
            >
              <Text style={styles.addButtonText}>{saving ? '…' : '↑'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.06)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14, overflow: 'hidden' },
  sheetGlass: { position: 'absolute', inset: 0 },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', alignSelf: 'center', marginBottom: 13 },
  heading: { fontSize: 15, fontWeight: '700' },
  input: { minHeight: 70, maxHeight: 150, paddingTop: 10, paddingBottom: 8, fontSize: 22, lineHeight: 29, fontWeight: '500', textAlignVertical: 'top' },
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
