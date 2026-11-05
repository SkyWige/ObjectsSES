import AsyncStorage from '@react-native-async-storage/async-storage';

import { Checklist, parseChecklist } from './checklist';

const LIST_KEY = 'monthly-checklist/v1';

/** Rejects on a read error, so callers never mistake it for an empty list and overwrite data. */
export async function loadChecklist(): Promise<Checklist | null> {
  const raw = await AsyncStorage.getItem(LIST_KEY);
  return raw === null ? null : parseChecklist(raw);
}

export function saveChecklist(list: Checklist): Promise<void> {
  return AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
}
