import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addItem,
  addMonths,
  clearTicks,
  createChecklist,
  formatDay,
  hasTicks,
  isResetDue,
  parseChecklist,
  reminderTime,
  removeItem,
  renameItem,
  toggleItem,
} from './checklist.ts';

const at = (year: number, month: number, day: number, hour = 0) =>
  new Date(year, month - 1, day, hour).getTime();

const withTickedItem = (now: number) =>
  toggleItem(addItem(createChecklist(now), 'Счётчики', 'a'), 'a', now);

test('the first reminder is one month after creation, at midnight', () => {
  const list = createChecklist(at(2026, 11, 5, 23));
  assert.equal(list.nextResetAt, at(2026, 12, 5));
});

test('short months clamp without shifting later dates', () => {
  const anchor = at(2027, 1, 31);
  assert.equal(addMonths(anchor, 1), at(2027, 2, 28));
  assert.equal(addMonths(anchor, 2), at(2027, 3, 31));
  assert.equal(addMonths(anchor, 12), at(2028, 1, 31));
  assert.equal(addMonths(anchor, 13), at(2028, 2, 29));
});

test('the reminder is due only from its date onwards', () => {
  const list = createChecklist(at(2026, 11, 5));
  assert.equal(isResetDue(list, at(2026, 12, 4, 23)), false);
  assert.equal(isResetDue(list, at(2026, 12, 5)), true);
});

test('ticking records the date and unticking removes it', () => {
  const now = at(2026, 11, 7, 9);
  const ticked = withTickedItem(now);
  assert.equal(ticked.items[0].done, true);
  assert.equal(ticked.items[0].doneAt, now);
  assert.equal(hasTicks(ticked), true);

  const unticked = toggleItem(ticked, 'a', now);
  assert.equal(unticked.items[0].done, false);
  assert.equal('doneAt' in unticked.items[0], false);
  assert.equal(hasTicks(unticked), false);
});

test('clearing keeps the rows, drops the ticks and schedules the next date', () => {
  const list = clearTicks(withTickedItem(at(2026, 11, 5)), at(2026, 12, 5, 12));
  assert.equal(list.items[0].title, 'Счётчики');
  assert.equal(list.items[0].done, false);
  assert.equal('doneAt' in list.items[0], false);
  assert.equal(list.nextResetAt, at(2027, 1, 5));
});

test('clearing several months late lands on the next future date', () => {
  const list = clearTicks(withTickedItem(at(2026, 11, 5)), at(2027, 3, 20));
  assert.equal(list.nextResetAt, at(2027, 4, 5));
});

test('the notification fires at 10:00 and never in the past', () => {
  const list = createChecklist(at(2026, 11, 5));
  assert.equal(reminderTime(list, at(2026, 11, 6, 12)), at(2026, 12, 5, 10));
  assert.equal(reminderTime(list, at(2026, 12, 5, 9)), at(2026, 12, 5, 10));
  assert.equal(reminderTime(list, at(2026, 12, 5, 10)), at(2026, 12, 6, 10));
  assert.equal(reminderTime(list, at(2027, 2, 1, 15)), at(2027, 2, 2, 10));
});

test('renaming trims the text, keeps the tick and ignores blank text', () => {
  const list = withTickedItem(at(2026, 11, 5));
  const renamed = renameItem(list, 'a', '  Вода ');
  assert.equal(renamed.items[0].title, 'Вода');
  assert.equal(renamed.items[0].done, true);
  assert.equal(renameItem(list, 'a', '   '), list);
  assert.equal(renameItem(list, 'a', 'Вода\nи соль\n').items[0].title, 'Вода и соль');
});

test('blank titles are ignored when adding', () => {
  const list = createChecklist(at(2026, 11, 5));
  assert.equal(addItem(list, '   ', 'a'), list);
  assert.equal(addItem(list, '  Вода ', 'a').items[0].title, 'Вода');
});

test('removing drops only that item', () => {
  const list = addItem(addItem(createChecklist(at(2026, 11, 5)), 'A', 'a'), 'B', 'b');
  assert.deepEqual(removeItem(list, 'a').items.map((item) => item.id), ['b']);
});

test('saved data survives a round trip and bad data is rejected', () => {
  const list = withTickedItem(at(2026, 11, 5));
  assert.deepEqual(parseChecklist(JSON.stringify(list)), list);
  assert.equal(parseChecklist('not json'), null);
  assert.equal(parseChecklist('null'), null);
  assert.equal(parseChecklist('{"items":[{"id":1}],"anchor":1,"nextResetAt":2}'), null);
});

test('a list saved by the previous version still loads', () => {
  const saved = '{"items":[{"id":"a","title":"A","done":true}],"anchor":1,"nextResetAt":2}';
  assert.equal(parseChecklist(saved)?.items[0].done, true);
});

test('dates are written in Russian', () => {
  assert.equal(formatDay(at(2026, 12, 5)), '5 декабря');
});
