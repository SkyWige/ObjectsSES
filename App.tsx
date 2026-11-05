import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addItem,
  Checklist,
  clearTicks,
  createChecklist,
  formatDay,
  hasTicks,
  isResetDue,
  Item,
  parseChecklist,
  reminderTime,
  removeItem,
  renameItem,
  toggleItem,
} from './src/checklist';
import { syncReminder } from './src/reminder';

const STORAGE_KEY = 'monthly-checklist/v1';
const THEME_KEY = 'monthly-checklist/theme';
const CLOCK_INTERVAL_MS = 60_000;
const DELETE_CONFIRM_MS = 3_000;
const MAX_TITLE_LENGTH = 200;

type ThemeName = 'light' | 'dark';

const THEMES = {
  light: {
    background: '#FFFFFF',
    text: '#171717',
    muted: '#666666',
    line: '#E2E2E2',
    accent: '#1F6FEB',
    onAccent: '#FFFFFF',
    bannerBackground: '#EAF2FE',
    danger: '#C62828',
  },
  dark: {
    background: '#141414',
    text: '#F2F2F2',
    muted: '#A3A3A3',
    line: '#333333',
    accent: '#7CB0FF',
    onAccent: '#141414',
    bannerBackground: '#1F2A3A',
    danger: '#FF8A80',
  },
};

type Colors = typeof THEMES.light;

function CheckBox({ checked, colors }: { checked: boolean; colors: Colors }) {
  return (
    <View
      style={[
        styles.box,
        { borderColor: checked ? colors.accent : colors.muted },
        checked && { backgroundColor: colors.accent },
      ]}
    >
      {checked && (
        <View style={styles.tick}>
          <View style={[styles.tickShort, { backgroundColor: colors.onAccent }]} />
          <View style={[styles.tickLong, { backgroundColor: colors.onAccent }]} />
        </View>
      )}
    </View>
  );
}

type RowProps = {
  item: Item;
  colors: Colors;
  confirmingDelete: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onAskDelete: () => void;
  onDelete: () => void;
};

function Row({
  item,
  colors,
  confirmingDelete,
  onToggle,
  onRename,
  onAskDelete,
  onDelete,
}: RowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const finishEditing = () => {
    if (draft !== null) onRename(draft);
    setDraft(null);
  };

  return (
    <View style={[styles.row, { borderBottomColor: colors.line }]}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={item.done}
        accessibilityLabel={item.title}
        onPress={() => {
          Keyboard.dismiss();
          onToggle();
        }}
        style={styles.checkCell}
      >
        <CheckBox checked={item.done} colors={colors} />
      </Pressable>

      <View style={styles.rowBody}>
        {editing ? (
          <TextInput
            accessibilityLabel="Текст строки"
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            onBlur={finishEditing}
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            maxLength={MAX_TITLE_LENGTH}
            style={[styles.title, styles.titleInput, { color: colors.text, borderBottomColor: colors.accent }]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Изменить: ${item.title}`}
            onPress={() => setDraft(item.title)}
          >
            <Text
              style={[
                styles.title,
                { color: item.done ? colors.muted : colors.text },
                item.done && styles.titleDone,
              ]}
            >
              {item.title}
            </Text>
          </Pressable>
        )}
        {item.done && item.doneAt !== undefined && (
          <Text style={[styles.doneDate, { color: colors.muted }]}>
            Отмечено {formatDay(item.doneAt)}
          </Text>
        )}
      </View>

      {!editing &&
        (confirmingDelete ? (
          <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deleteButton}>
            <Text style={[styles.deleteConfirm, { color: colors.danger }]}>Удалить</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Удалить: ${item.title}`}
            onPress={onAskDelete}
            style={styles.deleteButton}
          >
            <Text style={[styles.deleteIcon, { color: colors.muted }]}>×</Text>
          </Pressable>
        ))}
    </View>
  );
}

