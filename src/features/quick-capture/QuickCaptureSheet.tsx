import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ItemDraft } from '@/models/planning';
import type { AppColors } from '@/theme/colors';
import { type CaptureKind, parseQuickCapture } from './parseQuickCapture';

interface QuickCaptureSheetProps {
  colors: AppColors;
  date: string;
  visible: boolean;
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
}

const KINDS: CaptureKind[] = ['task', 'event', 'trip'];

export function QuickCaptureSheet({ colors, date, visible, onClose, onSave }: QuickCaptureSheetProps) {
  const [text, setText] = useState('');
  const [override, setOverride] = useState<CaptureKind | null>(null);
  const [choosingKind, setChoosingKind] = useState(false);
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseQuickCapture(text, date), [date, text]);
  const kind = override ?? parsed.kind;

  function close() {
    setText('');
    setOverride(null);
    setChoosingKind(false);
    onClose();
  }

  async function submit() {
    if (!parsed.title || saving) return;
    setSaving(true);
    await onSave({
      kind: kind === 'task' ? 'task' : 'event',
      title: parsed.title,
      date: parsed.date,
      time: kind === 'task' ? undefined : parsed.time,
      altitude: kind === 'trip' ? 4 : kind === 'event' ? 1 : 0,
    });
    setSaving(false);
    close();
  }

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <Pressable accessibilityLabel="Close quick capture" onPress={close} style={styles.backdrop} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.separator }]}> 
          <View style={styles.handle} />
          <Text style={[styles.heading, { color: colors.text }]}>New item</Text>
          <TextInput
            autoFocus
            multiline
            onChangeText={(value) => {
              setText(value);
              setOverride(null);
            }}
            onSubmitEditing={() => void submit()}
            placeholder="Morning run at 7 a.m."
            placeholderTextColor={colors.tertiary}
            returnKeyType="done"
            style={[styles.input, { color: colors.text }]}
            value={text}
          />

          <View style={styles.footer}>
            <View style={styles.metadata}>
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
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.16)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', alignSelf: 'center', marginBottom: 13 },
  heading: { fontSize: 15, fontWeight: '700' },
  input: { minHeight: 70, maxHeight: 150, paddingTop: 10, paddingBottom: 8, fontSize: 22, lineHeight: 29, fontWeight: '500', textAlignVertical: 'top' },
  footer: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metadata: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  kindOrb: { minHeight: 29, borderRadius: 15, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  kindText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  addButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 22, lineHeight: 23, fontWeight: '700' },
});
