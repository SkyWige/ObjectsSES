import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addItem,
  addMonths,
  applyReset,
  createChecklist,
  formatDay,
  parseChecklist,
  removeItem,
  toggleItem,
} from './checklist.ts';

const at = (year: number, month: number, day: number, hour = 0) =>
  new Date(year, month - 1, day, hour).getTime();

const withTickedItem = (now: number) =>
  toggleItem(addItem(createChecklist(now), 'Счётчики', 'a'), 'a');

test('the first reset is one month after creation, at midnight', () => {
  const list = createChecklist(at(2026, 11, 5, 23));
  assert.equal(list.nextResetAt, at(2026, 12, 5));
});

test('short months clamp without shifting later reset dates', () => {
  const anchor = at(2027, 1, 31);
  assert.equal(addMonths(anchor, 1), at(2027, 2, 28));
  assert.equal(addMonths(anchor, 2), at(2027, 3, 31));
  assert.equal(addMonths(anchor, 12), at(2028, 1, 31));
  assert.equal(addMonths(anchor, 13), at(2028, 2, 29));
});

test('ticks stay until the reset date', () => {
  const list = withTickedItem(at(2026, 11, 5));
  const later = applyReset(list, at(2026, 12, 4, 23));
  assert.equal(later, list);
  assert.equal(later.items[0].done, true);
});

test('ticks clear on the reset date and the next one is scheduled', () => {
  const list = applyReset(withTickedItem(at(2026, 11, 5)), at(2026, 12, 5));
  assert.equal(list.items[0].done, false);
  assert.equal(list.items[0].title, 'Счётчики');
  assert.equal(list.nextResetAt, at(2027, 1, 5));
});

test('a reset caught up after several months lands on the next future date', () => {
  const list = applyReset(withTickedItem(at(2026, 11, 5)), at(2027, 3, 20));
  assert.equal(list.items[0].done, false);
  assert.equal(list.nextResetAt, at(2027, 4, 5));
});

test('blank titles are ignored and titles are trimmed', () => {
  const list = createChecklist(at(2026, 11, 5));
  assert.equal(addItem(list, '   ', 'a'), list);
  assert.equal(addItem(list, '  Вода ', 'a').items[0].title, 'Вода');
});

test('toggling twice unticks, and removing drops only that item', () => {
  let list = addItem(addItem(createChecklist(at(2026, 11, 5)), 'A', 'a'), 'B', 'b');
  list = toggleItem(toggleItem(list, 'a'), 'a');
  assert.equal(list.items[0].done, false);
  assert.deepEqual(removeItem(list, 'a').items.map((item) => item.id), ['b']);
});

test('saved data survives a round trip and bad data is rejected', () => {
  const list = withTickedItem(at(2026, 11, 5));
  assert.deepEqual(parseChecklist(JSON.stringify(list)), list);
  assert.equal(parseChecklist('not json'), null);
  assert.equal(parseChecklist('null'), null);
  assert.equal(parseChecklist('{"items":[{"id":1}],"anchor":1,"nextResetAt":2}'), null);
});

test('dates are written in Russian', () => {
  assert.equal(formatDay(at(2026, 12, 5)), '5\u00A0декабря');
});
