import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addItem,
  addMonths,
  addNote,
  addPhotos,
  clearTicks,
  createChecklist,
  doneCount,
  editNote,
  formatDay,
  hasTicks,
  isResetDue,
  parseChecklist,
  reminderTime,
  removeItem,
  removeNote,
  removePhoto,
  renameItem,
  rowSummary,
  taskCount,
  toggleItem,
  updateItem,
  withColor,
  withKind,
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
  assert.equal(renameItem(list, 'a', 'Вода\nи соль\n').items[0].title, 'Вода\nи соль');
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

test('plain text rows cannot be ticked and stay out of the count', () => {
  const now = at(2026, 11, 5);
  let list = addItem(addItem(createChecklist(now), 'Заголовок', 't', 'text'), 'Дело', 'a');
  list = toggleItem(toggleItem(list, 't', now), 'a', now);
  assert.equal(list.items[0].done, false);
  assert.equal(taskCount(list), 1);
  assert.equal(doneCount(list), 1);
});

test('switching a row to plain text drops its tick, and back keeps it plain', () => {
  const now = at(2026, 11, 5);
  const text = withKind(withTickedItem(now).items[0], 'text');
  assert.equal(text.kind, 'text');
  assert.equal(text.done, false);
  assert.equal('doneAt' in text, false);
  const task = withKind(text, 'task');
  assert.equal('kind' in task, false);
  assert.equal(task.done, false);
});

test('switching kind to task keeps an existing tick', () => {
  const now = at(2026, 11, 5);
  const task = withKind(withTickedItem(now).items[0], 'task');
  assert.equal(task.done, true);
  assert.equal(task.doneAt, now);
});

test('colours can be set and removed', () => {
  const item = addItem(createChecklist(at(2026, 11, 5)), 'A', 'a').items[0];
  assert.equal(withColor(item, 'red').color, 'red');
  assert.equal('color' in withColor(withColor(item, 'red'), null), false);
});

test('notes can be added, edited and removed; blank text changes nothing', () => {
  const base = addItem(createChecklist(at(2026, 11, 5)), 'A', 'a').items[0];
  const item = addNote(base, 'n', ' Первая ');
  assert.equal(item.notes?.[0].text, 'Первая');
  assert.equal(addNote(item, 'x', '   '), item);
  assert.equal(editNote(item, 'n', 'Вторая').notes?.[0].text, 'Вторая');
  assert.equal(editNote(item, 'n', '  ').notes?.[0].text, 'Первая');
  assert.deepEqual(removeNote(item, 'n').notes, []);
});

test('photos can be added and removed', () => {
  const base = addItem(createChecklist(at(2026, 11, 5)), 'A', 'a').items[0];
  const item = addPhotos(base, ['1.jpg', '2.jpg']);
  assert.deepEqual(removePhoto(item, '1.jpg').photos, ['2.jpg']);
});

test('the row summary lists the date, photos and notes in compact form', () => {
  const now = at(2026, 11, 7);
  let list = withTickedItem(now);
  assert.equal(rowSummary(list.items[0]), 'Отмечено 7\u00A0ноября');
  list = updateItem(list, 'a', (item) => addPhotos(addNote(item, 'n', 'Текст'), ['1.jpg', '2.jpg']));
  assert.equal(rowSummary(list.items[0]), 'Отмечено 7\u00A0ноября, 2\u00A0фото, 1\u00A0заметка');
  const plain = addItem(createChecklist(now), 'B', 'b').items[0];
  assert.equal(rowSummary(plain), null);
  const notes = ['a', 'b', 'c', 'd', 'e'].reduce((item, id) => addNote(item, id, 'x'), plain);
  assert.equal(rowSummary(notes), '5\u00A0заметок');
});

test('attachments and colours survive saving, and clearing ticks keeps them', () => {
  const now = at(2026, 11, 5);
  const list = updateItem(withTickedItem(now), 'a', (item) =>
    withColor(addPhotos(addNote(item, 'n', 'Текст'), ['1.jpg']), 'green'),
  );
  assert.deepEqual(parseChecklist(JSON.stringify(list)), list);
  const cleared = clearTicks(list, at(2026, 12, 5)).items[0];
  assert.equal(cleared.done, false);
  assert.equal(cleared.color, 'green');
  assert.deepEqual(cleared.photos, ['1.jpg']);
  assert.equal(cleared.notes?.length, 1);
});

test('dates are written in Russian', () => {
  assert.equal(formatDay(at(2026, 12, 5)), '5 декабря');
});
