import { Platform, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { formatLongDate } from '@/shared/date';
import type { SearchResult } from '@/models/planning';
import type { AppColors } from '@/theme/colors';

interface SearchResultsProps {
  colors: AppColors;
  loading: boolean;
  query: string;
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
}

export function SearchOverlay(props: SearchResultsProps) {
  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const compact = !props.query.trim();

  return (
    <View style={[styles.overlay, compact && styles.overlayCompact, !glassAvailable && { backgroundColor: props.colors.chrome, borderColor: props.colors.separator }]}>
      {glassAvailable && (
        <GlassView
          colorScheme="auto"
          glassEffectStyle="regular"
          isInteractive
          style={styles.glass}
          tintColor="rgba(255,255,255,0.12)"
        />
      )}
      <View style={styles.overlayContent}>
        <SearchResults {...props} />
      </View>
    </View>
  );
}

const GROUPS: { kind: SearchResult['kind']; title: string }[] = [
  { kind: 'event', title: 'Events' },
  { kind: 'task', title: 'Tasks' },
  { kind: 'note', title: 'Notes' },
  { kind: 'goal', title: 'Goals' },
];

export function SearchResults({ colors, loading, query, results, onSelect }: SearchResultsProps) {
  if (!query.trim()) {
    return <View style={styles.empty}><Text style={[styles.emptyText, { color: colors.secondary }]}>Search for an event, task, note, or goal</Text></View>;
  }

  if (!loading && results.length === 0) {
    return <View style={styles.empty}><Text style={[styles.emptyText, { color: colors.tertiary }]}>Nothing found for “{query.trim()}”</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {GROUPS.map((group) => {
        const groupResults = results.filter((result) => result.kind === group.kind);
        if (groupResults.length === 0) return null;
        return (
          <View key={group.kind} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{group.title}</Text>
            {groupResults.map((result) => (
              <Pressable
                key={result.id}
                onPress={() => onSelect(result)}
                style={({ pressed }) => [styles.result, { borderColor: colors.separator }, pressed && { opacity: 0.55 }]}
              >
                <Text style={[styles.date, { color: colors.secondary }]}>{formatLongDate(result.date)}</Text>
                {result.kind !== 'note' && <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{result.title}</Text>}
                {result.snippet && <Text numberOfLines={1} style={[styles.snippet, { color: colors.secondary }]}>{result.snippet}</Text>}
              </Pressable>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    zIndex: 40,
    top: 50,
    left: 10,
    right: 10,
    height: 390,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  overlayCompact: { height: 62, borderRadius: 20 },
  glass: { position: 'absolute', inset: 0, borderRadius: 24 },
  overlayContent: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  group: { marginBottom: 18 },
  groupTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  result: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingVertical: 8 },
  date: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  title: { fontSize: 16, fontWeight: '600' },
  snippet: { fontSize: 14, marginTop: 2 },
});
