import { useMemo, useState } from 'react';

import type { Goal, GoalDraft, GoalHabitLink, GoalStep, GoalStepDraft, Habit, HabitActivity, HabitDraft, ItemDraft, PlanningItem, SearchResult, TimelineSnapshot } from '../models/planning';
import { matchingSnippet } from '../shared/search';

export type { ItemDraft } from '../models/planning';

function addDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(year, month - 1, day + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function sampleItems(today: string): PlanningItem[] {
  const [year, month] = today.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = addDays(monthStart, new Date(year, month, 0).getDate() - 1);
  return [
    { id: 'web-plan', kind: 'event', title: 'Morning planning', anchorStart: today, anchorEnd: today, precision: 'time', altitude: 1, startTime: '8:30 AM', notes: 'Choose the three things that matter most today.' },
    { id: 'web-coffee', kind: 'event', title: 'Coffee with Alex', anchorStart: today, anchorEnd: today, precision: 'time', altitude: 1, startTime: '10:00 AM', location: "Jo's Coffee, Austin, TX" },
    { id: 'web-proposal', kind: 'task', title: 'Finish the project proposal', anchorStart: today, anchorEnd: today, precision: 'day', altitude: 0, notes: 'Send the polished draft before the afternoon.' },
    { id: 'web-walk', kind: 'task', title: 'Take a 20 minute walk', anchorStart: today, anchorEnd: today, precision: 'day', altitude: 0 },
    { id: 'web-dinner', kind: 'event', title: 'Dinner reservation', anchorStart: addDays(today, 1), anchorEnd: addDays(today, 1), precision: 'time', altitude: 1, startTime: '7:00 PM' },
    { id: 'web-campsite', kind: 'task', title: 'Book the campsite', anchorStart: addDays(today, 1), anchorEnd: addDays(today, 1), precision: 'day', altitude: 0 },
    { id: 'web-flight', kind: 'event', title: 'Flight to Denver', anchorStart: addDays(today, 3), anchorEnd: addDays(today, 3), precision: 'time', altitude: 2, startTime: '9:15 AM' },
    { id: 'web-hike', kind: 'event', title: 'Weekend hike', anchorStart: addDays(today, 6), anchorEnd: addDays(today, 6), precision: 'time', altitude: 1, startTime: '8:00 AM' },
    { id: 'web-trip', kind: 'event', eventType: 'trip', title: 'Colorado trip', anchorStart: addDays(today, 43), anchorEnd: addDays(today, 47), precision: 'day', altitude: 4 },
    { id: 'web-spring-race', kind: 'event', title: 'Spring 10K', anchorStart: addDays(today, -150), anchorEnd: addDays(today, -150), precision: 'day', altitude: 4 },
    { id: 'web-california', kind: 'event', eventType: 'trip', title: 'California road trip', anchorStart: addDays(today, -100), anchorEnd: addDays(today, -93), precision: 'day', altitude: 4 },
    { id: 'web-workshop', kind: 'event', title: 'Design workshop', anchorStart: addDays(today, -45), anchorEnd: addDays(today, -45), precision: 'day', altitude: 2 },
    { id: 'web-family', kind: 'event', eventType: 'trip', title: 'Family weekend', anchorStart: addDays(today, -16), anchorEnd: addDays(today, -14), precision: 'day', altitude: 3 },
    { id: 'web-concert', kind: 'event', title: 'Concert downtown', anchorStart: addDays(today, 12), anchorEnd: addDays(today, 12), precision: 'time', altitude: 2, startTime: '8:00 PM' },
    { id: 'web-launch', kind: 'event', title: 'Calendream alpha launch', anchorStart: addDays(today, 25), anchorEnd: addDays(today, 25), precision: 'day', altitude: 4 },
    { id: 'web-fall-trip', kind: 'event', eventType: 'trip', title: 'Fall cabin trip', anchorStart: addDays(today, 48), anchorEnd: addDays(today, 52), precision: 'day', altitude: 4 },
    { id: 'web-marathon', kind: 'event', title: 'Half marathon', anchorStart: addDays(today, 75), anchorEnd: addDays(today, 75), precision: 'day', altitude: 4 },
    { id: 'web-holiday', kind: 'event', eventType: 'trip', title: 'Holiday travel', anchorStart: addDays(today, 110), anchorEnd: addDays(today, 118), precision: 'day', altitude: 4 },
    { id: 'web-ski', kind: 'event', eventType: 'trip', title: 'Ski weekend', anchorStart: addDays(today, 160), anchorEnd: addDays(today, 163), precision: 'day', altitude: 4 },
    { id: 'web-europe', kind: 'event', eventType: 'trip', title: 'Europe trip', anchorStart: addDays(today, 240), anchorEnd: addDays(today, 252), precision: 'day', altitude: 4 },
    { id: 'web-birthday', kind: 'event', title: 'Birthday dinner', anchorStart: addDays(today, -8), anchorEnd: addDays(today, -8), precision: 'time', altitude: 1, startTime: '7:30 PM' },
    { id: 'web-gallery', kind: 'event', title: 'Gallery opening', anchorStart: addDays(today, 18), anchorEnd: addDays(today, 18), precision: 'time', altitude: 1, startTime: '6:00 PM' },
    { id: 'web-wedding', kind: 'event', title: 'Maya & Theo’s wedding', anchorStart: addDays(today, 32), anchorEnd: addDays(today, 32), precision: 'day', altitude: 4 },
    { id: 'web-retreat', kind: 'event', eventType: 'trip', title: 'Creative retreat', anchorStart: addDays(today, 88), anchorEnd: addDays(today, 91), precision: 'day', altitude: 4 },
    { id: 'web-ironman-event', kind: 'event', title: 'Ironman race day', anchorStart: monthEnd, anchorEnd: monthEnd, precision: 'day', altitude: 4 },
  ];
}

function sampleGoals(today: string): Goal[] {
  const [year, month] = today.split('-').map(Number);
  const targetDate = addDays(`${year}-${String(month).padStart(2, '0')}-01`, new Date(year, month, 0).getDate() - 1);
  return [
    { id: 'web-ironman-goal', title: 'Race my first Ironman', scope: 'year', horizon: 'year', startsOn: `${year}-01-01`, targetDate, completionDate: targetDate },
    { id: 'web-creative-goal', title: 'Build a consistent creative practice', scope: 'quarter', horizon: 'quarter', startsOn: `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`, targetDate: addDays(targetDate, 45), completionDate: addDays(targetDate, 45) },
  ];
}

function sampleHabits(today: string): Habit[] {
  return [
    { id: 'web-habit-run', name: 'Morning run', weekdays: [1, 3, 5], startDate: addDays(today, -30), completedOnDate: false, cue: 'After I get dressed', itemKind: 'task' },
    { id: 'web-habit-read', name: 'Read for 20 minutes', weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: addDays(today, -30), completedOnDate: true, cue: 'After dinner', itemKind: 'task' },
    { id: 'web-habit-swim', name: 'Swim', weekdays: [2, 4, 6], startDate: addDays(today, -30), completedOnDate: false, itemKind: 'event', startTime: '7:00 AM', endTime: '8:00 AM' },
  ];
}

export function useTodayData(date: string, _reviewDate = date) {
  const [allItems, setAllItems] = useState<PlanningItem[]>(() => sampleItems(_reviewDate));
  const [allGoals, setAllGoals] = useState<Goal[]>(() => sampleGoals(_reviewDate));
  const [allHabits, setAllHabits] = useState<Habit[]>(() => sampleHabits(_reviewDate));
  const [goalSteps, setGoalSteps] = useState<GoalStep[]>([]);
  const [habitActivity, setHabitActivity] = useState<HabitActivity[]>(() => {
    const entries: HabitActivity[] = [];
    for (let offset = -6; offset <= 0; offset += 1) {
      const activityDate = addDays(_reviewDate, offset);
      if (offset !== -5) entries.push({ habitId: 'web-habit-read', date: activityDate, completed: offset !== -2 });
      if ([-6, -4, -2].includes(offset)) entries.push({ habitId: 'web-habit-run', date: activityDate, completed: offset !== -2 });
      if ([-5, -3, -1].includes(offset)) entries.push({ habitId: 'web-habit-swim', date: activityDate, completed: offset !== -3 });
    }
    return entries;
  });
  const [goalHabitLinks, setGoalHabitLinks] = useState<GoalHabitLink[]>([
    { goalId: 'web-ironman-goal', habitId: 'web-habit-run' },
  ]);
  const [journals, setJournals] = useState<Record<string, string>>(() => ({
    [_reviewDate]: 'Today feels open. I want to protect time for the work and people that matter.',
  }));
  const [libraryDates, setLibraryDates] = useState<Set<string>>(() => new Set());
  const items = allItems.filter((item) => item.anchorStart === date);
  const upcoming = allItems
    .filter((item) => item.anchorStart !== null && item.anchorStart > date)
    .sort((a, b) => (a.anchorStart ?? '').localeCompare(b.anchorStart ?? ''));
  const journal = journals[date] ?? '';

  return useMemo(() => ({
    items,
    upcoming,
    overdueTasks: [] as PlanningItem[],
    goals: allGoals.filter((goal) => goal.horizon !== 'someday' && goal.startsOn <= date && goal.targetDate >= date),
    allGoals,
    habits: allHabits,
    goalSteps,
    habitActivity,
    goalHabitLinks,
    morningReviewDue: false,
    journal,
    journalInLibrary: libraryDates.has(date),
    loading: false,
    saveItem: async (draft: ItemDraft) => {
      setAllItems((current) => {
        const item: PlanningItem = {
          id: draft.id ?? `${Date.now()}`,
          kind: draft.kind,
          title: draft.title,
          anchorStart: draft.date,
          anchorEnd: draft.date,
          precision: draft.kind === 'event' && draft.time ? 'time' : 'day',
          altitude: draft.altitude ?? (draft.kind === 'event' ? 1 : 0),
          startTime: draft.time,
          endTime: draft.endTime,
          notes: draft.notes,
          location: draft.location,
          locationPlace: draft.locationPlace,
          eventType: draft.eventType ?? (draft.id ? current.find((existing) => existing.id === draft.id)?.eventType : undefined),
        };
        return draft.id
          ? current.map((existing) => existing.id === draft.id ? { ...existing, ...item, anchorEnd: draft.endDate ?? existing.anchorEnd, precision: draft.precision ?? existing.precision, altitude: draft.altitude ?? existing.altitude } : existing)
          : [...current, item];
      });
    },
    toggleTask: async (item: PlanningItem) => {
      setAllItems((current) => current.map((existing) =>
        existing.id === item.id ? { ...existing, completed: !existing.completed } : existing,
      ));
      if (item.habitId && item.anchorStart) {
        setHabitActivity((current) => current.filter((entry) => !(entry.habitId === item.habitId && entry.date === item.anchorStart && entry.failed)));
      }
    },
    toggleGoal: async (goal: Goal) => {
      setAllGoals((current) => current.map((existing) => existing.id === goal.id ? { ...existing, completed: !existing.completed } : existing));
    },
    saveGoal: async (draft: GoalDraft) => {
      const id = draft.id ?? `${Date.now()}-goal`;
      const goal: Goal = { ...draft, id };
      setAllGoals((current) => draft.id
        ? current.map((existing) => existing.id === draft.id ? { ...existing, ...goal } : existing)
        : [...current, goal]);
      return id;
    },
    deleteGoal: async (id: string) => setAllGoals((current) => current.filter((goal) => goal.id !== id)),
    saveGoalStep: async (draft: GoalStepDraft) => {
      const itemId = `${Date.now()}-goal-task`;
      const step: GoalStep = {
        id: `${Date.now()}-goal-step`, goalId: draft.goalId, title: draft.title,
        scheduledDate: draft.scheduledDate, itemId, completed: false,
      };
      setGoalSteps((current) => [...current, step]);
      setAllItems((current) => [...current, {
        id: itemId, kind: 'task', title: draft.title, anchorStart: draft.scheduledDate,
        anchorEnd: draft.scheduledDate, precision: 'day', altitude: 0,
      }]);
    },
    toggleGoalStep: async (step: GoalStep) => {
      setGoalSteps((current) => current.map((existing) => existing.id === step.id ? { ...existing, completed: !existing.completed } : existing));
      setAllItems((current) => current.map((item) => item.id === step.itemId ? { ...item, completed: !item.completed } : item));
    },
    deleteGoalStep: async (step: GoalStep) => {
      setGoalSteps((current) => current.filter((existing) => existing.id !== step.id));
      setAllItems((current) => current.filter((item) => item.id !== step.itemId));
    },
    saveHabit: async (draft: HabitDraft) => {
      const id = draft.id ?? `${Date.now()}-habit`;
      const habit: Habit = { ...draft, id, completedOnDate: false };
      setAllHabits((current) => draft.id
        ? current.map((existing) => existing.id === draft.id ? { ...existing, ...habit } : existing)
        : [...current, habit]);
      return id;
    },
    toggleHabit: async (habit: Habit) => {
      setAllHabits((current) => current.map((existing) => existing.id === habit.id
        ? { ...existing, completedOnDate: !existing.completedOnDate }
        : existing));
    },
    toggleHabitDate: async (habit: Habit, targetDate: string) => {
      const existing = habitActivity.find((entry) => entry.habitId === habit.id && entry.date === targetDate);
      setHabitActivity((current) => existing
        ? current.map((entry) => entry === existing ? { ...entry, completed: !entry.completed } : entry)
        : [...current, { habitId: habit.id, date: targetDate, completed: true }]);
      setAllItems((current) => {
        const task = current.find((item) => item.anchorStart === targetDate && item.habitId === habit.id);
        return task
          ? current.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item)
          : [...current, { id: `${Date.now()}-habit-item`, kind: habit.itemKind, habitId: habit.id, title: habit.name, anchorStart: targetDate, anchorEnd: targetDate, precision: habit.itemKind === 'event' ? 'time' : 'day', altitude: 0, startTime: habit.startTime, endTime: habit.endTime, completed: true }];
      });
    },
    toggleHabitSkip: async (habit: Habit, targetDate: string) => {
      const existing = habitActivity.find((entry) => entry.habitId === habit.id && entry.date === targetDate && entry.skipped);
      setHabitActivity((current) => existing
        ? current.filter((entry) => entry !== existing)
        : [...current.filter((entry) => !(entry.habitId === habit.id && entry.date === targetDate)), { habitId: habit.id, date: targetDate, completed: false, skipped: true }]);
    },
    markHabitFailed: async (habitId: string, targetDate: string) => {
      setHabitActivity((current) => [...current.filter((entry) => !(entry.habitId === habitId && entry.date === targetDate)), { habitId, date: targetDate, completed: false, failed: true }]);
    },
    linkHabitToGoal: async (goalId: string, habitId: string) => setGoalHabitLinks((current) => current.some((link) => link.goalId === goalId && link.habitId === habitId) ? current : [...current, { goalId, habitId }]),
    unlinkHabitFromGoal: async (goalId: string, habitId: string) => setGoalHabitLinks((current) => current.filter((link) => link.goalId !== goalId || link.habitId !== habitId)),
    archiveHabit: async (id: string) => setAllHabits((current) => current.filter((habit) => habit.id !== id)),
    deleteItem: async (id: string) => {
      setAllItems((current) => current.filter((item) => item.id !== id));
    },
    saveJournal: async (value: string) => setJournals((current) => ({ ...current, [date]: value })),
    saveJournalToLibrary: async (value: string) => {
      if (!value.trim()) return;
      setJournals((current) => ({ ...current, [date]: value }));
      setLibraryDates((current) => new Set(current).add(date));
    },
    moveOverdueTask: async (_id: string, _targetDate: string) => undefined,
    dismissOverdueTask: async (_id: string) => undefined,
    skipMorningReview: async () => undefined,
    reorderTasks: async (orderedIds: string[]) => {
      setAllItems((current) => {
        const positions = new Map(orderedIds.map((id, index) => [id, index]));
        return [...current].sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
      });
    },
    searchAll: async (rawQuery: string): Promise<SearchResult[]> => {
      const query = rawQuery.trim();
      if (!query) return [];
      const normalized = query.toLocaleLowerCase();
      const itemResults = allItems
        .filter((item) => [item.title, item.notes, item.location].some((value) => value?.toLocaleLowerCase().includes(normalized)))
        .map((item): SearchResult => ({
          id: item.id,
          kind: item.kind,
          date: item.anchorStart ?? date,
          title: item.title,
          snippet: matchingSnippet(item.notes, query),
        }));
      const noteResults = Object.entries(journals)
        .filter(([, reflection]) => reflection.toLocaleLowerCase().includes(normalized))
        .map(([noteDate, reflection]): SearchResult => ({
          id: `note-${noteDate}`,
          kind: 'note',
          date: noteDate,
          title: 'Daily Reflection',
          snippet: matchingSnippet(reflection, query),
        }));
      return [...itemResults, ...noteResults];
    },
    loadRange: async (startDate: string, endDate: string): Promise<TimelineSnapshot> => ({
      items: allItems.filter((item) => (
        item.anchorStart !== null
        && item.anchorStart <= endDate
        && (item.anchorEnd ?? item.anchorStart) >= startDate
      )),
      goals: allGoals.filter((goal) => goal.horizon !== 'someday' && goal.startsOn <= endDate && goal.targetDate >= startDate),
      reflections: Object.fromEntries(Object.entries(journals).filter(([noteDate]) => noteDate >= startDate && noteDate <= endDate)),
    }),
  }), [allGoals, allHabits, allItems, date, goalHabitLinks, goalSteps, habitActivity, items, journal, journals, libraryDates, upcoming]);
}
