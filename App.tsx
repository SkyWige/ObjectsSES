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
  doneCount,
  formatDay,
  hasTicks,
  isResetDue,
  Item,
  reminderTime,
  removeItem,
  renameItem,
  rowSummary,
  taskCount,
  toggleItem,
  updateItem,
} from './src/checklist';
import { CheckBox, KindPicker } from './src/controls';
import { DetailScreen } from './src/DetailScreen';
import { deletePhotoFiles } from './src/photos';
import { onClearRequest, syncReminder, takeClearRequest } from './src/reminder';
import { loadChecklist, saveChecklist } from './src/storage';
import { Colors, TEXT_COLORS, ThemeName, THEMES } from './src/theme';
import { updateWidgets } from './src/widgetBridge';

const THEME_KEY = 'monthly-checklist/theme';
const CLOCK_INTERVAL_MS = 60_000;
const CLEAR_CONFIRM_MS = 3_000;
const MAX_TITLE_LENGTH = 5_000;

type RowProps = {
  item: Item;
  colors: Colors;
  themeName: ThemeName;
  onToggle: () => void;
  onOpen: () => void;
};

function Row({ item, colors, themeName, onToggle, onOpen }: RowProps) {
  const summary = rowSummary(item);
  const isTask = item.kind !== 'text';
  const baseColor = item.done ? colors.muted : colors.text;
  return (
    <View style={[styles.row, { borderBottomColor: colors.line }]}>
      {isTask && (
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
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Подробнее: ${item.title}`}
        onPress={() => {
          Keyboard.dismiss();
          onOpen();
        }}
        style={[styles.rowBody, !isTask && styles.rowBodyPlain]}
      >
        <View style={styles.rowText}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              { color: item.color ? TEXT_COLORS[themeName][item.color] : baseColor },
              item.done && styles.titleDone,
            ]}
          >
            {item.title}
          </Text>
          {summary && <Text style={[styles.summary, { color: colors.muted }]}>{summary}</Text>}
        </View>
        <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
      </Pressable>
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
  const [draftKind, setDraftKind] = useState<'task' | 'text'>('task');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const listRef = useRef<FlatList<Item>>(null);
  const scrollToNewItem = useRef(false);
  // Bumped by every change to the list, so a slower reload from storage cannot undo it.
  const loadGeneration = useRef(0);
  const detailOpen = useRef(false);
  detailOpen.current = openId !== null;

  const themeName: ThemeName = themeChoice ?? (systemTheme === 'dark' ? 'dark' : 'light');
  const colors = THEMES[themeName];

  const load = () => {
    const generation = loadGeneration.current;
    return loadChecklist().then((saved) => {
      if (generation !== loadGeneration.current) return;
      const loaded = saved ?? createChecklist(Date.now());
      setList(takeClearRequest() ? clearTicks(loaded, Date.now()) : loaded);
    });
  };

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((raw) => {
        if (raw === 'light' || raw === 'dark') setThemeChoice(raw);
      })
      .catch(() => {});
    // Nothing is saved after a failed read, so a temporary error cannot wipe the real list.
    load().catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    if (!list) return;
    loadGeneration.current += 1;
    saveChecklist(list)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
    updateWidgets(list);
  }, [list]);

  // Covers a phone left open past the reminder date, a return from the background,
  // and ticks changed from a widget while the app was in the background.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, CLOCK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      tick();
      // The photo picker also sends the app to the background and back. Reloading then
      // could race with the photo being added, so wait until the detail screen is closed.
      if (!detailOpen.current) load().catch(() => {});
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(
    () =>
      onClearRequest(() => {
        loadGeneration.current += 1;
        setList((current) => current && clearTicks(current, Date.now()));
      }),
    [],
  );

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = setTimeout(() => setConfirmingClear(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

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
    setList(addItem(list, draft, id, draftKind));
    setDraft('');
  };

  const clearAll = () => {
    Keyboard.dismiss();
    setConfirmingClear(false);
    setList((current) => current && clearTicks(current, Date.now()));
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

  const tasks = taskCount(list);
  const openItem = list.items.find((item) => item.id === openId);

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
        {tasks > 0 && (
          <Text style={[styles.subheading, { color: colors.muted }]}>
            Выполнено {doneCount(list)} из {tasks}
          </Text>
        )}
        {!due && (
          <Text style={[styles.subheading, { color: colors.muted }]}>
            Напоминание снять галочки: {formatDay(list.nextResetAt)}
          </Text>
        )}
        {ticked && !due && (
          <Pressable
            accessibilityRole="button"
            onPress={() => (confirmingClear ? clearAll() : setConfirmingClear(true))}
            style={styles.clearButton}
          >
            <Text style={[styles.clearLabel, { color: colors.accent }]}>
              {confirmingClear ? 'Нажмите ещё раз, чтобы снять' : 'Снять все галочки'}
            </Text>
          </Pressable>
        )}
      </View>

      {due && ticked && (
        <View style={[styles.banner, { backgroundColor: colors.bannerBackground }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Прошёл месяц. Пора снять галочки и начать заново.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={clearAll}
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
            themeName={themeName}
            onToggle={() =>
              setList((current) => current && toggleItem(current, item.id, Date.now()))
            }
            onOpen={() => setOpenId(item.id)}
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
        <View style={styles.composerKind}>
          <KindPicker value={draftKind} colors={colors} onChange={setDraftKind} />
        </View>
        <View style={styles.composerRow}>
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
      </View>

      {openItem && (
        <DetailScreen
          key={openItem.id}
          item={openItem}
          colors={colors}
          themeName={themeName}
          onClose={() => setOpenId(null)}
          onToggle={() =>
            setList((current) => current && toggleItem(current, openItem.id, Date.now()))
          }
          onRename={(title) => setList((current) => current && renameItem(current, openItem.id, title))}
          onUpdate={(update) => setList((current) => current && updateItem(current, openItem.id, update))}
          onDelete={() => {
            setOpenId(null);
            setList((current) => current && removeItem(current, openItem.id));
            deletePhotoFiles(openItem.photos ?? []);
          }}
        />
      )}
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
    paddingBottom: 8,
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
  clearButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  clearLabel: {
    fontSize: 15,
    fontWeight: '600',
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
  rowBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 12,
  },
  rowBodyPlain: {
    paddingLeft: 16,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    lineHeight: 24,
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  summary: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    marginLeft: 8,
    fontSize: 24,
    lineHeight: 28,
  },
  saveError: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    paddingTop: 8,
    borderTopWidth: 1,
  },
  composerKind: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
