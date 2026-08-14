import { useMemo, useState } from 'react';

import type { ItemDraft, PlanningItem } from '../models/planning';

export type { ItemDraft } from '../models/planning';

export function useTodayData(date: string) {
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [journal, setJournal] = useState('');

  return useMemo(() => ({
    items,
    upcoming: [] as PlanningItem[],
    journal,
    loading: false,
    saveItem: async (draft: ItemDraft) => {
      setItems((current) => {
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
        };
        return draft.id
          ? current.map((existing) => existing.id === draft.id ? { ...existing, ...item } : existing)
          : [...current, item];
      });
    },
    toggleTask: async (item: PlanningItem) => {
      setItems((current) => current.map((existing) =>
        existing.id === item.id ? { ...existing, completed: !existing.completed } : existing,
      ));
    },
    deleteItem: async (id: string) => {
      setItems((current) => current.filter((item) => item.id !== id));
    },
    saveJournal: async (value: string) => setJournal(value),
  }), [items, journal]);
}
