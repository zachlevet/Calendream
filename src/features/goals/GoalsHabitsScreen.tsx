import { Fragment, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import type { Goal, GoalDraft, GoalScope, GoalStep, GoalStepDraft, Habit, HabitDraft, ISOWeekday } from '@/models/planning';
import { dateFromISO, formatLongDate, localISO } from '@/shared/date';
import type { AppColors } from '@/theme/colors';

interface GoalsHabitsScreenProps {
  colors: AppColors;
  goalSteps: GoalStep[];
  goals: Goal[];
  habits: Habit[];
  today: string;
  onArchiveHabit: (id: string) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onDeleteGoalStep: (step: GoalStep) => Promise<void>;
  onSaveGoal: (draft: GoalDraft) => Promise<void>;
  onSaveGoalStep: (draft: GoalStepDraft) => Promise<void>;
  onSaveHabit: (draft: HabitDraft) => Promise<void>;
  onToggleGoal: (goal: Goal) => Promise<void>;
  onToggleGoalStep: (step: GoalStep) => Promise<void>;
  onToggleHabit: (habit: Habit) => Promise<void>;
}

const WEEKDAYS: { value: ISOWeekday; label: string }[] = [
  { value: 1, label: 'M' }, { value: 2, label: 'T' }, { value: 3, label: 'W' },
  { value: 4, label: 'T' }, { value: 5, label: 'F' }, { value: 6, label: 'S' },
  { value: 7, label: 'S' },
];

function targetForScope(today: string, scope: GoalScope) {
  const date = dateFromISO(today);
  if (scope === 'month') return localISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  if (scope === 'quarter') {
    const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 3;
    return localISO(new Date(date.getFullYear(), quarterEndMonth, 0));
  }
  return `${date.getFullYear()}-12-31`;
}

function weekdayFor(date: string): ISOWeekday {
  const day = dateFromISO(date).getDay();
  return (day === 0 ? 7 : day) as ISOWeekday;
}

export function GoalsHabitsScreen({
  colors, goalSteps, goals, habits, today, onArchiveHabit, onDeleteGoal, onDeleteGoalStep,
  onSaveGoal, onSaveGoalStep, onSaveHabit, onToggleGoal, onToggleGoalStep, onToggleHabit,
}: GoalsHabitsScreenProps) {
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [goalStepDraft, setGoalStepDraft] = useState<GoalStepDraft | null>(null);
  const [habitDraft, setHabitDraft] = useState<HabitDraft | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [stepDatePickerOpen, setStepDatePickerOpen] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const currentWeekday = weekdayFor(today);
  const activeGoals = useMemo(() => goals.filter((goal) => !goal.completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((goal) => goal.completed), [goals]);

  function beginGoal(goal?: Goal) {
    setHabitDraft(null);
    setDatePickerOpen(false);
    setGoalDraft(goal ? {
      id: goal.id, title: goal.title, scope: goal.scope, startsOn: goal.startsOn,
      targetDate: goal.targetDate, notes: goal.notes,
    } : {
      title: '', scope: 'month', startsOn: today, targetDate: targetForScope(today, 'month'),
    });
  }

  function beginHabit(habit?: Habit) {
    setGoalDraft(null);
    setDatePickerOpen(false);
    setHabitDraft(habit ? {
      id: habit.id, name: habit.name, weekdays: habit.weekdays, startDate: habit.startDate, endDate: habit.endDate,
    } : {
      name: '', weekdays: [currentWeekday], startDate: today,
    });
  }

  async function submitGoal() {
    if (!goalDraft?.title.trim()) return;
    await onSaveGoal(goalDraft);
    setGoalDraft(null);
  }

  async function submitHabit() {
    if (!habitDraft?.name.trim() || habitDraft.weekdays.length === 0) return;
    await onSaveHabit(habitDraft);
    setHabitDraft(null);
  }

  async function submitGoalStep() {
    if (!goalStepDraft?.title.trim()) return;
    await onSaveGoalStep(goalStepDraft);
    setGoalStepDraft(null);
    setStepDatePickerOpen(false);
  }

  function changeGoalDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setDatePickerOpen(false);
    if (selected && goalDraft) setGoalDraft({ ...goalDraft, targetDate: localISO(selected) });
  }

  function changeStepDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setStepDatePickerOpen(false);
    if (selected && goalStepDraft) setGoalStepDraft({ ...goalStepDraft, scheduledDate: localISO(selected) });
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={styles.intro}>
        <Text style={[styles.eyebrow, { color: colors.yellow }]}>DIRECTION & RHYTHM</Text>
        <Text style={[styles.title, { color: colors.text }]}>Goals & Habits</Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>Keep the bigger picture visible, then turn it into what you do today.</Text>
      </View>

      <SectionTitle action="Add goal" colors={colors} onAction={() => beginGoal()} title="Goals" />
      {goalDraft && (
        <View style={[styles.composer, { backgroundColor: colors.yellowSoft, borderColor: colors.yellow }]}> 
          <TextInput
            autoFocus
            onChangeText={(title) => setGoalDraft({ ...goalDraft, title })}
            placeholder="What are you working toward?"
            placeholderTextColor={colors.tertiary}
            style={[styles.composerTitle, { color: colors.text, borderColor: colors.separator }]}
            value={goalDraft.title}
          />
          <View style={styles.scopeRow}>
            {(['month', 'quarter', 'year'] as GoalScope[]).map((scope) => (
              <Pressable
                key={scope}
                onPress={() => setGoalDraft({ ...goalDraft, scope, targetDate: targetForScope(today, scope) })}
                style={[styles.scopePill, { backgroundColor: goalDraft.scope === scope ? colors.yellow : colors.background }]}
              >
                <Text style={[styles.scopeText, { color: goalDraft.scope === scope ? '#FFFFFF' : colors.secondary }]}>{scope[0].toUpperCase() + scope.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setDatePickerOpen((open) => !open)} style={styles.dateRow}>
            <Text style={[styles.fieldLabel, { color: colors.secondary }]}>Target</Text>
            <Text style={[styles.dateValue, { color: colors.yellow }]}>{formatLongDate(goalDraft.targetDate)}</Text>
          </Pressable>
          {datePickerOpen && (
            <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={dateFromISO(today)} mode="date" onChange={changeGoalDate} value={dateFromISO(goalDraft.targetDate)} />
          )}
          <TextInput
            multiline
            onChangeText={(notes) => setGoalDraft({ ...goalDraft, notes })}
            placeholder="Why does this matter? (optional)"
            placeholderTextColor={colors.tertiary}
            style={[styles.notesInput, { color: colors.text, borderColor: colors.separator }]}
            value={goalDraft.notes ?? ''}
          />
          <ComposerActions colors={colors} onCancel={() => setGoalDraft(null)} onDelete={goalDraft.id ? async () => { await onDeleteGoal(goalDraft.id!); setGoalDraft(null); } : undefined} onSave={() => void submitGoal()} saveDisabled={!goalDraft.title.trim()} />
        </View>
      )}
      {activeGoals.map((goal) => {
        const expanded = expandedGoalId === goal.id;
        const steps = goalSteps.filter((step) => step.goalId === goal.id);
        const completedCount = steps.filter((step) => step.completed).length;
        return (
          <Fragment key={goal.id}>
            <Pressable onPress={() => { setExpandedGoalId(expanded ? null : goal.id); setGoalStepDraft(null); }} style={[styles.goalCard, { backgroundColor: colors.yellowSoft }]}>
              <Pressable
                accessibilityLabel={`Complete ${goal.title}`}
                hitSlop={8}
                onPress={(event) => { event.stopPropagation(); void onToggleGoal(goal); }}
                style={styles.goalStarButton}
              >
                <Text style={[styles.goalStar, { color: colors.yellow }]}>☆</Text>
              </Pressable>
              <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, { color: colors.yellow }]} numberOfLines={1}>{goal.title}</Text>
                <Text style={[styles.cardEyebrow, { color: colors.yellow }]}>{goal.scope.toUpperCase()} · {formatLongDate(goal.targetDate).toUpperCase()}{steps.length ? ` · ${completedCount}/${steps.length}` : ''}</Text>
              </View>
              <Text style={[styles.disclosure, { color: colors.yellow }]}>{expanded ? '−' : '+'}</Text>
            </Pressable>
            {expanded && (
              <View style={[styles.goalDetail, { borderColor: colors.separator, backgroundColor: colors.card }]}>
                <View style={styles.goalDetailHeader}>
                  <View style={styles.cardCopy}>
                    <Text style={[styles.goalDetailMeta, { color: colors.secondary }]}>{goal.scope[0].toUpperCase() + goal.scope.slice(1)} goal · due {formatLongDate(goal.targetDate)}</Text>
                    {goal.notes && <Text style={[styles.goalNotes, { color: colors.text }]}>{goal.notes}</Text>}
                  </View>
                  <Pressable hitSlop={8} onPress={() => beginGoal(goal)}><Text style={[styles.editGoal, { color: colors.blue }]}>Edit</Text></Pressable>
                </View>
                {steps.length > 0 && (
                  <View style={[styles.progressTrack, { backgroundColor: colors.separator }]}>
                    <View style={[styles.progressFill, { backgroundColor: colors.yellow, width: `${(completedCount / steps.length) * 100}%` }]} />
                  </View>
                )}
                <View style={styles.subgoalHeader}>
                  <Text style={[styles.subgoalTitle, { color: colors.text }]}>Subgoals</Text>
                  {!goalStepDraft && <Pressable hitSlop={8} onPress={() => setGoalStepDraft({ goalId: goal.id, title: '', scheduledDate: today })}><Text style={[styles.addSubgoal, { color: colors.blue }]}>Add</Text></Pressable>}
                </View>
                {steps.map((step) => (
                  <Pressable
                    key={step.id}
                    onLongPress={() => Alert.alert('Remove this subgoal?', 'Its linked task will also be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void onDeleteGoalStep(step) }])}
                    onPress={() => void onToggleGoalStep(step)}
                    style={[styles.subgoalRow, { borderColor: colors.separator }]}
                  >
                    <View style={[styles.subgoalCheck, { borderColor: step.completed ? colors.yellow : colors.tertiary }, step.completed && { backgroundColor: colors.yellow }]}>{step.completed && <Text style={styles.checkmark}>✓</Text>}</View>
                    <Text style={[styles.subgoalName, { color: step.completed ? colors.tertiary : colors.text }, step.completed && styles.completed]} numberOfLines={1}>{step.title}</Text>
                    <Text style={[styles.subgoalDate, { color: colors.secondary }]}>{formatLongDate(step.scheduledDate)}</Text>
                  </Pressable>
                ))}
                {steps.length === 0 && !goalStepDraft && <Text style={[styles.noSubgoals, { color: colors.secondary }]}>Break this goal into something you can do on a specific day.</Text>}
                {goalStepDraft?.goalId === goal.id && (
                  <View style={[styles.stepComposer, { borderColor: colors.separator }]}>
                    <TextInput autoFocus onChangeText={(title) => setGoalStepDraft({ ...goalStepDraft, title })} placeholder="First step" placeholderTextColor={colors.tertiary} style={[styles.stepInput, { color: colors.text }]} value={goalStepDraft.title} />
                    <Pressable onPress={() => setStepDatePickerOpen((open) => !open)} style={styles.stepDateButton}>
                      <Text style={[styles.fieldLabel, { color: colors.secondary }]}>Do on</Text>
                      <Text style={[styles.dateValue, { color: colors.blue }]}>{formatLongDate(goalStepDraft.scheduledDate)}</Text>
                    </Pressable>
                    {stepDatePickerOpen && <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} maximumDate={dateFromISO(goal.targetDate)} minimumDate={dateFromISO(today)} mode="date" onChange={changeStepDate} value={dateFromISO(goalStepDraft.scheduledDate)} />}
                    <ComposerActions colors={colors} onCancel={() => { setGoalStepDraft(null); setStepDatePickerOpen(false); }} onSave={() => void submitGoalStep()} saveDisabled={!goalStepDraft.title.trim()} />
                  </View>
                )}
              </View>
            )}
          </Fragment>
        );
      })}
      {activeGoals.length === 0 && !goalDraft && <Empty colors={colors} text="No active goals yet. Add one that deserves to stay in view." />}
      {completedGoals.length > 0 && (
        <View style={styles.completedGroup}>
          <Text style={[styles.completedLabel, { color: colors.secondary }]}>COMPLETED</Text>
          {completedGoals.map((goal) => (
            <Pressable key={goal.id} onLongPress={() => beginGoal(goal)} onPress={() => void onToggleGoal(goal)} style={styles.completedRow}>
              <Text style={[styles.completedStar, { color: colors.tertiary }]}>★</Text>
              <Text style={[styles.completedTitle, { color: colors.tertiary }]}>{goal.title}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <SectionTitle action="Add habit" colors={colors} onAction={() => beginHabit()} title="Habits" />
      {habitDraft && (
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.separator }]}> 
          <TextInput
            autoFocus
            onChangeText={(name) => setHabitDraft({ ...habitDraft, name })}
            placeholder="What do you want to repeat?"
            placeholderTextColor={colors.tertiary}
            style={[styles.composerTitle, { color: colors.text, borderColor: colors.separator }]}
            value={habitDraft.name}
          />
          <Text style={[styles.schedulePrompt, { color: colors.secondary }]}>Repeat on</Text>
          <WeekdayPicker colors={colors} selected={habitDraft.weekdays} onChange={(weekdays) => setHabitDraft({ ...habitDraft, weekdays })} />
          <ComposerActions colors={colors} onCancel={() => setHabitDraft(null)} onDelete={habitDraft.id ? async () => { await onArchiveHabit(habitDraft.id!); setHabitDraft(null); } : undefined} onSave={() => void submitHabit()} saveDisabled={!habitDraft.name.trim() || habitDraft.weekdays.length === 0} />
        </View>
      )}
      {habits.map((habit) => {
        const dueToday = habit.weekdays.includes(currentWeekday);
        return (
          <Pressable key={habit.id} onLongPress={() => beginHabit(habit)} onPress={() => dueToday && void onToggleHabit(habit)} style={[styles.habitRow, { borderColor: colors.separator }]}> 
            <View style={[styles.habitCheck, { borderColor: habit.completedOnDate ? colors.blue : colors.tertiary }, habit.completedOnDate && { backgroundColor: colors.blue }]}>
              {habit.completedOnDate && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.cardCopy}>
              <Text style={[styles.habitTitle, { color: dueToday ? colors.text : colors.secondary }]}>{habit.name}</Text>
              <View style={styles.miniWeekdays}>
                {WEEKDAYS.map((day) => <Text key={day.value} style={[styles.miniWeekday, { color: habit.weekdays.includes(day.value) ? colors.blue : colors.tertiary }]}>{day.label}</Text>)}
              </View>
            </View>
            <Text style={[styles.todayStatus, { color: habit.completedOnDate ? colors.blue : colors.secondary }]}>{dueToday ? habit.completedOnDate ? 'Done' : 'Today' : ''}</Text>
          </Pressable>
        );
      })}
      {habits.length === 0 && !habitDraft && <Empty colors={colors} text="No habits yet. Start with one small rhythm." />}

      <Text style={[styles.hint, { color: colors.tertiary }]}>Tap to complete · press and hold to edit</Text>
    </ScrollView>
  );
}

function SectionTitle({ title, action, colors, onAction }: { title: string; action: string; colors: AppColors; onAction: () => void }) {
  return <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Pressable hitSlop={8} onPress={onAction}><Text style={[styles.sectionAction, { color: colors.blue }]}>{action}</Text></Pressable></View>;
}

function WeekdayPicker({ selected, colors, onChange }: { selected: ISOWeekday[]; colors: AppColors; onChange: (days: ISOWeekday[]) => void }) {
  return <View style={styles.weekdays}>{WEEKDAYS.map((day) => { const active = selected.includes(day.value); return <Pressable key={day.value} onPress={() => onChange(active ? selected.filter((value) => value !== day.value) : [...selected, day.value])} style={[styles.weekday, { backgroundColor: active ? colors.blue : colors.background, borderColor: active ? colors.blue : colors.separator }]}><Text style={[styles.weekdayText, { color: active ? '#FFFFFF' : colors.secondary }]}>{day.label}</Text></Pressable>; })}</View>;
}

function ComposerActions({ colors, onCancel, onDelete, onSave, saveDisabled }: { colors: AppColors; onCancel: () => void; onDelete?: () => Promise<void>; onSave: () => void; saveDisabled: boolean }) {
  return <View style={styles.actions}>{onDelete && <Pressable onPress={() => Alert.alert('Remove this item?', 'This keeps your past calendar intact.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void onDelete() }])}><Text style={[styles.deleteAction, { color: colors.red }]}>Remove</Text></Pressable>}<View style={styles.actionSpacer} /><Pressable onPress={onCancel}><Text style={[styles.cancelAction, { color: colors.secondary }]}>Cancel</Text></Pressable><Pressable disabled={saveDisabled} onPress={onSave} style={[styles.saveAction, { backgroundColor: colors.blue, opacity: saveDisabled ? 0.4 : 1 }]}><Text style={styles.saveText}>Save</Text></Pressable></View>;
}

function Empty({ text, colors }: { text: string; colors: AppColors }) {
  return <View style={[styles.empty, { backgroundColor: colors.card }]}><Text style={[styles.emptyText, { color: colors.secondary }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 112 },
  intro: { marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.15 },
  title: { fontSize: 31, lineHeight: 36, fontWeight: '700', letterSpacing: -1, marginTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 5, maxWidth: 330 },
  sectionHeader: { height: 42, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.4 },
  sectionAction: { fontSize: 14, fontWeight: '600' },
  goalCard: { minHeight: 46, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 7 },
  goalStarButton: { width: 25, height: 28, alignItems: 'center', justifyContent: 'center' },
  goalStar: { fontSize: 21, lineHeight: 24 },
  cardCopy: { flex: 1 },
  cardEyebrow: { fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.65, marginTop: 1 },
  cardTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  disclosure: { width: 20, textAlign: 'center', fontSize: 18, lineHeight: 20, fontWeight: '500' },
  goalDetail: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 8, marginTop: -2, marginBottom: 9 },
  goalDetailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  goalDetailMeta: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  goalNotes: { fontSize: 14, lineHeight: 19, marginTop: 5 },
  editGoal: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 10 },
  progressFill: { height: 3, borderRadius: 2 },
  subgoalHeader: { height: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  subgoalTitle: { fontSize: 14, fontWeight: '700' },
  addSubgoal: { fontSize: 12, fontWeight: '700' },
  subgoalRow: { minHeight: 42, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  subgoalCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  subgoalName: { flex: 1, fontSize: 13, fontWeight: '600' },
  subgoalDate: { maxWidth: 105, marginLeft: 8, fontSize: 10, fontWeight: '600' },
  completed: { textDecorationLine: 'line-through' },
  noSubgoals: { fontSize: 12, lineHeight: 17, paddingBottom: 8 },
  stepComposer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 3 },
  stepInput: { height: 40, fontSize: 15, fontWeight: '600' },
  stepDateButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completedGroup: { paddingHorizontal: 4, marginBottom: 8 },
  completedLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },
  completedRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9 },
  completedStar: { fontSize: 17 },
  completedTitle: { fontSize: 14, textDecorationLine: 'line-through' },
  habitRow: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  habitCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  habitTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  miniWeekdays: { flexDirection: 'row', gap: 7, marginTop: 3 },
  miniWeekday: { fontSize: 9, fontWeight: '700' },
  todayStatus: { fontSize: 12, fontWeight: '700' },
  composer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 13, marginBottom: 10 },
  composerTitle: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 17, fontWeight: '600', paddingVertical: 0 },
  scopeRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  scopePill: { minWidth: 72, height: 30, borderRadius: 15, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  scopeText: { fontSize: 12, fontWeight: '700' },
  dateRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 14 },
  dateValue: { fontSize: 14, fontWeight: '700' },
  notesInput: { minHeight: 50, maxHeight: 100, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, fontSize: 14 },
  schedulePrompt: { fontSize: 12, fontWeight: '600', marginTop: 11, marginBottom: 8 },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: 12, fontWeight: '700' },
  actions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  actionSpacer: { flex: 1 },
  deleteAction: { fontSize: 13, fontWeight: '600' },
  cancelAction: { fontSize: 13, fontWeight: '600' },
  saveAction: { height: 32, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  empty: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 15, marginBottom: 7 },
  emptyText: { fontSize: 13, lineHeight: 18 },
  hint: { textAlign: 'center', fontSize: 11, marginTop: 18 },
});
