export type ItemKind = 'task' | 'event';
export type EventType = 'event' | 'trip';
export type TimePrecision = 'time' | 'day' | 'month' | 'quarter' | 'year' | 'someday';
export type TimelineZoom = 'today' | 'week' | 'month' | 'quarter' | 'year';
export type GoalScope = 'month' | 'quarter' | 'year';
export type GoalHorizon = GoalScope | 'someday';
export type ISOWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LocationPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface ItemDraft {
  id?: string;
  kind: ItemKind;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  notes?: string;
  location?: string;
  locationPlace?: LocationPlace;
  altitude?: PlanningItem['altitude'];
  endDate?: string;
  precision?: TimePrecision;
  eventType?: EventType;
}

export interface PlanningItem {
  id: string;
  kind: ItemKind;
  title: string;
  anchorStart: string | null;
  anchorEnd: string | null;
  precision: TimePrecision;
  altitude: 0 | 1 | 2 | 3 | 4;
  startTime?: string;
  endTime?: string;
  completed?: boolean;
  habitId?: string;
  habitName?: string;
  notes?: string;
  location?: string;
  locationPlace?: LocationPlace;
  sortOrder?: number;
  eventType?: EventType;
}

export interface Goal {
  id: string;
  title: string;
  scope: GoalScope;
  horizon: GoalHorizon;
  startsOn: string;
  targetDate: string;
  completionDate?: string;
  completed?: boolean;
  notes?: string;
  linkedHabitId?: string;
}

export interface GoalDraft {
  id?: string;
  title: string;
  scope: GoalScope;
  horizon: GoalHorizon;
  startsOn: string;
  targetDate: string;
  completionDate?: string;
  notes?: string;
}

export interface GoalStep {
  id: string;
  goalId: string;
  title: string;
  scheduledDate: string;
  itemId: string;
  completed?: boolean;
}

export interface GoalStepDraft {
  goalId: string;
  title: string;
  scheduledDate: string;
}

export interface Habit {
  id: string;
  name: string;
  weekdays: ISOWeekday[];
  startDate: string;
  endDate?: string;
  completedOnDate?: boolean;
  cue?: string;
  itemKind: ItemKind;
  startTime?: string;
  endTime?: string;
}

export interface HabitDraft {
  id?: string;
  name: string;
  weekdays: ISOWeekday[];
  startDate: string;
  endDate?: string;
  cue?: string;
  itemKind: ItemKind;
  startTime?: string;
  endTime?: string;
}

export interface HabitActivity {
  habitId: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  failed?: boolean;
}

export interface GoalHabitLink {
  goalId: string;
  habitId: string;
}

export interface SearchResult {
  id: string;
  kind: 'event' | 'task' | 'note';
  date: string;
  title: string;
  snippet?: string;
}

export interface TimelineSnapshot {
  items: PlanningItem[];
  goals: Goal[];
  reflections: Record<string, string>;
}
