export type Item = {
  id: string;
  title: string;
  done: boolean;
  /** When the tick was set. Missing on ticks saved by versions that did not record it. */
  doneAt?: number;
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

export function addItem(list: Checklist, title: string, id: string): Checklist {
  const trimmed = title.trim();
  if (!trimmed) return list;
  return { ...list, items: [...list.items, { id, title: trimmed, done: false }] };
}

/** A blank title is ignored, so clearing the text cannot lose the row by accident. */
export function renameItem(list: Checklist, id: string, title: string): Checklist {
  const trimmed = title.replace(/\s*\n\s*/g, ' ').trim();
  if (!trimmed) return list;
  return {
    ...list,
    items: list.items.map((item) => (item.id === id ? { ...item, title: trimmed } : item)),
  };
}

export function toggleItem(list: Checklist, id: string, now: number): Checklist {
  return {
    ...list,
    items: list.items.map((item) => {
      if (item.id !== id) return item;
      if (item.done) {
        const { doneAt: _doneAt, ...rest } = item;
        return { ...rest, done: false };
      }
      return { ...item, done: true, doneAt: now };
    }),
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
    typeof item.done === 'boolean' &&
    (item.doneAt === undefined || Number.isFinite(item.doneAt))
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
