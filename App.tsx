import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
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
  applyReset,
  Checklist,
  createChecklist,
  formatDay,
  Item,
  parseChecklist,
  removeItem,
  toggleItem,
} from './src/checklist';

const STORAGE_KEY = 'monthly-checklist/v1';
const RESET_CHECK_INTERVAL_MS = 60_000;
const DELETE_CONFIRM_MS = 3_000;
const MARGIN_WIDTH = 60;

const LIGHT = {
  paper: '#F6FAFE',
  rule: '#C4D9EE',
  margin: '#E2546C',
  ink: '#1C3C8C',
  faded: '#566A94',
  danger: '#BE2542',
};

const DARK = {
  paper: '#13203B',
  rule: '#2C3E63',
  margin: '#D9536B',
  ink: '#DDE7FF',
  faded: '#9DADCF',
  danger: '#FF8A9C',
};

type Palette = typeof LIGHT;

function CheckBox({ checked, colors }: { checked: boolean; colors: Palette }) {
  return (
    <View style={[styles.box, { borderColor: colors.ink }]}>
      {checked && (
        <View style={styles.tick}>
          <View style={[styles.tickShort, { backgroundColor: colors.ink }]} />
          <View style={[styles.tickLong, { backgroundColor: colors.ink }]} />
        </View>
      )}
    </View>
  );
}

type RowProps = {
  item: Item;
  colors: Palette;
  confirming: boolean;
  onToggle: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
};

function Row({ item, colors, confirming, onToggle, onAskDelete, onDelete }: RowProps) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.rule }]}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={item.done}
        accessibilityLabel={item.title}
        onPress={onToggle}
        style={styles.rowMain}
      >
        <View style={styles.marginCell}>
          <CheckBox checked={item.done} colors={colors} />
        </View>
        <Text
          style={[
            styles.title,
            { color: item.done ? colors.faded : colors.ink },
            item.done && styles.titleDone,
          ]}
        >
          {item.title}
        </Text>
      </Pressable>
      {confirming ? (
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
          <Text style={[styles.deleteIcon, { color: colors.faded }]}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function ChecklistScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColorScheme() === 'dark' ? DARK : LIGHT;

  const [list, setList] = useState<Checklist | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Item>>(null);
  const scrollToNewItem = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const saved = raw === null ? null : parseChecklist(raw);
        setList(applyReset(saved ?? createChecklist(Date.now()), Date.now()));
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

  // Covers both a phone left open past the reset date and a return from the background.
  useEffect(() => {
    const check = () => setList((current) => current && applyReset(current, Date.now()));
    const timer = setInterval(check, RESET_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
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

  const submit = () => {
    if (!list || !draft.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    scrollToNewItem.current = true;
    setList(addItem(list, draft, id));
    setDraft('');
  };

  if (!list) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.paper }]}>
        {loadFailed && (
          <Text style={[styles.message, { color: colors.ink }]}>
            Не удалось открыть список. Закройте приложение и запустите снова.
          </Text>
        )}
      </View>
    );
  }

  const doneCount = list.items.filter((item) => item.done).length;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: colors.paper }]}>
      <StatusBar style="auto" />
      <View pointerEvents="none" style={[styles.marginLine, { backgroundColor: colors.margin }]} />

      <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.rule }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
          Список на месяц
        </Text>
        <Text style={[styles.subheading, { color: colors.faded }]}>
          {list.items.length > 0 ? `Выполнено ${doneCount} из ${list.items.length}. ` : ''}
          Галочки снимутся {formatDay(list.nextResetAt)}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={list.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        onContentSizeChange={() => {
          if (scrollToNewItem.current) {
            scrollToNewItem.current = false;
            listRef.current?.scrollToEnd();
          }
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.faded }]}>
            Здесь пока пусто. Добавьте первую строку внизу.
          </Text>
        }
        renderItem={({ item }) => (
          <Row
            item={item}
            colors={colors}
            confirming={confirmingId === item.id}
            onToggle={() => {
              setConfirmingId(null);
              setList((current) => current && toggleItem(current, item.id));
            }}
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
          { borderTopColor: colors.ink, paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <View style={styles.marginCell}>
          <Text style={[styles.plus, { color: colors.ink }]}>+</Text>
        </View>
        <TextInput
          accessibilityLabel="Новая строка"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Новая строка"
          placeholderTextColor={colors.faded}
          maxLength={200}
          style={[styles.input, { color: colors.ink }]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!draft.trim()}
          onPress={submit}
          style={styles.addButton}
        >
          <Text style={[styles.addLabel, { color: draft.trim() ? colors.ink : colors.faded }]}>
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
  marginLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: MARGIN_WIDTH,
    width: 1.5,
  },
  header: {
    paddingLeft: MARGIN_WIDTH + 14,
    paddingRight: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  subheading: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 21,
  },
  list: {
    flex: 1,
  },
  empty: {
    paddingLeft: MARGIN_WIDTH + 14,
    paddingRight: 16,
    paddingTop: 16,
    fontSize: 17,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 56,
    borderBottomWidth: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  marginCell: {
    width: MARGIN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 26,
    height: 26,
    borderWidth: 2,
    borderRadius: 3,
  },
  tick: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
  },
  tickShort: {
    position: 'absolute',
    left: 3,
    top: 12,
    width: 9,
    height: 3,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  tickLong: {
    position: 'absolute',
    left: 7,
    top: 9,
    width: 17,
    height: 3,
    borderRadius: 2,
    transform: [{ rotate: '-55deg' }],
  },
  title: {
    flex: 1,
    paddingLeft: 14,
    paddingVertical: 14,
    fontSize: 18,
    lineHeight: 24,
  },
  titleDone: {
    textDecorationLine: 'line-through',
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
    paddingLeft: MARGIN_WIDTH + 14,
    paddingRight: 16,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 2,
  },
  plus: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingLeft: 14,
    paddingRight: 8,
    fontSize: 18,
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
