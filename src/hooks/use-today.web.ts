import { useMemo, useState } from 'react';

import type { ItemDraft, PlanningItem } from '../models/planning';

export type { ItemDraft } from '../models/planning';

function addDays(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(year, month - 1, day + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function sampleItems(today: string): PlanningItem[] {
  return [
    { id: 'web-plan', kind: 'event', title: 'Morning planning', anchorStart: today, anchorEnd: today, precision: 'time', altitude: 1, startTime: '8:30 AM', notes: 'Choose the three things that matter most today.' },
    { id: 'web-coffee', kind: 'event', title: 'Coffee with Alex', anchorStart: today, anchorEnd: today, precision: 'time', altitude: 1, startTime: '10:00 AM', location: "Jo's Coffee, Austin, TX" },
    { id: 'web-proposal', kind: 'task', title: 'Finish the project proposal', anchorStart: today, anchorEnd: today, precision: 'day', altitude: 0, notes: 'Send the polished draft before the afternoon.' },
    { id: 'web-walk', kind: 'task', title: 'Take a 20 minute walk', anchorStart: today, anchorEnd: today, precision: 'day', altitude: 0 },
    { id: 'web-dinner', kind: 'event', title: 'Dinner reservation', anchorStart: addDays(today, 1), anchorEnd: addDays(today, 1), precision: 'time', altitude: 1, startTime: '7:00 PM' },
    { id: 'web-campsite', kind: 'task', title: 'Book the campsite', anchorStart: addDays(today, 1), anchorEnd: addDays(today, 1), precision: 'day', altitude: 0 },
    { id: 'web-flight', kind: 'event', title: 'Flight to Denver', anchorStart: addDays(today, 3), anchorEnd: addDays(today, 3), precision: 'time', altitude: 2, startTime: '9:15 AM' },
    { id: 'web-hike', kind: 'event', title: 'Weekend hike', anchorStart: addDays(today, 6), anchorEnd: addDays(today, 6), precision: 'time', altitude: 1, startTime: '8:00 AM' },
    { id: 'web-trip', kind: 'event', title: 'Colorado trip', anchorStart: addDays(today, 43), anchorEnd: addDays(today, 43), precision: 'day', altitude: 4 },
  ];
}

export function useTodayData(date: string, _reviewDate = date) {
  const [allItems, setAllItems] = useState<PlanningItem[]>(() => sampleItems(_reviewDate));
  const [journals, setJournals] = useState<Record<string, string>>(() => ({
    [_reviewDate]: 'Today feels open. I want to protect time for the work and people that matter.',
  }));
  const items = allItems.filter((item) => item.anchorStart === date);
  const upcoming = allItems
    .filter((item) => item.anchorStart !== null && item.anchorStart > date)
    .sort((a, b) => (a.anchorStart ?? '').localeCompare(b.anchorStart ?? ''));
  const journal = journals[date] ?? '';

  return useMemo(() => ({
    items,
    upcoming,
    overdueTasks: [] as PlanningItem[],
    morningReviewDue: false,
    journal,
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
          altitude: draft.kind === 'event' ? 1 : 0,
          startTime: draft.time,
          notes: draft.notes,
          location: draft.location,
          locationPlace: draft.locationPlace,
        };
        return draft.id
          ? current.map((existing) => existing.id === draft.id ? { ...existing, ...item } : existing)
          : [...current, item];
      });
    },
    toggleTask: async (item: PlanningItem) => {
      setAllItems((current) => current.map((existing) =>
        existing.id === item.id ? { ...existing, completed: !existing.completed } : existing,
      ));
    },
    deleteItem: async (id: string) => {
      setAllItems((current) => current.filter((item) => item.id !== id));
    },
    saveJournal: async (value: string) => setJournals((current) => ({ ...current, [date]: value })),
    moveOverdueTask: async (_id: string, _targetDate: string) => undefined,
    dismissOverdueTask: async (_id: string) => undefined,
    skipMorningReview: async () => undefined,
    reorderTasks: async (orderedIds: string[]) => {
      setAllItems((current) => {
        const positions = new Map(orderedIds.map((id, index) => [id, index]));
        return [...current].sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
      });
    },
  }), [date, items, journal, upcoming]);
}
