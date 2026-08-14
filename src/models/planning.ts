export type ItemKind = 'task' | 'event';
export type TimePrecision = 'time' | 'day' | 'month' | 'quarter' | 'year' | 'someday';

export interface ItemDraft {
  id?: string;
  kind: ItemKind;
  title: string;
  date: string;
  time?: string;
  notes?: string;
  location?: string;
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
  sortOrder?: number;
}
