export const TEXT_COLOR_NAMES = ['red', 'orange', 'green', 'blue', 'purple'] as const;
export type TextColorName = (typeof TEXT_COLOR_NAMES)[number];

export type Note = {
  id: string;
  text: string;
};

export type Item = {
  id: string;
  title: string;
  done: boolean;
  /** When the tick was set. Missing on ticks saved by versions that did not record it. */
  doneAt?: number;
  /** 'text' is a plain row without a checkbox. Rows without this field have a checkbox. */
  kind?: 'text';
  /** Missing means the theme's normal text colour. */
  color?: TextColorName;
  notes?: Note[];
  /** Photo file names. See src/photos.ts for where the files live. */
  photos?: string[];
};

export type Checklist = {
  items: Item[];
  /** Local midnight of the day the list was created. Every reminder date is counted from it. */
  anchor: number;
  /** The moment the next reminder to clear the ticks is due. */
  nextResetAt: number;
};

const REMINDER_HOUR = 10;

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

export function isResetDue(list: Checklist, now: number): boolean {
  return now >= list.nextResetAt;
}

export function hasTicks(list: Checklist): boolean {
  return list.items.some((item) => item.done);
}

/** Clears every tick and moves the reminder to the next date that is still ahead. */
export function clearTicks(list: Checklist, now: number): Checklist {
  let months = 1;
  while (addMonths(list.anchor, months) <= now) months += 1;
  return {
    ...list,
    items: list.items.map(({ doneAt: _doneAt, ...item }) => ({ ...item, done: false })),
    nextResetAt: addMonths(list.anchor, months),
  };
}

/**
 * When the phone notification should fire: at 10:00 on the reminder date, or
 * the next 10:00 still ahead if that date has already passed.
 */
export function reminderTime(list: Checklist, now: number): number {
  const day = new Date(Math.max(list.nextResetAt, startOfDay(now)));
  const time = new Date(day.getFullYear(), day.getMonth(), day.getDate(), REMINDER_HOUR);
  if (time.getTime() > now) return time.getTime();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, REMINDER_HOUR).getTime();
}

export function addItem(
  list: Checklist,
  title: string,
  id: string,
  kind: 'task' | 'text' = 'task',
): Checklist {
  const trimmed = title.trim();
  if (!trimmed) return list;
  const item: Item = { id, title: trimmed, done: false };
  if (kind === 'text') item.kind = 'text';
  return { ...list, items: [...list.items, item] };
}

/** A blank title is ignored, so clearing the text cannot lose the row by accident. */
export function renameItem(list: Checklist, id: string, title: string): Checklist {
  const trimmed = title.trim();
  if (!trimmed) return list;
  return updateItem(list, id, (item) => ({ ...item, title: trimmed }));
}

export function updateItem(list: Checklist, id: string, update: (item: Item) => Item): Checklist {
  return {
    ...list,
    items: list.items.map((item) => (item.id === id ? update(item) : item)),
  };
}

/** A plain text row cannot hold a tick, so switching to it removes the tick and its date. */
export function withKind(item: Item, kind: 'task' | 'text'): Item {
  const { doneAt: _doneAt, kind: _kind, ...rest } = item;
  if (kind === 'text') return { ...rest, done: false, kind: 'text' };
  return item.done ? { ...rest, done: true, ...(item.doneAt ? { doneAt: item.doneAt } : {}) } : rest;
}

export function withColor(item: Item, color: TextColorName | null): Item {
  const { color: _color, ...rest } = item;
  return color ? { ...rest, color } : rest;
}

export function addNote(item: Item, id: string, text: string): Item {
  const trimmed = text.trim();
  if (!trimmed) return item;
  return { ...item, notes: [...(item.notes ?? []), { id, text: trimmed }] };
}

export function editNote(item: Item, id: string, text: string): Item {
  const trimmed = text.trim();
  if (!trimmed) return item;
  return {
    ...item,
    notes: (item.notes ?? []).map((note) => (note.id === id ? { ...note, text: trimmed } : note)),
  };
}

export function removeNote(item: Item, id: string): Item {
  return { ...item, notes: (item.notes ?? []).filter((note) => note.id !== id) };
}

export function addPhotos(item: Item, photos: string[]): Item {
  return { ...item, photos: [...(item.photos ?? []), ...photos] };
}

export function removePhoto(item: Item, photo: string): Item {
  return { ...item, photos: (item.photos ?? []).filter((name) => name !== photo) };
}

/** Rows that take part in the "done X of Y" count. */
export function taskCount(list: Checklist): number {
  return list.items.filter((item) => item.kind !== 'text').length;
}

export function doneCount(list: Checklist): number {
  return list.items.filter((item) => item.done).length;
}

function pluralNotes(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return `${count}\u00A0заметок`;
  if (ones === 1) return `${count}\u00A0заметка`;
  if (ones >= 2 && ones <= 4) return `${count}\u00A0заметки`;
  return `${count}\u00A0заметок`;
}

/** The short line under a row in the list, or null if there is nothing to show. */
export function rowSummary(item: Item): string | null {
  const parts: string[] = [];
  if (item.done && item.doneAt !== undefined) parts.push(`Отмечено ${formatDay(item.doneAt)}`);
  if (item.photos?.length) parts.push(`${item.photos.length}\u00A0фото`);
  if (item.notes?.length) parts.push(pluralNotes(item.notes.length));
  return parts.length ? parts.join(', ') : null;
}

export function toggleItem(list: Checklist, id: string, now: number): Checklist {
  return updateItem(list, id, (item) => {
    if (item.kind === 'text') return item;
    if (item.done) {
      const { doneAt: _doneAt, ...rest } = item;
      return { ...rest, done: false };
    }
    return { ...item, done: true, doneAt: now };
  });
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
    typeof item.done === 'boolean' &&
    (item.doneAt === undefined || Number.isFinite(item.doneAt)) &&
    (item.notes === undefined ||
      (Array.isArray(item.notes) &&
        item.notes.every((note) => typeof note?.id === 'string' && typeof note?.text === 'string'))) &&
    (item.photos === undefined ||
      (Array.isArray(item.photos) && item.photos.every((photo) => typeof photo === 'string')))
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
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
