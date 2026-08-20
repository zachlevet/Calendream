import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, LayoutAnimation, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppColors } from '@/theme/colors';

type ReflectionMode = 'notes' | 'gratitude' | 'reflect' | 'dream';

interface DailyReflectionProps {
  date: string;
  today: string;
  value: string;
  colors: AppColors;
  savedToLibrary: boolean;
  onChange: (value: string) => void;
  onReveal: (y: number, height: number) => void;
  onSave: (value: string) => void | Promise<void>;
  onSaveToLibrary: (value: string) => void | Promise<void>;
}

export function DailyReflection({
  date,
  today,
  value,
  colors,
  savedToLibrary,
  onChange,
  onReveal,
  onSave,
  onSaveToLibrary,
}: DailyReflectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ReflectionMode | null>(null);
  const [saveError, setSaveError] = useState(false);
  const reflectionLayout = useRef({ y: 0, height: 0 });
  const latestValue = useRef(value);
  const lastQueuedValue = useRef(value);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const hour = new Date().getHours();
  const context = date < today ? 'Looking back' : date > today ? 'Planning ahead' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const modes: { id: ReflectionMode; label: string; prompt?: string; soft: string; accent: string }[] = [
    { id: 'notes', label: 'Notes', soft: colors.card, accent: colors.text },
    { id: 'gratitude', label: 'Gratitude', prompt: 'What felt unexpectedly good today?', soft: colors.purpleSoft, accent: colors.purple },
    { id: 'reflect', label: 'Reflect', prompt: 'What gave you energy? What took it away?', soft: colors.blueSoft, accent: colors.blue },
    { id: 'dream', label: 'Dream', prompt: 'What are you excited to move toward?', soft: colors.amberSoft, accent: colors.amber },
  ];
  const activeMode = modes.find((item) => item.id === mode);

  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  const persist = useCallback((nextValue: string) => {
    if (nextValue === lastQueuedValue.current) return saveQueue.current;
    lastQueuedValue.current = nextValue;
    setSaveError(false);
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => onSave(nextValue))
      .then(() => undefined)
      .catch(() => {
        setSaveError(true);
      });
    return saveQueue.current;
  }, [onSave]);

  useEffect(() => {
    const timer = setTimeout(() => void persist(value), 650);
    return () => clearTimeout(timer);
  }, [persist, value]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') void persist(latestValue.current);
    });
    return () => {
      subscription.remove();
      void persist(latestValue.current);
    };
  }, [persist]);

  function beginWriting() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(true);
    setTimeout(() => onReveal(reflectionLayout.current.y, reflectionLayout.current.height), 40);
  }

  function chooseMode(nextMode: ReflectionMode) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(nextMode);
    setExpanded(true);
  }

  function finish() {
    void persist(value);
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(false);
  }

  return (
    <View
      onLayout={(event) => {
        reflectionLayout.current = event.nativeEvent.layout;
        if (expanded) setTimeout(() => onReveal(reflectionLayout.current.y, reflectionLayout.current.height), 30);
      }}
      style={styles.section}
    >
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.text }]}>Daily Reflection</Text>
        <Text style={[styles.context, { color: colors.tertiary }]}>{context}</Text>
      </View>

      <View style={styles.modes}>
        {modes.map((item) => {
          const active = item.id === mode;
          return (
            <Pressable
              key={item.id}
              onPress={() => chooseMode(item.id)}
              style={[styles.mode, { backgroundColor: active ? item.soft : colors.card }, active && { borderColor: item.accent }]}
            >
              <Text style={[styles.modeText, { color: active ? item.accent : colors.secondary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {expanded && activeMode?.prompt && (
        <View style={[styles.prompt, { backgroundColor: activeMode.soft }]}>
          <Text style={[styles.promptText, { color: colors.text }]}>{activeMode.prompt}</Text>
        </View>
      )}

      {expanded ? (
        <View style={styles.editorWrap}>
          <TextInput
            autoFocus
            multiline
            onBlur={finish}
            onChangeText={onChange}
            onFocus={() => onReveal(reflectionLayout.current.y, reflectionLayout.current.height)}
            placeholder={!mode || mode === 'notes' ? '' : 'Start writing…'}
            placeholderTextColor={colors.tertiary}
            style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
            value={value}
          />
          <Pressable
            disabled={!value.trim()}
            hitSlop={8}
            onPressIn={() => void onSaveToLibrary(value)}
            style={[styles.libraryButton, { backgroundColor: colors.background }]}
          >
            <Text style={[styles.libraryText, { color: value.trim() ? colors.blue : colors.tertiary }]}>
              {savedToLibrary ? 'Saved to Library' : 'Save to Library'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={beginWriting} style={[styles.preview, { borderColor: colors.separator }]}>
          <Text numberOfLines={3} style={[styles.previewText, { color: value ? colors.text : colors.tertiary }]}>
            {value || 'Write something…'}
          </Text>
        </Pressable>
      )}
      {saveError && <Text accessibilityLiveRegion="polite" style={[styles.saveError, { color: colors.red }]}>Couldn’t save yet. Your writing is still here; tap the note and try again.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 10, paddingBottom: 18 },
  heading: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  context: { fontSize: 12, fontWeight: '600' },
  modes: { flexDirection: 'row', gap: 7, marginTop: 2, marginBottom: 10 },
  mode: { minHeight: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 11, fontWeight: '700' },
  prompt: { borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 2 },
  promptText: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  preview: { minHeight: 58, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginTop: 2, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' },
  previewText: { fontSize: 16, lineHeight: 22 },
  editorWrap: { position: 'relative' },
  input: { minHeight: 126, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginTop: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 38, fontSize: 16, lineHeight: 23, textAlignVertical: 'top' },
  libraryButton: { position: 'absolute', right: 10, bottom: 9, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 3 },
  libraryText: { fontSize: 14, fontWeight: '700' },
  saveError: { marginTop: 6, fontSize: 11, lineHeight: 15 },
});
