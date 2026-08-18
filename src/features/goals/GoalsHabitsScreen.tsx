import { useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import type {
  Goal,
  GoalDraft,
  GoalHorizon,
  GoalScope,
  GoalStep,
  GoalStepDraft,
  Habit,
  HabitActivity,
  HabitDraft,
  ISOWeekday,
  ItemDraft,
  ItemKind,
} from '@/models/planning';
import { addLocalDays, dateFromISO, formatLongDate, localISO } from '@/shared/date';
import { timeMinutes } from '@/shared/time';
import type { AppColors } from '@/theme/colors';
import { habitEventDuration, habitEventEndTime, isHabitScheduledOn, isoWeekdayForDate, scheduledHabitDates } from './habitSchedule';
import { PlanChatHome, YourPlansHome } from './PlanHome';

interface GoalsHabitsScreenProps {
  colors: AppColors;
  goalSteps: GoalStep[];
  goals: Goal[];
  habitActivity: HabitActivity[];
  habits: Habit[];
  initialGoalId?: string | null;
  today: string;
  onArchiveHabit: (id: string) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onDeleteGoalStep: (step: GoalStep) => Promise<void>;
  onSaveGoal: (draft: GoalDraft) => Promise<string>;
  onSaveGoalStep: (draft: GoalStepDraft) => Promise<void>;
  onSaveHabit: (draft: HabitDraft) => Promise<string>;
  onSaveItem: (draft: ItemDraft) => Promise<void>;
  onToggleGoal: (goal: Goal) => Promise<void>;
  onToggleGoalStep: (step: GoalStep) => Promise<void>;
  onToggleHabitDate: (habit: Habit, date: string) => Promise<void>;
  onToggleHabitSkip: (habit: Habit, date: string) => Promise<void>;
}

const WEEKDAYS: { value: ISOWeekday; label: string }[] = [
  { value: 1, label: 'M' }, { value: 2, label: 'T' }, { value: 3, label: 'W' },
  { value: 4, label: 'T' }, { value: 5, label: 'F' }, { value: 6, label: 'S' },
  { value: 7, label: 'S' },
];
const HORIZONS: GoalHorizon[] = ['month', 'quarter', 'year', 'someday'];
const EVENT_DURATIONS = [30, 45, 60, 90, 120];

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hr';
  if (minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function weekdayFor(date: string): ISOWeekday {
  return isoWeekdayForDate(date);
}

function targetForHorizon(today: string, horizon: GoalHorizon) {
  const date = dateFromISO(today);
  if (horizon === 'month') return localISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  if (horizon === 'quarter') {
    const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 3;
    return localISO(new Date(date.getFullYear(), quarterEndMonth, 0));
  }
  if (horizon === 'someday') return '9999-12-31';
  return `${date.getFullYear()}-12-31`;
}

function scopeForHorizon(horizon: GoalHorizon): GoalScope {
  return horizon === 'someday' ? 'year' : horizon;
}

function goalDraftFor(goal: Goal): GoalDraft {
  return {
    id: goal.id,
    title: goal.title,
    scope: goal.scope,
    horizon: goal.horizon,
    startsOn: goal.startsOn,
    targetDate: goal.targetDate,
    completionDate: goal.completionDate,
    notes: goal.notes,
  };
}

function habitDraftFor(habit: Habit): HabitDraft {
  return {
    id: habit.id,
    name: habit.name,
    weekdays: habit.weekdays,
    startDate: habit.startDate,
    endDate: habit.endDate,
    cue: habit.cue,
    itemKind: habit.itemKind,
    startTime: habit.startTime,
    endTime: habit.endTime,
  };
}

export function GoalsHabitsScreen(props: GoalsHabitsScreenProps) {
  const {
    colors, goalSteps, goals, habitActivity, habits, initialGoalId, today,
    onArchiveHabit, onDeleteGoal, onDeleteGoalStep,
    onSaveGoal, onSaveGoalStep, onSaveHabit, onToggleGoal, onToggleGoalStep,
    onSaveItem, onToggleHabitDate, onToggleHabitSkip,
  } = props;
  const [section, setSection] = useState<'chat' | 'plans'>(initialGoalId ? 'plans' : 'chat');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(initialGoalId ?? null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId);
  if (selectedGoal) {
    return (
      <GoalDetailPage
        colors={colors}
        goal={selectedGoal}
        onBack={() => { setSelectedGoalId(null); setSection('plans'); }}
        onDeleteGoal={async () => { await onDeleteGoal(selectedGoal.id); setSelectedGoalId(null); }}
        onDeleteStep={onDeleteGoalStep}
        onSaveGoal={onSaveGoal}
        onSaveStep={onSaveGoalStep}
        onToggleGoal={() => onToggleGoal(selectedGoal)}
        onToggleStep={onToggleGoalStep}
        steps={goalSteps.filter((step) => step.goalId === selectedGoal.id)}
        today={today}
      />
    );
  }

  const selectedHabit = habits.find((habit) => habit.id === selectedHabitId);
  if (selectedHabit) {
    return (
      <HabitDetailPage
        activity={habitActivity.filter((entry) => entry.habitId === selectedHabit.id)}
        colors={colors}
        habit={selectedHabit}
        onArchive={async () => { await onArchiveHabit(selectedHabit.id); setSelectedHabitId(null); }}
        onBack={() => { setSelectedHabitId(null); setSection('plans'); }}
        onSave={onSaveHabit}
        onToggleDate={(date) => onToggleHabitDate(selectedHabit, date)}
        onToggleSkip={(date) => onToggleHabitSkip(selectedHabit, date)}
        today={today}
      />
    );
  }

  if (section === 'plans') {
    return (
      <YourPlansHome
        colors={colors}
        goals={goals}
        habits={habits}
        onBack={() => setSection('chat')}
        onOpenGoal={setSelectedGoalId}
        onOpenHabit={setSelectedHabitId}
        onStartChat={() => setSection('chat')}
      />
    );
  }

  return (
    <PlanChatHome
      colors={colors}
      goals={goals}
      habits={habits}
      onOpenPlans={() => setSection('plans')}
      onSaveGoal={onSaveGoal}
      onSaveHabit={onSaveHabit}
      onSaveItem={onSaveItem}
      today={today}
    />
  );
}

function GoalDetailPage({ colors, goal, onBack, onDeleteGoal, onDeleteStep, onSaveGoal, onSaveStep, onToggleGoal, onToggleStep, steps, today }: {
  colors: AppColors;
  goal: Goal;
  onBack: () => void;
  onDeleteGoal: () => Promise<void>;
  onDeleteStep: (step: GoalStep) => Promise<void>;
  onSaveGoal: (draft: GoalDraft) => Promise<string>;
  onSaveStep: (draft: GoalStepDraft) => Promise<void>;
  onToggleGoal: () => Promise<void>;
  onToggleStep: (step: GoalStep) => Promise<void>;
  steps: GoalStep[];
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => goalDraftFor(goal));
  const [stepDraft, setStepDraft] = useState<GoalStepDraft | null>(null);
  const [stepPickerOpen, setStepPickerOpen] = useState(false);

  async function saveStep() {
    if (!stepDraft?.title.trim()) return;
    await onSaveStep(stepDraft);
    setStepDraft(null);
    setStepPickerOpen(false);
  }

  return (
    <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.workspaceContent} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.screen}>
      <PageBackButton colors={colors} label="Your Plans" onBack={onBack} />
      <View style={[styles.goalWorkspaceTitle, { backgroundColor: colors.yellowSoft }]}>
        <Pressable accessibilityLabel={goal.completed ? `Mark ${goal.title} active` : `Mark ${goal.title} accomplished`} hitSlop={8} onPress={() => void onToggleGoal()} style={[styles.workspaceStar, { backgroundColor: goal.completed ? '#FFFFFF' : colors.yellow }]}><Text style={[styles.workspaceStarText, { color: goal.completed ? '#FFB000' : '#FFFFFF' }]}>★</Text></Pressable>
        <View style={styles.cardCopy}><Text style={[styles.eyebrow, { color: colors.yellow }]}>{goal.horizon.toUpperCase()} GOAL</Text><Text style={[styles.workspaceTitle, { color: colors.yellow }]}>{goal.title}</Text><Text style={[styles.workspaceMeta, { color: colors.yellow }]}>{goal.completionDate ? `Completion date ${formatLongDate(goal.completionDate)}` : 'No fixed completion date'}</Text></View>
        {!editing && <Pressable hitSlop={8} onPress={() => { setDraft(goalDraftFor(goal)); setEditing(true); }} style={styles.goalEditButton}><Text style={[styles.editAction, { color: colors.yellow }]}>Edit</Text></Pressable>}
      </View>

      {editing && <View style={[styles.editSurface, { backgroundColor: colors.yellowSoft }]}><GoalForm colors={colors} draft={draft} onChange={setDraft} today={today} /><View style={styles.editorActions}><Pressable onPress={() => Alert.alert('Remove this goal?', 'Its linked tasks will also be removed from future days.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void onDeleteGoal() }])}><Text style={[styles.deleteAction, { color: colors.red }]}>Remove</Text></Pressable><View style={styles.actionSpacer} /><Pressable onPress={() => setEditing(false)}><Text style={[styles.cancelAction, { color: colors.secondary }]}>Cancel</Text></Pressable><Pressable onPress={async () => { await onSaveGoal(draft); setEditing(false); }} style={[styles.smallSave, { backgroundColor: colors.yellow }]}><Text style={styles.saveText}>Save</Text></Pressable></View></View>}
      {!editing && goal.notes && <Text style={[styles.goalNotes, { color: colors.secondary }]}>{goal.notes}</Text>}

      <View style={styles.goalTasksSection}>
        <SectionHeading action="Add task" colors={colors} onAction={() => setStepDraft({ goalId: goal.id, title: '', scheduledDate: today })} subtitle="Small steps that move this goal forward." title="Tasks" />
        <View style={[styles.goalTaskList, { borderColor: colors.separator }]}>
          {steps.map((step) => <Pressable accessibilityLabel={step.completed ? `Mark ${step.title} incomplete` : `Complete ${step.title}`} key={step.id} onLongPress={() => void onDeleteStep(step)} onPress={() => void onToggleStep(step)} style={[styles.goalTaskRow, { borderColor: colors.separator }]}><View style={[styles.goalTaskCheck, { borderColor: step.completed ? colors.blue : colors.tertiary }, step.completed && { backgroundColor: colors.blue }]}>{step.completed && <Text style={styles.checkmark}>✓</Text>}</View><View style={styles.cardCopy}><Text style={[styles.projectTitle, { color: step.completed ? colors.tertiary : colors.text }, step.completed && styles.completed]}>{step.title}</Text><Text style={[styles.projectDate, { color: step.scheduledDate < today && !step.completed ? colors.red : colors.secondary }]}>Scheduled {formatLongDate(step.scheduledDate)}</Text></View></Pressable>)}
          {!steps.length && !stepDraft && <Text style={[styles.goalTaskEmpty, { color: colors.secondary }]}>No tasks yet. Add the first thing that needs to happen.</Text>}
          {stepDraft && <View style={[styles.stepComposer, { borderColor: colors.separator }]}><TextInput autoFocus onChangeText={(title) => setStepDraft({ ...stepDraft, title })} placeholder="What needs to happen?" placeholderTextColor={colors.tertiary} style={[styles.stepInput, { color: colors.text }]} value={stepDraft.title} /><Pressable onPress={() => setStepPickerOpen((open) => !open)} style={styles.dateRow}><Text style={[styles.fieldLabel, { color: colors.secondary }]}>Schedule for</Text><Text style={[styles.dateValue, { color: colors.blue }]}>{formatLongDate(stepDraft.scheduledDate)}</Text></Pressable>{stepPickerOpen && <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={dateFromISO(today)} mode="date" onChange={(_, selected) => { if (Platform.OS !== 'ios') setStepPickerOpen(false); if (selected) setStepDraft({ ...stepDraft, scheduledDate: localISO(selected) }); }} value={dateFromISO(stepDraft.scheduledDate)} />}<EditorActions colors={colors} onCancel={() => { setStepDraft(null); setStepPickerOpen(false); }} onSave={() => void saveStep()} saveDisabled={!stepDraft.title.trim()} /></View>}
        </View>
        <Text style={[styles.goalTaskHint, { color: colors.tertiary }]}>These also appear as tasks on their scheduled days. Long-press one to remove it.</Text>
      </View>
    </ScrollView>
  );
}

function GoalForm({ colors, draft, onChange, today }: { colors: AppColors; draft: GoalDraft; onChange: (draft: GoalDraft) => void; today: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <View style={styles.formFields}>
      <Text style={[styles.formLabel, { color: colors.secondary }]}>GOAL NAME</Text>
      <TextInput autoFocus onChangeText={(title) => onChange({ ...draft, title })} placeholder="Race my first Ironman" placeholderTextColor={colors.tertiary} style={[styles.largeInput, { color: colors.text, borderColor: colors.separator }]} value={draft.title} />
      <Text style={[styles.formLabel, { color: colors.secondary }]}>TIMELINE</Text>
      <View style={styles.segmentRow}>{HORIZONS.map((horizon) => { const active = draft.horizon === horizon; return <Pressable key={horizon} onPress={() => onChange({ ...draft, horizon, scope: scopeForHorizon(horizon), targetDate: targetForHorizon(today, horizon), completionDate: undefined })} style={[styles.segmentPill, { backgroundColor: active ? colors.yellow : colors.background, borderColor: active ? colors.yellow : colors.separator }]}><Text style={[styles.segmentText, { color: active ? '#FFFFFF' : colors.secondary }]}>{horizon[0].toUpperCase() + horizon.slice(1)}</Text></Pressable>; })}</View>
      <Pressable onPress={() => setPickerOpen((open) => !open)} style={[styles.formRow, { borderColor: colors.separator }]}><View><Text style={[styles.formRowTitle, { color: colors.text }]}>Goal completion date</Text><Text style={[styles.formRowMeta, { color: colors.secondary }]}>{draft.completionDate ? formatLongDate(draft.completionDate) : 'Optional'}</Text></View><Text style={[styles.formRowAction, { color: colors.blue }]}>{draft.completionDate ? 'Change' : 'Add'}</Text></Pressable>
      {pickerOpen && <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={dateFromISO(today)} mode="date" onChange={(_, selected) => { if (Platform.OS !== 'ios') setPickerOpen(false); if (selected) { const completionDate = localISO(selected); onChange({ ...draft, completionDate, targetDate: completionDate }); } }} value={dateFromISO(draft.completionDate ?? (draft.horizon === 'someday' ? today : draft.targetDate))} />}
      {draft.completionDate && <Pressable onPress={() => onChange({ ...draft, completionDate: undefined, targetDate: targetForHorizon(today, draft.horizon) })}><Text style={[styles.removeDate, { color: colors.secondary }]}>Remove completion date</Text></Pressable>}
      <Text style={[styles.formLabel, { color: colors.secondary }]}>NOTES</Text>
      <TextInput multiline onChangeText={(notes) => onChange({ ...draft, notes })} placeholder="What would accomplishing this make possible?" placeholderTextColor={colors.tertiary} style={[styles.notesInput, { color: colors.text, borderColor: colors.separator }]} value={draft.notes ?? ''} />
    </View>
  );
}

function HabitDetailPage({ activity, colors, habit, onArchive, onBack, onSave, onToggleDate, onToggleSkip, today }: {
  activity: HabitActivity[];
  colors: AppColors;
  habit: Habit;
  onArchive: () => Promise<void>;
  onBack: () => void;
  onSave: (draft: HabitDraft) => Promise<string>;
  onToggleDate: (date: string) => Promise<void>;
  onToggleSkip: (date: string) => Promise<void>;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => habitDraftFor(habit));
  const [schedulePicker, setSchedulePicker] = useState<'time' | 'duration' | null>(null);
  const todayCompleted = activity.some((entry) => entry.date === today && entry.completed);
  const dueToday = isHabitScheduledOn(habit, today);
  const eventDuration = habitEventDuration(habit.startTime, habit.endTime);

  async function updateHabit(change: Partial<HabitDraft>) {
    await onSave({ ...habitDraftFor(habit), ...change });
  }

  async function changeItemKind(kind: ItemKind) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSchedulePicker(null);
    await updateHabit({
      itemKind: kind,
      startTime: kind === 'event' ? habit.startTime ?? '7:00 AM' : undefined,
      endTime: kind === 'event' ? habit.endTime ?? '8:00 AM' : undefined,
    });
  }

  return (
    <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.habitDetailContent} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.screen}>
      <PageBackButton colors={colors} label="Your Plans" onBack={onBack} />
      <View style={styles.habitDetailTitleRow}><View style={styles.cardCopy}><Text style={[styles.eyebrow, { color: colors.blue }]}>ROUTINE</Text><Text style={[styles.habitDetailTitle, { color: colors.text }]}>{habit.name}</Text><Text style={[styles.workspaceMeta, { color: colors.secondary }]}>{habit.itemKind === 'event' ? `${habit.startTime ?? 'Timed'} event` : 'Creates a task'} on scheduled days</Text></View>{!editing && <Pressable hitSlop={8} onPress={() => { setDraft(habitDraftFor(habit)); setEditing(true); }}><Text style={[styles.editAction, { color: colors.blue }]}>Edit</Text></Pressable>}</View>
      {editing && <HabitComposer colors={colors} draft={draft} onCancel={() => setEditing(false)} onDelete={onArchive} onSave={async (nextDraft) => { await onSave(nextDraft); setEditing(false); }} onSetDraft={setDraft} today={today} />}

      {!editing && dueToday && <Pressable onPress={() => void onToggleDate(today)} style={[styles.todayCheckIn, { backgroundColor: todayCompleted ? colors.blue : colors.blueSoft }]}><View style={[styles.todayCheckCircle, { borderColor: todayCompleted ? '#FFFFFF' : colors.blue }, todayCompleted && { backgroundColor: '#FFFFFF' }]}>{todayCompleted && <Text style={[styles.todayCheckmark, { color: colors.blue }]}>✓</Text>}</View><View style={styles.cardCopy}><Text style={[styles.todayCheckTitle, { color: todayCompleted ? '#FFFFFF' : colors.blue }]}>{todayCompleted ? 'Completed today' : 'Complete today'}</Text><Text style={[styles.todayCheckMeta, { color: todayCompleted ? 'rgba(255,255,255,0.78)' : colors.secondary }]}>Updates the {habit.itemKind} and this tracker together</Text></View></Pressable>}

      <HabitTracker activity={activity} colors={colors} habit={habit} onToggleDate={onToggleDate} onToggleSkip={onToggleSkip} today={today} />

      <View style={styles.habitInfoSection}>
        <SectionHeading colors={colors} subtitle="Tap a day to turn it on or off." title="Schedule" />
        <WeekdayPicker colors={colors} selected={habit.weekdays} onChange={(weekdays) => { if (weekdays.length) void updateHabit({ weekdays }); }} />
        <View style={[styles.behaviorCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.behaviorTitle, { color: colors.text }]}>Create on scheduled days</Text>
          <View style={styles.kindRow}>
            {(['task', 'event'] as ItemKind[]).map((kind) => (
              <Pressable key={kind} onPress={() => void changeItemKind(kind)} style={[styles.kindPill, { backgroundColor: habit.itemKind === kind ? colors.blue : colors.background }]}>
                <Text style={[styles.kindText, { color: habit.itemKind === kind ? '#FFFFFF' : colors.secondary }]}>{kind === 'task' ? 'Task' : 'Event'}</Text>
              </Pressable>
            ))}
          </View>
          {habit.itemKind === 'event' && (
            <View style={[styles.eventSettings, { borderTopColor: colors.separator }]}>
              <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSchedulePicker((open) => open === 'time' ? null : 'time'); }} style={styles.behaviorSettingRow}>
                <View><Text style={[styles.behaviorSettingTitle, { color: colors.text }]}>Starts</Text><Text style={[styles.behaviorSettingMeta, { color: colors.secondary }]}>On every scheduled day</Text></View>
                <Text style={[styles.behaviorSettingValue, { color: colors.blue }]}>{habit.startTime ?? '7:00 AM'}</Text>
              </Pressable>
              {schedulePicker === 'time' && <DateTimePicker display={Platform.OS === 'ios' ? 'spinner' : 'default'} mode="time" onChange={(_, selected) => { if (!selected) return; const startTime = formatTime(selected); void updateHabit({ startTime, endTime: habitEventEndTime(startTime, eventDuration) }); }} value={dateForTime(habit.startTime)} />}
              <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSchedulePicker((open) => open === 'duration' ? null : 'duration'); }} style={[styles.behaviorSettingRow, { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View><Text style={[styles.behaviorSettingTitle, { color: colors.text }]}>Length</Text><Text style={[styles.behaviorSettingMeta, { color: colors.secondary }]}>How long to protect</Text></View>
                <Text style={[styles.behaviorSettingValue, { color: colors.blue }]}>{durationLabel(eventDuration)}</Text>
              </Pressable>
              {schedulePicker === 'duration' && <View style={styles.durationOptions}>{EVENT_DURATIONS.map((minutes) => { const selected = eventDuration === minutes; return <Pressable key={minutes} onPress={() => { void updateHabit({ endTime: habitEventEndTime(habit.startTime, minutes) }); setSchedulePicker(null); }} style={[styles.durationOption, { backgroundColor: selected ? colors.blue : colors.background }]}><Text style={[styles.durationOptionText, { color: selected ? '#FFFFFF' : colors.secondary }]}>{durationLabel(minutes)}</Text></Pressable>; })}</View>}
              <Text style={[styles.behaviorMeta, { color: colors.secondary }]}>After the event passes, Calendream can ask whether you completed it.</Text>
            </View>
          )}
        </View>
        <View style={styles.startedRow}><Text style={[styles.startedText, { color: colors.tertiary }]}>Started {formatLongDate(habit.startDate)}</Text></View>
      </View>
      <Text style={[styles.hint, { color: colors.tertiary }]}>Tap a past square to update it. Long-press to mark a planned rest day.</Text>
    </ScrollView>
  );
}

