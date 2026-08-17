export type ItemKind = 'task' | 'event';
export type EventType = 'event' | 'trip';
export type TimePrecision = 'time' | 'day' | 'month' | 'quarter' | 'year' | 'someday';
export type TimelineZoom = 'today' | 'week' | 'month' | 'quarter' | 'year';
export type GoalScope = 'month' | 'quarter' | 'year';
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
  completed?: boolean;
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
  startsOn: string;
  targetDate: string;
  completed?: boolean;
  notes?: string;
  linkedHabitId?: string;
}

export interface GoalDraft {
  id?: string;
  title: string;
  scope: GoalScope;
  startsOn: string;
  targetDate: string;
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
}

export interface HabitDraft {
  id?: string;
  name: string;
  weekdays: ISOWeekday[];
  startDate: string;
  endDate?: string;
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
