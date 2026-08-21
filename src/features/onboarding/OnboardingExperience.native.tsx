import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import type { CalendarImportResult } from '@/database/calendarImportStore';
// Metro resolves the platform-specific calendar importer.
// eslint-disable-next-line import/no-unresolved
import { CalendarImportFlow } from '@/features/calendar-import/CalendarImportFlow';
import type { AppColors } from '@/theme/colors';

interface OnboardingExperienceProps {
  colors: AppColors;
  replay?: boolean;
  onClose?(): void;
  onFinish(reason: 'fresh' | 'imported'): Promise<void> | void;
}

export function OnboardingExperience({ colors, replay = false, onClose, onFinish }: OnboardingExperienceProps) {
  const [page, setPage] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const pages = [
    { eyebrow: 'WELCOME TO CALENDREAM', title: 'Plan today. See your life ahead.', body: 'A daily home and a timeline are two views of the same life—not separate calendars.' },
    { eyebrow: 'LIVE YOUR DAY', title: 'Today is where plans become real.', body: 'Events, tasks, and a quiet reflection live together. Unfinished work gets a thoughtful next home tomorrow.' },
    { eyebrow: 'ZOOM THROUGH TIME', title: 'Step back without losing the story.', body: 'Move from a day to a week, month, quarter, or year. Ordinary details recede while trips and milestones remain.' },
    { eyebrow: 'KEEP DIRECTION', title: 'Goals stay visible, not overwhelming.', body: 'A few goals and routines gently shape the calendar. They support your life without turning it into a project dashboard.' },
    { eyebrow: 'MAKE IT YOURS', title: replay ? 'Bring in more of your calendar.' : 'How would you like to begin?', body: 'Import calendars already connected to this iPhone, or begin with a completely open day.' },
  ];
  const current = pages[page];

  if (importOpen) {
    return <CalendarImportFlow colors={colors} onClose={() => setImportOpen(false)} onComplete={async (_result: CalendarImportResult) => onFinish('imported')} />;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.brand, { color: colors.text }]}>Calendream</Text>
        {replay && onClose ? <Pressable accessibilityLabel="Close how to use" accessibilityRole="button" hitSlop={12} onPress={onClose} style={[styles.close, { backgroundColor: colors.card }]}><SymbolView name="xmark" size={14} tintColor={colors.secondary} weight="semibold" /></Pressable> : <View style={styles.close} />}
      </View>

      <View accessibilityLabel={`Step ${page + 1} of ${pages.length}`} style={styles.progress}>
        {pages.map((_, index) => <View key={index} style={[styles.progressDot, { backgroundColor: index === page ? colors.blue : colors.separator }, index === page && styles.progressActive]} />)}
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.walkthrough, compact && styles.walkthroughCompact]}
        showsVerticalScrollIndicator={false}
        style={styles.walkthroughScroll}
      >
        <View style={[styles.copy, compact && styles.copyCompact]}>
          <Text style={[styles.eyebrow, { color: page === 0 ? colors.red : colors.blue }]}>{current.eyebrow}</Text>
          <Text style={[styles.title, compact && styles.titleCompact, { color: colors.text }]}>{current.title}</Text>
          <Text style={[styles.body, compact && styles.bodyCompact, { color: colors.secondary }]}>{current.body}</Text>
        </View>

        <View style={[styles.preview, compact && styles.previewCompact]}>
          {page === 0 && <WelcomePreview colors={colors} />}
          {page === 1 && <TodayPreview colors={colors} />}
          {page === 2 && <TimelinePreview colors={colors} />}
          {page === 3 && <PlanPreview colors={colors} />}
          {page === 4 && <SetupPreview colors={colors} />}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {page < pages.length - 1 ? (
          <View style={styles.footerRow}>
            {page > 0 && <Pressable accessibilityLabel="Previous step" accessibilityRole="button" onPress={() => setPage((value) => value - 1)} style={({ pressed }) => [styles.back, { backgroundColor: colors.card }, pressed && styles.pressed]}><SymbolView name="chevron.left" size={16} tintColor={colors.blue} weight="semibold" /></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => setPage((value) => value + 1)} style={({ pressed }) => [styles.primary, styles.primaryFlexible, { backgroundColor: colors.blue }, pressed && styles.pressed]}><Text style={styles.primaryText}>{page === 0 ? 'Show Me Around' : 'Continue'}</Text></Pressable>
          </View>
        ) : (
          <>
            <Pressable accessibilityRole="button" onPress={() => setImportOpen(true)} style={({ pressed }) => [styles.primary, { backgroundColor: colors.blue }, pressed && styles.pressed]}><SymbolView name="calendar.badge.plus" size={17} tintColor="#FFFFFF" weight="semibold" /><Text style={styles.primaryText}>Import My Calendars</Text></Pressable>
            <View style={styles.finalActions}>
              <Pressable accessibilityRole="button" onPress={() => setPage((value) => value - 1)} style={styles.secondary}><Text style={[styles.secondaryText, { color: colors.secondary }]}>Back</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void onFinish('fresh')} style={styles.secondary}><Text style={[styles.secondaryText, { color: colors.blue }]}>{replay ? 'Done' : 'Start Fresh'}</Text></Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function WelcomePreview({ colors }: { colors: AppColors }) {
  return <View style={styles.orbit}><View style={[styles.orbitLarge, { backgroundColor: colors.redSoft }]}><SymbolView name="calendar" size={43} tintColor={colors.red} weight="medium" /></View><View style={[styles.orbitSmall, styles.orbitWeek, { backgroundColor: colors.blueSoft }]}><Text style={[styles.orbitText, { color: colors.blue }]}>WEEK</Text></View><View style={[styles.orbitSmall, styles.orbitYear, { backgroundColor: colors.yellowSoft }]}><Text style={[styles.orbitText, { color: colors.yellow }]}>YEAR</Text></View></View>;
}

function TodayPreview({ colors }: { colors: AppColors }) {
  return <View style={[styles.demoCard, { backgroundColor: colors.card }]}><Text style={[styles.demoEyebrow, { color: colors.red }]}>TODAY</Text><Text style={[styles.demoDate, { color: colors.text }]}>Thursday, August 20</Text><PreviewRow colors={colors} icon="circle.fill" iconColor={colors.blue} meta="9:15 AM" title="Flight to Denver" /><PreviewRow colors={colors} icon="circle" iconColor={colors.tertiary} title="Finish the proposal" /><View style={[styles.reflection, { borderColor: colors.separator }]}><Text style={[styles.reflectionText, { color: colors.secondary }]}>What made today meaningful?</Text></View></View>;
}

function TimelinePreview({ colors }: { colors: AppColors }) {
  return <View style={[styles.demoCard, { backgroundColor: colors.card }]}><Text style={[styles.demoEyebrow, { color: colors.red }]}>THIS MONTH</Text><Text style={[styles.demoDate, { color: colors.text }]}>August</Text><PreviewRow colors={colors} icon="circle.fill" iconColor={colors.blue} meta="20" title="Flight to Denver" /><PreviewRow colors={colors} icon="minus" iconColor={colors.orange} meta="20–23" title="Colorado trip" /><View style={[styles.zoomDock, { backgroundColor: colors.background }]}>{['Day', 'Week', 'Month', 'Year'].map((label) => <Text key={label} style={[styles.zoomLabel, { color: label === 'Month' ? colors.blue : colors.secondary }]}>{label}</Text>)}</View></View>;
}

function PlanPreview({ colors }: { colors: AppColors }) {
  return <View style={styles.planStack}><View style={[styles.goalCard, { backgroundColor: colors.yellowSoft }]}><SymbolView name="star" size={23} tintColor={colors.yellow} weight="semibold" /><View><Text style={[styles.goalMeta, { color: colors.yellow }]}>YEAR GOAL</Text><Text style={[styles.goalTitle, { color: colors.yellow }]}>Race my first Ironman</Text></View></View><View style={[styles.demoCard, { backgroundColor: colors.card }]}><Text style={[styles.demoEyebrow, { color: colors.blue }]}>ROUTINE</Text><Text style={[styles.demoDate, { color: colors.text }]}>Morning run</Text><Text style={[styles.routineDays, { color: colors.secondary }]}>M  ·  W  ·  F   at 7:30 AM</Text></View></View>;
}

function SetupPreview({ colors }: { colors: AppColors }) {
  return <View style={[styles.demoCard, { backgroundColor: colors.card }]}><PreviewRow colors={colors} icon="calendar.badge.plus" iconColor={colors.blue} title="Import from iPhone" /><View style={[styles.demoDivider, { backgroundColor: colors.separator }]} /><PreviewRow colors={colors} icon="sparkles" iconColor={colors.red} title="Begin with an open day" /><Text style={[styles.setupNote, { color: colors.secondary }]}>The sample moments in this tour are only a preview. They are never added to your calendar.</Text></View>;
}

function PreviewRow({ colors, icon, iconColor, meta, title }: { colors: AppColors; icon: SFSymbol; iconColor: string; meta?: string; title: string }) {
  return <View style={styles.previewRow}>{meta && <Text style={[styles.previewMeta, { color: colors.secondary }]}>{meta}</Text>}<SymbolView name={icon} size={14} tintColor={iconColor} weight="semibold" /><Text numberOfLines={1} style={[styles.previewTitle, { color: colors.text }]}>{title}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 50, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  progress: { minHeight: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  progressDot: { width: 6, height: 6, borderRadius: 3 },
  progressActive: { width: 20 },
  walkthroughScroll: { flex: 1 },
  walkthrough: { flexGrow: 1, paddingTop: 12, paddingBottom: 18 },
  walkthroughCompact: { paddingTop: 6, paddingBottom: 10 },
  copy: { width: '100%', paddingHorizontal: 24 },
  copyCompact: { paddingHorizontal: 20 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: 8, maxWidth: 360, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1 },
  titleCompact: { fontSize: 29, lineHeight: 34 },
  body: { marginTop: 11, maxWidth: 360, fontSize: 16, lineHeight: 23 },
  bodyCompact: { marginTop: 8, fontSize: 15, lineHeight: 21 },
  preview: { width: '100%', flexGrow: 1, minHeight: 300, paddingHorizontal: 24, paddingTop: 22, alignItems: 'center', justifyContent: 'center' },
  previewCompact: { minHeight: 238, paddingHorizontal: 20, paddingTop: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 18, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  primaryFlexible: { flex: 1 },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  finalActions: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secondary: { minWidth: 74, height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  orbit: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  orbitLarge: { width: 126, height: 126, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  orbitSmall: { position: 'absolute', width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  orbitWeek: { top: 12, right: 2 },
  orbitYear: { bottom: 5, left: 3 },
  orbitText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  demoCard: { width: '100%', maxWidth: 370, borderRadius: 26, padding: 20 },
  demoEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  demoDate: { marginTop: 5, marginBottom: 13, fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  previewRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewMeta: { width: 59, fontSize: 12 },
  previewTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  reflection: { marginTop: 11, borderWidth: 1, borderRadius: 15, padding: 13 },
  reflectionText: { fontSize: 13 },
  zoomDock: { marginTop: 14, borderRadius: 18, paddingHorizontal: 13, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoomLabel: { fontSize: 12, fontWeight: '700' },
  planStack: { width: '100%', maxWidth: 370, gap: 12 },
  goalCard: { minHeight: 76, borderRadius: 24, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 13 },
  goalMeta: { fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  goalTitle: { marginTop: 3, fontSize: 17, fontWeight: '700' },
  routineDays: { fontSize: 14, fontWeight: '600' },
  demoDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  setupNote: { marginTop: 15, fontSize: 12, lineHeight: 17 },
});
