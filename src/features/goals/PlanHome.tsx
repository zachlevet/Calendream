import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import type { AppColors } from '@/theme/colors';
import type { Goal, GoalDraft, Habit, HabitDraft, ISOWeekday, ItemDraft } from '@/models/planning';
import { dateFromISO, localISO } from '@/shared/date';
import { timeMinutes } from '@/shared/time';
import { findAmbiguousTime, resolveAmbiguousTime, type TimePeriod } from '@/features/quick-capture/timePeriod';
import { applyPlanAdjustment, interpretPlanMessage, type PlanInterpretation } from './planMessage';

interface PlanChatHomeProps {
  colors: AppColors;
  goals: Goal[];
  habits: Habit[];
  today: string;
  onOpenPlans: () => void;
  onSaveGoal: (draft: GoalDraft) => Promise<string>;
  onSaveHabit: (draft: HabitDraft) => Promise<string>;
  onSaveItem: (draft: ItemDraft) => Promise<void>;
}

interface ChatEntry {
  id: number;
  text: string;
  followUps?: string[];
  interpretation: PlanInterpretation;
  saved?: boolean;
}

const WEEKDAY_LABELS: Record<ISOWeekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

function targetForHorizon(today: string, horizon: NonNullable<PlanInterpretation['horizon']>) {
  const date = dateFromISO(today);
  if (horizon === 'month') return localISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  if (horizon === 'quarter') return localISO(new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 + 3, 0));
  if (horizon === 'year') return `${date.getFullYear()}-12-31`;
  return '9999-12-31';
}

function dateForPlanTime(value?: string) {
  const minutes = timeMinutes(value ?? '7:00 AM');
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
}

function formatPlanTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function PlanChatHome({ colors, goals, habits, onOpenPlans, onSaveGoal, onSaveHabit, onSaveItem, today }: PlanChatHomeProps) {
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [timePeriod, setTimePeriod] = useState<TimePeriod | null>(null);
  const [choosingPeriod, setChoosingPeriod] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const input = useRef<TextInput>(null);
  const ambiguousTime = useMemo(() => findAmbiguousTime(text), [text]);
  const canSend = Boolean(text.trim()) && !(ambiguousTime && !timePeriod);

  function updateText(value: string) {
    setText(value);
    setTimePeriod(null);
    setChoosingPeriod(false);
  }

  function submit() {
    if (!canSend) return;
    const resolved = timePeriod ? resolveAmbiguousTime(text.trim(), timePeriod) : text.trim();
    setEntries((current) => {
      const last = current.at(-1);
      const adjusted = last && !last.saved ? applyPlanAdjustment(last.interpretation, resolved, today) : null;
      if (last && adjusted) {
        return current.map((entry) => entry.id === last.id ? {
          ...entry,
          followUps: [...(entry.followUps ?? []), resolved],
          interpretation: adjusted,
        } : entry);
      }
      return [...current, { id: Date.now(), text: resolved, interpretation: interpretPlanMessage(resolved, today) }];
    });
    setText('');
    setTimePeriod(null);
    setChoosingPeriod(false);
  }

  async function save(entry: ChatEntry) {
    const plan = entry.interpretation;
    setSavingId(entry.id);
    if (plan.intent === 'routine') {
      await onSaveHabit({
        name: plan.title,
        weekdays: plan.weekdays ?? [1, 2, 3, 4, 5],
        startDate: plan.date,
        itemKind: plan.time ? 'event' : 'task',
        startTime: plan.time,
      });
    } else if (plan.intent === 'goal') {
      const horizon = plan.horizon ?? 'someday';
      await onSaveGoal({
        title: plan.title,
        horizon,
        scope: horizon === 'someday' ? 'year' : horizon,
        startsOn: today,
        targetDate: targetForHorizon(today, horizon),
      });
    } else {
      await onSaveItem({
        kind: plan.intent,
        title: plan.title,
        date: plan.date,
        time: plan.time,
        altitude: plan.intent === 'event' ? 1 : 0,
        eventType: plan.intent === 'event' ? 'event' : undefined,
      });
    }
    setEntries((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, saved: true } : candidate));
    setSavingId(null);
  }

  function adjustWithPrompt(entry: ChatEntry) {
    setText(entry.text);
    setTimeout(() => input.current?.focus(), 50);
  }

  function updateInterpretation(id: number, interpretation: PlanInterpretation) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, interpretation } : entry));
  }

  const suggestions = ['Run every weekday at 7:30', 'My goal is to write a book this year', 'Plan tomorrow morning'];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={122} style={styles.flex}>
      <View style={styles.planHeader}>
        <View style={[styles.planOverview, { backgroundColor: colors.card }]}>
          <View style={styles.planOverviewIdentity}>
            <Text style={[styles.planIdentityTitle, { color: colors.text }]}>Plan</Text>
            <Text style={[styles.planIdentityMeta, { color: colors.secondary }]}>{goals.filter((goal) => !goal.completed).length} goals · {habits.length} routines</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Open goals and routines" onPress={onOpenPlans} style={[styles.plansLink, { backgroundColor: colors.blueSoft }]}>
          <Text style={[styles.plansAction, { color: colors.blue }]}>Goals</Text>
          <Text style={[styles.plansChevron, { color: colors.blue }]}>›</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.chatContent} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" ref={undefined} showsVerticalScrollIndicator={false}>
        {!entries.length && (
          <View style={styles.welcome}>
            <View style={[styles.assistantMark, { backgroundColor: colors.blueSoft }]}><Text style={[styles.assistantMarkText, { color: colors.blue }]}>✦</Text></View>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>What would you like to make happen?</Text>
            <Text style={[styles.welcomeText, { color: colors.secondary }]}>Describe a goal, a recurring rhythm, or something you want placed on your calendar.</Text>
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <Pressable key={suggestion} onPress={() => { setText(suggestion); setTimeout(() => input.current?.focus(), 50); }} style={[styles.suggestion, { backgroundColor: colors.card }]}>
                  <Text style={[styles.suggestionText, { color: colors.secondary }]}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {entries.map((entry) => (
          <View key={entry.id} style={styles.exchange}>
            <View style={[styles.userBubble, { backgroundColor: colors.blue }]}><Text style={styles.userBubbleText}>{entry.text}</Text></View>
            {entry.followUps?.map((followUp, index) => <View key={`${entry.id}-follow-up-${index}`} style={[styles.userBubble, { backgroundColor: colors.blue }]}><Text style={styles.userBubbleText}>{followUp}</Text></View>)}
            <PlanPreviewCard
              colors={colors}
              entry={entry}
              onChange={(interpretation) => updateInterpretation(entry.id, interpretation)}
              onEditPrompt={() => adjustWithPrompt(entry)}
              onSave={() => void save(entry)}
              saving={savingId === entry.id}
            />
          </View>
        ))}
      </ScrollView>

      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <TextInput
          accessibilityLabel="Message Calendream"
          multiline
          onChangeText={updateText}
          onSubmitEditing={submit}
          placeholder="Tell Calendream what you want to do…"
          placeholderTextColor={colors.tertiary}
          ref={input}
          returnKeyType="send"
          style={[styles.composerInput, { color: colors.text }]}
          value={text}
        />
        {ambiguousTime && (
          <View style={styles.composerPeriod}>
            {choosingPeriod ? (['AM', 'PM'] as TimePeriod[]).map((period) => (
              <Pressable key={period} onPress={() => { setTimePeriod(period); setChoosingPeriod(false); }} style={[styles.periodOption, { backgroundColor: colors.blue }]}>
                <Text style={styles.periodOptionText}>{period}</Text>
              </Pressable>
            )) : (
              <Pressable onPress={() => setChoosingPeriod(true)} style={[styles.periodChip, { backgroundColor: timePeriod ? colors.blueSoft : colors.background }]}>
                <Text style={[styles.periodChipText, { color: timePeriod ? colors.blue : colors.secondary }]}>{timePeriod ?? 'AM or PM?'}</Text>
              </Pressable>
            )}
          </View>
        )}
        <Pressable accessibilityLabel="Send plan" disabled={!canSend} onPress={submit} style={[styles.send, { backgroundColor: canSend ? colors.blue : colors.tertiary }]}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
      {ambiguousTime && !timePeriod && <Text style={[styles.periodHint, { color: colors.secondary }]}>Is {ambiguousTime.display} in the morning or evening?</Text>}
    </KeyboardAvoidingView>
  );
}

