export type Item = {
  id: string;
  title: string;
  done: boolean;
};

export type Checklist = {
  items: Item[];
  /** Local midnight of the day the list was created. Every reset date is counted from it. */
  anchor: number;
  /** The moment the next reset is due. */
  nextResetAt: number;
};

function startOfDay(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Adds whole calendar months, clamping to the last day of a shorter month.
 * Always counted from the anchor, so 31 Jan -> 28 Feb -> 31 Mar instead of drifting to the 28th.
 */
export function addMonths(anchor: number, months: number): number {
  const date = new Date(anchor);
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay)).getTime();
}

export function createChecklist(now: number): Checklist {
  const anchor = startOfDay(now);
  return { items: [], anchor, nextResetAt: addMonths(anchor, 1) };
}

/**
 * Unticks everything once the reset date has passed, including when the app
 * stayed closed for several months. Returns the same object if nothing is due.
 */
export function applyReset(list: Checklist, now: number): Checklist {
  if (now < list.nextResetAt) return list;
  let months = 1;
  while (addMonths(list.anchor, months) <= now) months += 1;
  return {
    ...list,
    items: list.items.map((item) => ({ ...item, done: false })),
    nextResetAt: addMonths(list.anchor, months),
  };
}

export function addItem(list: Checklist, title: string, id: string): Checklist {
  const trimmed = title.trim();
  if (!trimmed) return list;
  return { ...list, items: [...list.items, { id, title: trimmed, done: false }] };
}

export function toggleItem(list: Checklist, id: string): Checklist {
  return {
    ...list,
    items: list.items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
  };
}

export function removeItem(list: Checklist, id: string): Checklist {
  return { ...list, items: list.items.filter((item) => item.id !== id) };
}

function isItem(value: unknown): value is Item {
  const item = value as Item | null;
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.done === 'boolean'
  );
}

/** Returns null when the saved text is not a valid checklist. */
export function parseChecklist(raw: string): Checklist | null {
  try {
    const value = JSON.parse(raw) as Checklist | null;
    if (
      value &&
      Array.isArray(value.items) &&
      value.items.every(isItem) &&
      Number.isFinite(value.anchor) &&
      Number.isFinite(value.nextResetAt)
    ) {
      return value;
    }
  } catch {
    // Handled by the null below.
  }
  return null;
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function formatDay(time: number): string {
  const date = new Date(time);
  return `${date.getDate()}\u00A0${MONTHS[date.getMonth()]}`;
}