function ChecklistScreen() {
  const insets = useSafeAreaInsets();
  const systemTheme = useColorScheme();

  const [list, setList] = useState<Checklist | null>(null);
  const [themeChoice, setThemeChoice] = useState<ThemeName | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Item>>(null);
  const scrollToNewItem = useRef(false);

  const themeName: ThemeName = themeChoice ?? (systemTheme === 'dark' ? 'dark' : 'light');
  const colors = THEMES[themeName];

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, THEME_KEY])
      .then(([[, rawList], [, rawTheme]]) => {
        if (rawTheme === 'light' || rawTheme === 'dark') setThemeChoice(rawTheme);
        const saved = rawList === null ? null : parseChecklist(rawList);
        setList(saved ?? createChecklist(Date.now()));
      })
      // Nothing is saved after this, so a temporary read error cannot wipe the real list.
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    if (!list) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
  }, [list]);

  // Covers both a phone left open past the reminder date and a return from the background.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, CLOCK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!confirmingId) return;
    const timer = setTimeout(() => setConfirmingId(null), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingId]);

  const ticked = list !== null && hasTicks(list);
  const due = list !== null && isResetDue(list, now);
  const reminderAt = list !== null && ticked ? reminderTime(list, now) : null;

  // With nothing to clear there is nothing to remind about, so the date just moves on.
  useEffect(() => {
    if (due && !ticked) setList((current) => current && clearTicks(current, Date.now()));
  }, [due, ticked]);

  useEffect(() => {
    if (!list) return;
    // A refused or failed notification is not fatal: the banner in the app still appears.
    syncReminder(reminderAt).catch(() => {});
  }, [list === null, reminderAt]);

  const submit = () => {
    if (!list || !draft.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    scrollToNewItem.current = true;
    setList(addItem(list, draft, id));
    setDraft('');
  };

  const toggleTheme = () => {
    const next: ThemeName = themeName === 'dark' ? 'light' : 'dark';
    setThemeChoice(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  };

  if (!list) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.background }]}>
        {loadFailed && (
          <Text style={[styles.message, { color: colors.text }]}>
            Не удалось открыть список. Закройте приложение и запустите снова.
          </Text>
        )}
      </View>
    );
  }

  const doneCount = list.items.filter((item) => item.done).length;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.line }]}>
        <View style={styles.headerTop}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
            Список на месяц
          </Text>
          <Pressable accessibilityRole="button" onPress={toggleTheme} style={styles.themeButton}>
            <Text style={[styles.themeLabel, { color: colors.accent }]}>
              {themeName === 'dark' ? 'Белая тема' : 'Тёмная тема'}
            </Text>
          </Pressable>
        </View>
        {list.items.length > 0 && (
          <Text style={[styles.subheading, { color: colors.muted }]}>
            Выполнено {doneCount} из {list.items.length}
          </Text>
        )}
        {!due && (
          <Text style={[styles.subheading, { color: colors.muted }]}>
            Напоминание снять галочки: {formatDay(list.nextResetAt)}
          </Text>
        )}
      </View>

      {due && ticked && (
        <View style={[styles.banner, { backgroundColor: colors.bannerBackground }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Прошёл месяц. Пора снять галочки и начать заново.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Keyboard.dismiss();
              setList((current) => current && clearTicks(current, Date.now()));
            }}
            style={[styles.bannerButton, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.bannerButtonLabel, { color: colors.onAccent }]}>
              Снять все галочки
            </Text>
          </Pressable>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={list.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.list}
        onContentSizeChange={() => {
          if (scrollToNewItem.current) {
            scrollToNewItem.current = false;
            listRef.current?.scrollToEnd();
          }
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>
            Здесь пока пусто. Добавьте первую строку внизу.
          </Text>
        }
        renderItem={({ item }) => (
          <Row
            item={item}
            colors={colors}
            confirmingDelete={confirmingId === item.id}
            onToggle={() => {
              setConfirmingId(null);
              setList((current) => current && toggleItem(current, item.id, Date.now()));
            }}
            onRename={(title) => setList((current) => current && renameItem(current, item.id, title))}
            onAskDelete={() => setConfirmingId(item.id)}
            onDelete={() => {
              setConfirmingId(null);
              setList((current) => current && removeItem(current, item.id));
            }}
          />
        )}
      />

      {saveFailed && (
        <Text style={[styles.saveError, { color: colors.danger }]}>
          Последние изменения не сохранились. Проверьте свободное место на телефоне.
        </Text>
      )}

      <View
        style={[
          styles.composer,
          { borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <TextInput
          accessibilityLabel="Новая строка"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Новая строка"
          placeholderTextColor={colors.muted}
          maxLength={MAX_TITLE_LENGTH}
          style={[styles.input, { color: colors.text }]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!draft.trim()}
          onPress={submit}
          style={styles.addButton}
        >
          <Text style={[styles.addLabel, { color: draft.trim() ? colors.accent : colors.muted }]}>
            Добавить
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ChecklistScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  heading: {
    flexShrink: 1,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  themeButton: {
    minHeight: 44,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
  },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bannerButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  empty: {
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 56,
    borderBottomWidth: 1,
  },
  checkCell: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 6,
  },
  tick: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 20,
    height: 20,
  },
  tickShort: {
    position: 'absolute',
    left: 2,
    top: 11,
    width: 8,
    height: 2.5,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  tickLong: {
    position: 'absolute',
    left: 5,
    top: 9,
    width: 14,
    height: 2.5,
    borderRadius: 2,
    transform: [{ rotate: '-50deg' }],
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  title: {
    fontSize: 17,
    lineHeight: 24,
  },
  titleInput: {
    padding: 0,
    borderBottomWidth: 1.5,
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  doneDate: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteButton: {
    minWidth: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    fontSize: 24,
    lineHeight: 28,
  },
  deleteConfirm: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveError: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 8,
    fontSize: 17,
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