function PlanPreviewCard({ colors, entry, onChange, onEditPrompt, onSave, saving }: {
  colors: AppColors;
  entry: ChatEntry;
  onChange: (interpretation: PlanInterpretation) => void;
  onEditPrompt: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const plan = entry.interpretation;
  const accent = plan.intent === 'goal' ? colors.yellow : plan.intent === 'routine' ? colors.blue : plan.intent === 'event' ? colors.orange : colors.secondary;
  const background = plan.intent === 'goal' ? colors.yellowSoft : plan.intent === 'event' ? colors.orangeSoft : plan.intent === 'routine' ? colors.blueSoft : colors.card;
  const schedule = plan.intent === 'routine'
    ? `${plan.weekdays?.map((day) => WEEKDAY_LABELS[day]).join(' · ')}${plan.time ? ` · ${plan.time}` : ''}`
    : plan.intent === 'goal'
      ? plan.horizon === 'someday' ? 'Keep in view · No deadline' : `${plan.horizon} goal`
      : `${plan.date}${plan.time ? ` · ${plan.time}` : ''}`;
  return (
    <View style={[styles.preview, { backgroundColor: background }]}>
      <View style={styles.previewHeading}>
        <Text style={[styles.previewKind, { color: accent }]}>{plan.intent === 'routine' ? 'ROUTINE' : plan.intent.toUpperCase()}</Text>
        {entry.saved && <Text style={[styles.savedLabel, { color: accent }]}>ADDED ✓</Text>}
      </View>
      <Text style={[styles.previewTitle, { color: colors.text }]}>{plan.title}</Text>
      <Text style={[styles.previewSchedule, { color: colors.secondary }]}>{schedule}</Text>
      {plan.intent === 'routine' && <Text style={[styles.previewExplanation, { color: colors.secondary }]}>{plan.time ? 'Creates an event on each scheduled day.' : 'Creates a task on each scheduled day.'}</Text>}
      {adjusting && plan.intent === 'routine' && (
        <View style={[styles.routineAdjuster, { borderTopColor: colors.separator }]}>
          <Text style={[styles.adjusterLabel, { color: colors.secondary }]}>NAME</Text>
          <TextInput onChangeText={(title) => onChange({ ...plan, title })} style={[styles.adjusterName, { color: colors.text, borderBottomColor: colors.separator }]} value={plan.title} />
          <Text style={[styles.adjusterLabel, { color: colors.secondary }]}>REPEAT</Text>
          <View style={styles.adjusterWeekdays}>
            {([1, 2, 3, 4, 5, 6, 7] as ISOWeekday[]).map((day) => {
              const active = plan.weekdays?.includes(day) ?? false;
              return <Pressable key={day} onPress={() => { const next = active ? plan.weekdays?.filter((value) => value !== day) : [...(plan.weekdays ?? []), day].sort(); if (next?.length) onChange({ ...plan, weekdays: next as ISOWeekday[] }); }} style={[styles.adjusterDay, { backgroundColor: active ? colors.blue : colors.background, borderColor: active ? colors.blue : colors.separator }]}><Text style={[styles.adjusterDayText, { color: active ? '#FFFFFF' : colors.secondary }]}>{WEEKDAY_LABELS[day].charAt(0)}</Text></Pressable>;
            })}
          </View>
          <View style={styles.adjusterTimeRow}>
            <View>
              <Text style={[styles.adjusterTimeTitle, { color: colors.text }]}>Time</Text>
              <Text style={[styles.adjusterTimeMeta, { color: colors.secondary }]}>{plan.time ? 'Creates an event' : 'No time · creates a task'}</Text>
            </View>
            <View style={styles.adjusterTimeActions}>
              {plan.time && <Pressable onPress={() => { setTimePickerOpen(false); onChange({ ...plan, time: undefined }); }}><Text style={[styles.removeTime, { color: colors.secondary }]}>Remove</Text></Pressable>}
              <Pressable onPress={() => { if (!plan.time) onChange({ ...plan, time: '7:00 AM' }); setTimePickerOpen((open) => !open); }} style={[styles.timeButton, { backgroundColor: colors.background }]}><Text style={[styles.timeButtonText, { color: colors.blue }]}>{plan.time ?? 'Add time'}</Text></Pressable>
            </View>
          </View>
          {timePickerOpen && plan.time && <DateTimePicker display={Platform.OS === 'ios' ? 'spinner' : 'default'} mode="time" onChange={(_, selected) => { if (selected) onChange({ ...plan, time: formatPlanTime(selected) }); }} value={dateForPlanTime(plan.time)} />}
          <View style={styles.adjusterDoneRow}><Pressable onPress={() => { setAdjusting(false); setTimePickerOpen(false); }} style={[styles.adjusterDone, { backgroundColor: colors.blue }]}><Text style={styles.adjusterDoneText}>Done</Text></Pressable></View>
        </View>
      )}
      {!entry.saved && (
        <View style={styles.previewActions}>
          {!adjusting && <Pressable onPress={() => plan.intent === 'routine' ? setAdjusting(true) : onEditPrompt()} style={styles.adjustButton}><Text style={[styles.adjustText, { color: colors.secondary }]}>Adjust</Text></Pressable>}
          <Pressable disabled={saving} onPress={onSave} style={[styles.confirmButton, { backgroundColor: accent }]}><Text style={styles.confirmText}>{saving ? 'Adding…' : plan.intent === 'goal' ? 'Keep in View' : 'Add to Calendar'}</Text></Pressable>
        </View>
      )}
    </View>
  );
}

export function YourPlansHome({ colors, goals, habits, onBack, onOpenGoal, onOpenHabit, onStartChat }: {
  colors: AppColors;
  goals: Goal[];
  habits: Habit[];
  onBack: () => void;
  onOpenGoal: (id: string) => void;
  onOpenHabit: (id: string) => void;
  onStartChat: () => void;
}) {
  const primaryGoals = goals.filter((goal) => !goal.completed && goal.horizon !== 'someday');
  const somedayGoals = goals.filter((goal) => !goal.completed && goal.horizon === 'someday');
  const completedGoals = goals
    .filter((goal) => goal.completed)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const activeGoalCount = primaryGoals.length + somedayGoals.length;
  return (
    <ScrollView contentContainerStyle={styles.libraryContent} showsVerticalScrollIndicator={false} style={styles.flex}>
      <Pressable onPress={onBack} style={[styles.backButton, { backgroundColor: colors.card }]}><Text style={[styles.backText, { color: colors.blue }]}>‹ Plan</Text></Pressable>
      <View style={styles.libraryHeader}>
        <Text style={[styles.libraryTitle, { color: colors.text }]}>Goals & Routines</Text>
        <Text style={[styles.librarySubtitle, { color: colors.secondary }]}>Everything you’ve asked Calendream to keep in motion.</Text>
        <View style={[styles.librarySummary, { backgroundColor: colors.card }]}>
          <View style={styles.librarySummaryItem}>
            <View style={[styles.librarySummaryIcon, { backgroundColor: colors.yellowSoft }]}>
              <Text style={[styles.librarySummaryStar, { color: colors.yellow }]}>☆</Text>
            </View>
            <View>
              <Text style={[styles.librarySummaryValue, { color: colors.text }]}>{activeGoalCount} {activeGoalCount === 1 ? 'goal' : 'goals'}</Text>
              <Text style={[styles.librarySummaryLabel, { color: colors.secondary }]}>IN VIEW</Text>
            </View>
          </View>
          <View style={[styles.librarySummaryDivider, { backgroundColor: colors.separator }]} />
          <View style={styles.librarySummaryItem}>
            <View style={[styles.librarySummaryIcon, { backgroundColor: colors.blueSoft }]}>
              <View style={[styles.librarySummaryDot, { backgroundColor: colors.blue }]} />
            </View>
            <View>
              <Text style={[styles.librarySummaryValue, { color: colors.text }]}>{habits.length} {habits.length === 1 ? 'routine' : 'routines'}</Text>
              <Text style={[styles.librarySummaryLabel, { color: colors.secondary }]}>ON CALENDAR</Text>
            </View>
          </View>
        </View>
      </View>

      <LibraryHeading colors={colors} title="Goals" />
      <View style={[styles.goalList, { backgroundColor: colors.yellowSoft }]}>
        {primaryGoals.map((goal, index) => <PlanGoalRow colors={colors} goal={goal} index={index} key={goal.id} onPress={() => onOpenGoal(goal.id)} />)}
        {!primaryGoals.length && <LibraryEmpty colors={colors} text="No goals yet." />}
      </View>

      <LibraryHeading colors={colors} title="Routines" />
      <View style={[styles.routineList, { backgroundColor: colors.card }]}>
        {habits.map((habit, index) => (
          <Pressable key={habit.id} onPress={() => onOpenHabit(habit.id)} style={[styles.libraryRow, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.routineDot, { backgroundColor: colors.blue }]} />
            <View style={styles.copy}><Text style={[styles.libraryRowTitle, { color: colors.text }]}>{habit.name}</Text><Text style={[styles.libraryRowMeta, { color: colors.secondary }]}>{habit.weekdays.map((day) => WEEKDAY_LABELS[day]).join(' · ')}{habit.startTime ? ` · ${habit.startTime}` : ' · Task'}</Text></View>
            <Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text>
          </Pressable>
        ))}
        {!habits.length && <LibraryEmpty colors={colors} text="No routines yet." />}
      </View>

      {somedayGoals.length > 0 && <><LibraryHeading colors={colors} title="Someday" /><View style={[styles.somedayList, { borderColor: colors.separator }]}>{somedayGoals.map((goal) => <Pressable key={goal.id} onPress={() => onOpenGoal(goal.id)} style={styles.somedayRow}><Text style={[styles.somedayStar, { color: colors.yellow }]}>☆</Text><Text style={[styles.somedayTitle, { color: colors.text }]}>{goal.title}</Text><Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text></Pressable>)}</View></>}

      <Pressable onPress={onStartChat} style={[styles.askButton, { borderColor: colors.separator }]}><Text style={[styles.askButtonText, { color: colors.blue }]}>＋ Make a plan with Calendream</Text></Pressable>

      {completedGoals.length > 0 && <><LibraryHeading colors={colors} title="Completed goals" /><View style={[styles.archiveList, { backgroundColor: colors.card }]}>{completedGoals.map((goal, index) => <Pressable key={goal.id} onPress={() => onOpenGoal(goal.id)} style={[styles.archiveRow, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={styles.archiveStar}>★</Text><View style={styles.copy}><Text style={[styles.archiveTitle, { color: colors.text }]}>{goal.title}</Text><Text style={[styles.archiveDate, { color: colors.secondary }]}>{formatCompletedGoalDate(goal)}</Text></View><Text style={[styles.chevron, { color: colors.tertiary }]}>›</Text></Pressable>)}</View></>}
    </ScrollView>
  );
}

function formatCompletedGoalDate(goal: Goal) {
  if (!goal.completedAt) return 'Completed';
  const date = new Date(goal.completedAt);
  if (Number.isNaN(date.getTime())) return 'Completed';
  return `Completed ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)}`;
}

function PlanGoalRow({ colors, goal, index, onPress }: { colors: AppColors; goal: Goal; index: number; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.libraryRow, index > 0 && { borderTopColor: 'rgba(199,141,0,0.18)', borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={[styles.goalStar, { color: goal.completed ? colors.tertiary : colors.yellow }]}>{goal.completed ? '★' : '☆'}</Text><View style={styles.copy}><Text style={[styles.libraryRowTitle, { color: goal.completed ? colors.tertiary : colors.yellow }, goal.completed && styles.completedGoal]}>{goal.title}</Text><Text style={[styles.libraryRowMeta, { color: goal.completed ? colors.tertiary : colors.yellow }]}>{goal.completed ? 'COMPLETED · ' : ''}{goal.horizon.toUpperCase()} GOAL</Text></View><Text style={[styles.chevron, { color: goal.completed ? colors.tertiary : colors.yellow }]}>›</Text></Pressable>;
}

function LibraryHeading({ colors, title }: { colors: AppColors; title: string }) {
  return <View style={styles.libraryHeading}><Text style={[styles.libraryHeadingText, { color: colors.text }]}>{title}</Text></View>;
}

function LibraryEmpty({ colors, text }: { colors: AppColors; text: string }) {
  return <Text style={[styles.libraryEmpty, { color: colors.secondary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  planHeader: { paddingHorizontal: 18, paddingTop: 7, paddingBottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planOverview: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  planOverviewIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  planIdentityTitle: { fontSize: 15, lineHeight: 18, fontWeight: '800' },
  planIdentityMeta: { fontSize: 10, lineHeight: 13, fontWeight: '700' },
  plansLink: { minHeight: 40, borderRadius: 20, paddingLeft: 14, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  plansAction: { fontSize: 14, fontWeight: '700' },
  plansChevron: { fontSize: 19, lineHeight: 20, marginTop: -1 },
  chatContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 16 },
  welcome: { flex: 1, minHeight: 355, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 24 },
  assistantMark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  assistantMarkText: { fontSize: 21, fontWeight: '700' },
  welcomeTitle: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.55, textAlign: 'center' },
  welcomeText: { maxWidth: 320, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 19 },
  suggestion: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  suggestionText: { fontSize: 12, fontWeight: '600' },
  exchange: { marginBottom: 18 },
  userBubble: { maxWidth: '86%', alignSelf: 'flex-end', borderRadius: 19, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 9 },
  userBubbleText: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  preview: { borderRadius: 20, padding: 14 },
  previewHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewKind: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  savedLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  previewTitle: { fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.25, marginTop: 6 },
  previewSchedule: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 5 },
  previewExplanation: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  routineAdjuster: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 13, paddingTop: 4 },
  adjusterLabel: { fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 10, marginBottom: 5 },
  adjusterName: { height: 37, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 15, fontWeight: '700', paddingVertical: 4 },
  adjusterWeekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  adjusterDay: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  adjusterDayText: { fontSize: 11, fontWeight: '800' },
  adjusterTimeRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  adjusterTimeTitle: { fontSize: 14, fontWeight: '700' },
  adjusterTimeMeta: { fontSize: 9, lineHeight: 12, marginTop: 2 },
  adjusterTimeActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  removeTime: { fontSize: 10, fontWeight: '700' },
  timeButton: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  timeButtonText: { fontSize: 11, fontWeight: '800' },
  adjusterDoneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 5 },
  adjusterDone: { height: 32, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  adjusterDoneText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  previewActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 7, marginTop: 13 },
  adjustButton: { height: 34, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  adjustText: { fontSize: 12, fontWeight: '700' },
  confirmButton: { minHeight: 36, borderRadius: 18, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  composer: { minHeight: 54, maxHeight: 116, marginHorizontal: 14, marginBottom: 88, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 15, paddingRight: 7, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-end' },
  composerInput: { flex: 1, minHeight: 40, maxHeight: 96, paddingTop: 10, paddingBottom: 8, fontSize: 15, lineHeight: 20 },
  composerPeriod: { flexDirection: 'row', gap: 4, alignSelf: 'center', marginHorizontal: 5 },
  periodChip: { minHeight: 29, borderRadius: 9, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  periodChipText: { fontSize: 11, fontWeight: '800' },
  periodOption: { width: 36, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  periodOptionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  send: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFFFFF', fontSize: 22, lineHeight: 23, fontWeight: '700' },
  periodHint: { position: 'absolute', left: 27, bottom: 69, fontSize: 10, fontWeight: '600' },
  libraryContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 112 },
  backButton: { height: 36, borderRadius: 18, paddingHorizontal: 12, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 14, fontWeight: '700' },
  libraryHeader: { marginTop: 18, marginBottom: 16 },
  libraryTitle: { fontSize: 31, lineHeight: 36, fontWeight: '700', letterSpacing: -0.9 },
  librarySubtitle: { maxWidth: 330, fontSize: 13, lineHeight: 18, marginTop: 4 },
  librarySummary: { minHeight: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 13 },
  librarySummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  librarySummaryIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  librarySummaryStar: { fontSize: 20, lineHeight: 22, fontWeight: '700' },
  librarySummaryDot: { width: 9, height: 9, borderRadius: 5 },
  librarySummaryValue: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  librarySummaryLabel: { fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.7, marginTop: 1 },
  librarySummaryDivider: { width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 11 },
  libraryHeading: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  libraryHeadingText: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  libraryAction: { fontSize: 12, fontWeight: '700' },
  goalList: { borderRadius: 18, paddingHorizontal: 12, overflow: 'hidden', marginBottom: 9 },
  routineList: { borderRadius: 18, paddingHorizontal: 12, overflow: 'hidden', marginBottom: 9 },
  libraryRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
  goalStar: { width: 29, fontSize: 22 },
  routineDot: { width: 9, height: 9, borderRadius: 5, marginHorizontal: 5, marginRight: 14 },
  copy: { flex: 1 },
  libraryRowTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  completedGoal: { textDecorationLine: 'line-through' },
  libraryRowMeta: { fontSize: 9, lineHeight: 13, marginTop: 2, fontWeight: '700' },
  chevron: { width: 18, textAlign: 'center', fontSize: 18 },
  libraryEmpty: { fontSize: 13, lineHeight: 18, paddingVertical: 15 },
  somedayList: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2, marginBottom: 11 },
  somedayRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center' },
  somedayStar: { width: 28, fontSize: 19 },
  somedayTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  askButton: { minHeight: 48, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  askButtonText: { fontSize: 14, fontWeight: '700' },
  archiveList: { borderRadius: 18, paddingHorizontal: 12, overflow: 'hidden', marginBottom: 9 },
  archiveRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center' },
  archiveStar: { width: 30, color: '#FFB000', fontSize: 20 },
  archiveTitle: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  archiveDate: { fontSize: 9, lineHeight: 13, marginTop: 2, fontWeight: '600' },
});