function HabitComposer({ colors, draft: initialDraft, onCancel, onDelete, onSave, onSetDraft, today }: {
  colors: AppColors;
  draft: HabitDraft;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onSave: (draft: HabitDraft) => Promise<void>;
  onSetDraft?: (draft: HabitDraft) => void;
  today: string;
}) {
  const [internalDraft, setInternalDraft] = useState(initialDraft);
  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const draft = onSetDraft ? initialDraft : internalDraft;
  function change(next: HabitDraft) { if (onSetDraft) onSetDraft(next); else setInternalDraft(next); }
  return (
    <View style={[styles.habitComposer, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <TextInput autoFocus onChangeText={(name) => change({ ...draft, name })} placeholder="What do you want to repeat?" placeholderTextColor={colors.tertiary} style={[styles.largeInput, { color: colors.text, borderColor: colors.separator }]} value={draft.name} />
      <Text style={[styles.formLabel, { color: colors.secondary }]}>REPEAT</Text>
      <WeekdayPicker colors={colors} selected={draft.weekdays} onChange={(weekdays) => change({ ...draft, weekdays })} />
      <Text style={[styles.formLabel, { color: colors.secondary }]}>CREATE AS</Text>
      <View style={styles.kindRow}>{(['task', 'event'] as ItemKind[]).map((kind) => { const active = draft.itemKind === kind; return <Pressable key={kind} onPress={() => change({ ...draft, itemKind: kind, startTime: kind === 'event' ? draft.startTime ?? '7:00 AM' : undefined, endTime: kind === 'event' ? draft.endTime ?? '8:00 AM' : undefined })} style={[styles.kindPill, { backgroundColor: active ? colors.blue : colors.background }]}><Text style={[styles.kindText, { color: active ? '#FFFFFF' : colors.secondary }]}>{kind === 'task' ? 'Task' : 'Event'}</Text></Pressable>; })}</View>
      {draft.itemKind === 'event' && <><Pressable onPress={() => setTimePicker(timePicker === 'start' ? null : 'start')} style={[styles.formRow, { borderColor: colors.separator }]}><Text style={[styles.formRowTitle, { color: colors.text }]}>Starts</Text><Text style={[styles.formRowAction, { color: colors.blue }]}>{draft.startTime ?? '7:00 AM'}</Text></Pressable>{timePicker === 'start' && <DateTimePicker display="spinner" mode="time" onChange={(_, selected) => { if (selected) change({ ...draft, startTime: formatTime(selected) }); }} value={dateForTime(draft.startTime)} />}<Pressable onPress={() => setTimePicker(timePicker === 'end' ? null : 'end')} style={[styles.formRow, { borderColor: colors.separator }]}><Text style={[styles.formRowTitle, { color: colors.text }]}>Ends</Text><Text style={[styles.formRowAction, { color: colors.blue }]}>{draft.endTime ?? '8:00 AM'}</Text></Pressable>{timePicker === 'end' && <DateTimePicker display="spinner" mode="time" onChange={(_, selected) => { if (selected) change({ ...draft, endTime: formatTime(selected) }); }} value={dateForTime(draft.endTime ?? '8:00 AM')} />}</>}
      <TextInput onChangeText={(cue) => change({ ...draft, cue })} placeholder="Anchor it: after coffee, before dinner…" placeholderTextColor={colors.tertiary} style={[styles.habitCueInput, { color: colors.text, borderColor: colors.separator }]} value={draft.cue ?? ''} />
      <Pressable onPress={() => setEndPickerOpen((open) => !open)} style={[styles.formRow, { borderColor: colors.separator }]}><View><Text style={[styles.formRowTitle, { color: colors.text }]}>Duration</Text><Text style={[styles.formRowMeta, { color: colors.secondary }]}>{draft.endDate ? `Until ${formatLongDate(draft.endDate)}` : 'Ongoing'}</Text></View><Text style={[styles.formRowAction, { color: colors.blue }]}>{draft.endDate ? 'Change' : 'Set end'}</Text></Pressable>
      {endPickerOpen && <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={dateFromISO(today)} mode="date" onChange={(_, selected) => { if (Platform.OS !== 'ios') setEndPickerOpen(false); if (selected) change({ ...draft, endDate: localISO(selected) }); }} value={dateFromISO(draft.endDate ?? addLocalDays(today, 28))} />}
      {draft.endDate && <Pressable onPress={() => change({ ...draft, endDate: undefined })}><Text style={[styles.removeDate, { color: colors.secondary }]}>Make this habit ongoing</Text></Pressable>}
      <EditorActions colors={colors} onCancel={onCancel} onDelete={onDelete} onSave={() => void onSave(draft)} saveDisabled={!draft.name.trim() || !draft.weekdays.length || (draft.itemKind === 'event' && (!draft.startTime || !draft.endTime))} />
    </View>
  );
}

function HabitTracker({ activity, colors, habit, onToggleDate, onToggleSkip, today }: { activity: HabitActivity[]; colors: AppColors; habit: Habit; onToggleDate: (date: string) => Promise<void>; onToggleSkip: (date: string) => Promise<void>; today: string }) {
  const tracker = useMemo(() => {
    const todayOffset = weekdayFor(today) - 1;
    const start = addLocalDays(today, -(todayOffset + 19 * 7));
    const weeks = Array.from({ length: 20 }, (_, week) => Array.from({ length: 7 }, (_, day) => addLocalDays(start, week * 7 + day)));
    const completed = new Set(activity.filter((entry) => entry.completed).map((entry) => entry.date));
    const skipped = new Set(activity.filter((entry) => entry.skipped).map((entry) => entry.date));
    const scheduled = scheduledHabitDates(habit, start, today).filter((date) => !skipped.has(date));
    const completedCount = scheduled.filter((date) => completed.has(date)).length;
    let streak = 0;
    for (const date of [...scheduled].reverse()) { if (date === today && !completed.has(date)) continue; if (!completed.has(date)) break; streak += 1; }
    return { weeks, completed, skipped, completedCount, scheduledCount: scheduled.length, streak };
  }, [activity, habit, today]);
  const rate = tracker.scheduledCount ? Math.round((tracker.completedCount / tracker.scheduledCount) * 100) : 0;
  return (
    <View style={[styles.trackerCard, { backgroundColor: colors.card }]}>
      <View style={styles.trackerHeader}><View><Text style={[styles.trackerTitle, { color: colors.text }]}>Activity</Text><Text style={[styles.trackerSubtitle, { color: colors.secondary }]}>Last 20 weeks</Text></View><View style={styles.trackerStats}><TrackerStat colors={colors} label="STREAK" value={`${tracker.streak}`} /><TrackerStat colors={colors} label="RATE" value={`${rate}%`} /><TrackerStat colors={colors} label="DONE" value={`${tracker.completedCount}`} /></View></View>
      <View style={styles.activityBody}><View style={styles.activityLabels}><Text style={[styles.activityLabel, { color: colors.tertiary }]}>M</Text><Text style={[styles.activityLabel, { color: colors.tertiary }]}>W</Text><Text style={[styles.activityLabel, { color: colors.tertiary }]}>F</Text></View><View style={styles.activityWeeks}>{tracker.weeks.map((week) => <View key={week[0]} style={styles.activityWeek}>{week.map((date) => { const scheduled = isHabitScheduledOn(habit, date); const completed = tracker.completed.has(date); const skipped = tracker.skipped.has(date); const future = date > today; return <Pressable disabled={!scheduled || future} key={date} onLongPress={() => Alert.alert('Update this day', formatLongDate(date), [{ text: 'Cancel', style: 'cancel' }, { text: skipped ? 'Remove rest day' : 'Planned rest day', onPress: () => void onToggleSkip(date) }])} onPress={() => void (skipped ? onToggleSkip(date) : onToggleDate(date))} style={[styles.activityCell, { backgroundColor: !scheduled ? colors.background : skipped ? colors.amberSoft : completed ? colors.blue : future ? colors.blueSoft : colors.separator }, date === today && { borderColor: colors.red, borderWidth: 1 }]} />; })}</View>)}</View></View>
      <View style={styles.legend}><Text style={[styles.legendText, { color: colors.tertiary }]}>Missed</Text><View style={[styles.legendCell, { backgroundColor: colors.separator }]} /><View style={[styles.legendCell, { backgroundColor: colors.amberSoft }]} /><View style={[styles.legendCell, { backgroundColor: colors.blue }]} /><Text style={[styles.legendText, { color: colors.tertiary }]}>Complete</Text></View>
    </View>
  );
}

function PageBackButton({ colors, label, onBack }: { colors: AppColors; label: string; onBack: () => void }) {
  return <Pressable hitSlop={8} onPress={onBack} style={[styles.pageBack, { backgroundColor: colors.card }]}><Text style={[styles.pageBackChevron, { color: colors.blue }]}>‹</Text><Text style={[styles.pageBackText, { color: colors.blue }]}>{label}</Text></Pressable>;
}

function SectionHeading({ action, colors, onAction, subtitle, title }: { action?: string; colors: AppColors; onAction?: () => void; subtitle?: string; title: string }) {
  return <View style={styles.sectionHeading}><View style={styles.cardCopy}><Text style={[styles.sectionHeadingTitle, { color: colors.text }]}>{title}</Text>{subtitle && <Text style={[styles.sectionHeadingSubtitle, { color: colors.secondary }]}>{subtitle}</Text>}</View>{action && onAction && <Pressable hitSlop={8} onPress={onAction}><Text style={[styles.sectionHeadingAction, { color: colors.blue }]}>{action}</Text></Pressable>}</View>;
}

function WeekdayPicker({ selected, colors, onChange }: { selected: ISOWeekday[]; colors: AppColors; onChange: (days: ISOWeekday[]) => void }) {
  return <View style={styles.weekdays}>{WEEKDAYS.map((day) => { const active = selected.includes(day.value); return <Pressable key={day.value} onPress={() => onChange(active ? selected.filter((value) => value !== day.value) : [...selected, day.value])} style={[styles.weekday, { backgroundColor: active ? colors.blue : colors.background, borderColor: active ? colors.blue : colors.separator }]}><Text style={[styles.weekdayText, { color: active ? '#FFFFFF' : colors.secondary }]}>{day.label}</Text></Pressable>; })}</View>;
}

function EditorActions({ colors, onCancel, onDelete, onSave, saveDisabled }: { colors: AppColors; onCancel: () => void; onDelete?: () => Promise<void>; onSave: () => void; saveDisabled: boolean }) {
  return <View style={styles.editorActions}>{onDelete && <Pressable onPress={() => Alert.alert('Remove this habit?', 'Completed history will stay in your past calendar.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void onDelete() }])}><Text style={[styles.deleteAction, { color: colors.red }]}>Remove</Text></Pressable>}<View style={styles.actionSpacer} /><Pressable onPress={onCancel}><Text style={[styles.cancelAction, { color: colors.secondary }]}>Cancel</Text></Pressable><Pressable disabled={saveDisabled} onPress={onSave} style={[styles.smallSave, { backgroundColor: colors.blue, opacity: saveDisabled ? 0.4 : 1 }]}><Text style={styles.saveText}>Save</Text></Pressable></View>;
}

function TrackerStat({ colors, label, value }: { colors: AppColors; label: string; value: string }) {
  return <View style={styles.trackerStat}><Text style={[styles.trackerStatValue, { color: colors.blue }]}>{value}</Text><Text style={[styles.trackerStatLabel, { color: colors.tertiary }]}>{label}</Text></View>;
}

function dateForTime(value?: string) {
  const minutes = timeMinutes(value ?? '7:00 AM');
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return Number.isFinite(date.getTime()) ? date : new Date(2000, 0, 1, 7, 0);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overviewContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 112 },
  overviewHeaderRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  overviewTitle: { fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.7 },
  overviewGuide: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 3 },
  overviewIntro: { marginBottom: 14 },
  overviewSummary: { fontSize: 13, lineHeight: 18, marginTop: 8, fontWeight: '600' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.15 },
  title: { fontSize: 31, lineHeight: 36, fontWeight: '700', letterSpacing: -1, marginTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 5, maxWidth: 345 },
  dashboardHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  dashboardHeaderTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4 },
  dashboardHeaderSubtitle: { fontSize: 10, lineHeight: 14, marginTop: 1 },
  dashboardHeaderAction: { fontSize: 12, fontWeight: '700' },
  dashboardPanel: { borderRadius: 18, paddingHorizontal: 12, marginBottom: 10, overflow: 'hidden' },
  goalPanel: { borderRadius: 18, paddingHorizontal: 12, marginBottom: 10, overflow: 'hidden' },
  dashboardRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center' },
  dashboardGoalStar: { width: 28, fontSize: 21 },
  dashboardTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  dashboardMeta: { fontSize: 9, lineHeight: 13, marginTop: 2, fontWeight: '600' },
  dashboardRate: { marginLeft: 9, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dashboardEmpty: { fontSize: 13, lineHeight: 18, paddingVertical: 15 },
  disclosure: { width: 20, textAlign: 'center', fontSize: 18, lineHeight: 20, fontWeight: '500' },
  cardCopy: { flex: 1 },
  weekMatrix: { borderRadius: 19, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  matrixHeaderRow: { height: 34, flexDirection: 'row', alignItems: 'center' },
  matrixCorner: { width: 100, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  matrixDays: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matrixDayLabel: { width: 20, alignItems: 'center' },
  matrixDayLetter: { fontSize: 8, lineHeight: 10, fontWeight: '800' },
  matrixDayNumber: { fontSize: 9, lineHeight: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  matrixRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center' },
  matrixHabitName: { width: 100, paddingRight: 8, fontSize: 12, fontWeight: '600' },
  matrixCell: { width: 17, height: 17, borderRadius: 5 },
  insightCard: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6 },
  insightEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.75 },
  insightText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  libraryContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 112 },
  pageHeader: { marginBottom: 20 },
  pageBack: { height: 36, borderRadius: 18, paddingLeft: 10, paddingRight: 13, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 17 },
  pageBackChevron: { fontSize: 25, lineHeight: 27, marginRight: 4, marginTop: -2 },
  pageBackText: { fontSize: 14, fontWeight: '700' },
  pageTitle: { fontSize: 31, lineHeight: 36, fontWeight: '700', letterSpacing: -0.9, marginTop: 4 },
  libraryList: { marginBottom: 7 },
  goalCard: { minHeight: 48, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 7 },
  goalStarButton: { width: 25, height: 28, alignItems: 'center', justifyContent: 'center' },
  goalStar: { fontSize: 21, lineHeight: 24 },
  cardTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  cardEyebrow: { fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.65, marginTop: 1 },
  completedGroup: { paddingHorizontal: 4, marginBottom: 10 },
  completedLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },
  completedRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9 },
  completedStar: { fontSize: 17 },
  completedTitle: { fontSize: 14, textDecorationLine: 'line-through' },
  bottomAdd: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  bottomAddPlus: { fontSize: 20, marginRight: 7 },
  bottomAddText: { fontSize: 14, fontWeight: '700' },
  editorPageContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 112 },
  formFields: { gap: 0 },
  formLabel: { fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: 15, marginBottom: 7 },
  largeInput: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 19, fontWeight: '600', paddingHorizontal: 0 },
  segmentRow: { flexDirection: 'row', gap: 6 },
  segmentPill: { flex: 1, minHeight: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 11, fontWeight: '700' },
  formRow: { minHeight: 51, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formRowTitle: { fontSize: 14, fontWeight: '600' },
  formRowMeta: { fontSize: 11, marginTop: 2 },
  formRowAction: { fontSize: 13, fontWeight: '700' },
  removeDate: { fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: 7 },
  notesInput: { minHeight: 76, maxHeight: 130, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, lineHeight: 19 },
  sectionHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginTop: 11 },
  sectionHeadingTitle: { fontSize: 18, lineHeight: 21, fontWeight: '700', letterSpacing: -0.25 },
  sectionHeadingSubtitle: { fontSize: 10, lineHeight: 14, marginTop: 2, maxWidth: 285 },
  sectionHeadingAction: { fontSize: 12, fontWeight: '700', marginLeft: 10 },
  choiceCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  choiceCheck: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  primaryButton: { minHeight: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 17 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  workspaceContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 112 },
  goalWorkspaceTitle: { minHeight: 96, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  workspaceStar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  workspaceStarText: { fontSize: 23, lineHeight: 25 },
  workspaceTitle: { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.55, marginTop: 3 },
  workspaceMeta: { fontSize: 10, lineHeight: 14, marginTop: 4, opacity: 0.78 },
  goalEditButton: { minHeight: 38, minWidth: 42, alignItems: 'center', justifyContent: 'center' },
  editAction: { fontSize: 13, fontWeight: '700' },
  editSurface: { borderRadius: 20, paddingHorizontal: 13, paddingBottom: 8, marginBottom: 11 },
  goalNotes: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  goalTasksSection: { marginTop: 9 },
  goalTaskList: { borderTopWidth: StyleSheet.hairlineWidth },
  goalTaskRow: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  goalTaskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  goalTaskEmpty: { fontSize: 13, lineHeight: 18, paddingVertical: 18 },
  goalTaskHint: { textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 14 },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  projectTitle: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  projectDate: { fontSize: 10, marginTop: 2 },
  completed: { textDecorationLine: 'line-through' },
  stepComposer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 3, marginBottom: 4 },
  stepInput: { height: 42, fontSize: 15, fontWeight: '600' },
  dateRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 13 },
  dateValue: { fontSize: 13, fontWeight: '700' },
  habitLibraryRow: { minHeight: 59, flexDirection: 'row', alignItems: 'center' },
  habitTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  habitDetailContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 112 },
  habitDetailTitleRow: { minHeight: 79, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 1 },
  habitDetailTitle: { fontSize: 29, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
  todayCheckIn: { minHeight: 58, borderRadius: 17, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  todayCheckCircle: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  todayCheckmark: { fontSize: 14, fontWeight: '800' },
  todayCheckTitle: { fontSize: 15, fontWeight: '700' },
  todayCheckMeta: { fontSize: 11, marginTop: 2 },
  trackerCard: { borderRadius: 19, paddingHorizontal: 13, paddingTop: 13, paddingBottom: 11 },
  trackerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 13 },
  trackerTitle: { fontSize: 16, fontWeight: '700' },
  trackerSubtitle: { fontSize: 10, marginTop: 1 },
  trackerStats: { flexDirection: 'row', gap: 11 },
  trackerStat: { minWidth: 29, alignItems: 'flex-end' },
  trackerStatValue: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  trackerStatLabel: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 1 },
  activityBody: { flexDirection: 'row' },
  activityLabels: { width: 15, height: 95, paddingVertical: 14, justifyContent: 'space-between' },
  activityLabel: { fontSize: 7, fontWeight: '700' },
  activityWeeks: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  activityWeek: { gap: 3 },
  activityCell: { width: 10, height: 10, borderRadius: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 9 },
  legendCell: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 8 },
  habitInfoSection: { marginTop: 7 },
  behaviorCard: { borderRadius: 17, padding: 12, marginTop: 12 },
  behaviorTitle: { fontSize: 14, fontWeight: '700' },
  behaviorMeta: { fontSize: 10, lineHeight: 15, marginTop: 8 },
  kindRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  kindPill: { minWidth: 78, height: 32, borderRadius: 16, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  kindText: { fontSize: 12, fontWeight: '700' },
  eventSettings: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 2 },
  behaviorSettingRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  behaviorSettingTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  behaviorSettingMeta: { fontSize: 9, lineHeight: 12, marginTop: 1 },
  behaviorSettingValue: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  durationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 5, paddingBottom: 5 },
  durationOption: { minHeight: 30, borderRadius: 15, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  durationOptionText: { fontSize: 10, fontWeight: '800' },
  quietInfoRow: { minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitInfoValue: { maxWidth: 225, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  startedRow: { paddingTop: 11, alignItems: 'flex-end' },
  startedText: { fontSize: 10 },
  habitComposer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 13, paddingTop: 4, paddingBottom: 8, marginTop: 10, marginBottom: 10 },
  habitCueInput: { minHeight: 43, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 14, marginTop: 8, paddingVertical: 7 },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: 12, fontWeight: '700' },
  editorActions: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  actionSpacer: { flex: 1 },
  deleteAction: { fontSize: 13, fontWeight: '600' },
  cancelAction: { fontSize: 13, fontWeight: '600' },
  smallSave: { height: 32, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  hint: { textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 18 },
});
