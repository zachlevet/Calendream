import { Platform, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { formatLongDate } from '@/shared/date';
import type { SearchResult } from '@/models/planning';
import type { AppColors } from '@/theme/colors';

interface SearchResultsProps {
  colors: AppColors;
  loading: boolean;
  onBrowseCategory: (category: SearchBrowseCategory) => void;
  query: string;
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
}

export type SearchBrowseCategory = 'journal' | 'goals' | 'routines';

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

export function SearchResults({ colors, loading, onBrowseCategory, query, results, onSelect }: SearchResultsProps) {
  if (!query.trim()) {
    const categories: { id: SearchBrowseCategory; icon: SFSymbol; label: string; color: string; background: string }[] = [
      { id: 'journal', icon: 'book.closed', label: 'Journal', color: colors.purple, background: colors.purpleSoft },
      { id: 'goals', icon: 'star', label: 'Goals', color: colors.yellow, background: colors.yellowSoft },
      { id: 'routines', icon: 'repeat', label: 'Routines', color: colors.blue, background: colors.blueSoft },
    ];
    return <View style={styles.guide}>
      <Text style={[styles.guideEyebrow, { color: colors.secondary }]}>SEARCH CALENDREAM</Text>
      <Text style={[styles.guideTitle, { color: colors.text }]}>Find anything you’ve planned or written.</Text>
      <Text style={[styles.guideText, { color: colors.secondary }]}>Search events, tasks, notes, and goals—or jump into a part of your Library.</Text>
      <View style={styles.categories}>
        {categories.map((category) => <Pressable accessibilityLabel={`Browse ${category.label}`} key={category.id} onPress={() => onBrowseCategory(category.id)} style={({ pressed }) => [styles.category, { backgroundColor: category.background }, pressed && styles.pressed]}>
          <SymbolView name={category.icon} size={15} tintColor={category.color} weight="semibold" />
          <Text style={[styles.categoryText, { color: category.color }]}>{category.label}</Text>
        </Pressable>)}
      </View>
    </View>;
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
    top: 54,
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
  overlayCompact: { height: 190, borderRadius: 22 },
  glass: { position: 'absolute', inset: 0, borderRadius: 24 },
  overlayContent: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  guide: { flex: 1, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 14 },
  guideEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1 },
  guideTitle: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.25, marginTop: 4 },
  guideText: { fontSize: 12, lineHeight: 16, marginTop: 3, maxWidth: 330 },
  categories: { flexDirection: 'row', gap: 7, marginTop: 13 },
  category: { minHeight: 34, borderRadius: 17, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1 },
  categoryText: { fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.58 },
  group: { marginBottom: 18 },
  groupTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  result: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingVertical: 8 },
  date: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  title: { fontSize: 16, fontWeight: '600' },
  snippet: { fontSize: 14, marginTop: 2 },
});
