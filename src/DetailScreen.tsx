import { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addNote,
  addPhotos,
  editNote,
  formatDay,
  Item,
  Note,
  removeNote,
  removePhoto,
  TEXT_COLOR_NAMES,
  withColor,
  withKind,
} from './checklist';
import { CheckBox, KindPicker } from './controls';
import { deletePhotoFiles, photoUri, pickPhotos, takePhoto } from './photos';
import { Colors, TEXT_COLOR_LABELS, TEXT_COLORS, ThemeName } from './theme';

const CONFIRM_MS = 3_000;
const MAX_TEXT_LENGTH = 5_000;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Asks for a second tap before deleting, so a stray tap cannot lose anything. */
function DeleteButton({
  label,
  confirmLabel,
  colors,
  onDelete,
}: {
  label: string;
  confirmLabel: string;
  colors: Colors;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (confirming ? onDelete() : setConfirming(true))}
      style={styles.textButton}
    >
      <Text style={[styles.textButtonLabel, { color: colors.danger }]}>
        {confirming ? confirmLabel : label}
      </Text>
    </Pressable>
  );
}

function NoteEditor({
  note,
  colors,
  onChange,
  onDelete,
}: {
  note: Note;
  colors: Colors;
  onChange: (text: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(note.text);
  return (
    <View style={[styles.note, { backgroundColor: colors.surface }]}>
      <TextInput
        accessibilityLabel="Текст заметки"
        multiline
        scrollEnabled={false}
        value={draft}
        onChangeText={setDraft}
        onBlur={() => {
          if (draft.trim()) onChange(draft);
          else setDraft(note.text);
        }}
        maxLength={MAX_TEXT_LENGTH}
        style={[styles.noteInput, { color: colors.text }]}
      />
      <DeleteButton
        label="Удалить заметку"
        confirmLabel="Нажмите ещё раз, чтобы удалить"
        colors={colors}
        onDelete={onDelete}
      />
    </View>
  );
}

type Props = {
  item: Item;
  colors: Colors;
  themeName: ThemeName;
  onClose: () => void;
  onToggle: () => void;
  onRename: (title: string) => void;
  onUpdate: (update: (item: Item) => Item) => void;
  onDelete: () => void;
};

export function DetailScreen({
  item,
  colors,
  themeName,
  onClose,
  onToggle,
  onRename,
  onUpdate,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(item.title);
  const [noteDraft, setNoteDraft] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [viewedPhoto, setViewedPhoto] = useState<string | null>(null);

  const saveTitle = () => {
    if (title.trim()) onRename(title);
    else setTitle(item.title);
  };

  const close = () => {
    Keyboard.dismiss();
    saveTitle();
    onClose();
  };

  const submitNote = () => {
    if (!noteDraft.trim()) return;
    const text = noteDraft;
    onUpdate((current) => addNote(current, newId(), text));
    setNoteDraft('');
  };

  const addFrom = async (source: 'gallery' | 'camera') => {
    setPhotoError(null);
    try {
      let photos: string[];
      if (source === 'gallery') {
        photos = await pickPhotos();
      } else {
        const result = await takePhoto();
        if (result.denied) {
          setPhotoError('Нет доступа к камере. Разрешите его в настройках телефона.');
          return;
        }
        photos = result.photos;
      }
      if (photos.length) onUpdate((current) => addPhotos(current, photos));
    } catch {
      setPhotoError('Не удалось добавить фото. Попробуйте ещё раз.');
    }
  };

  const titleColor = item.color ? TEXT_COLORS[themeName][item.color] : colors.text;
  const photos = item.photos ?? [];
  const notes = item.notes ?? [];
  const isTask = item.kind !== 'text';

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (viewedPhoto ? setViewedPhoto(null) : close())}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <View
          style={[styles.topBar, { paddingTop: insets.top + 4, borderBottomColor: colors.line }]}
        >
          <Pressable accessibilityRole="button" onPress={close} style={styles.backButton}>
            <Text style={[styles.backLabel, { color: colors.accent }]}>Назад к списку</Text>
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        >
          <TextInput
            accessibilityLabel="Текст строки"
            multiline
            scrollEnabled={false}
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            placeholder="Текст строки"
            placeholderTextColor={colors.muted}
            maxLength={MAX_TEXT_LENGTH}
            style={[styles.titleInput, { color: titleColor, borderBottomColor: colors.line }]}
          />

          {isTask && (
            <Pressable
              accessibilityRole="checkbox"
              aria-checked={item.done}
              accessibilityLabel="Выполнено"
              onPress={onToggle}
              style={styles.tickRow}
            >
              <CheckBox checked={item.done} colors={colors} />
              <Text style={[styles.tickLabel, { color: colors.text }]}>
                {item.done
                  ? item.doneAt !== undefined
                    ? `Отмечено ${formatDay(item.doneAt)}`
                    : 'Отмечено'
                  : 'Не отмечено'}
              </Text>
            </Pressable>
          )}

          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
            Вид строки
          </Text>
          <KindPicker
            value={isTask ? 'task' : 'text'}
            colors={colors}
            onChange={(kind) => onUpdate((current) => withKind(current, kind))}
          />

          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
            Цвет текста
          </Text>
          <View style={styles.swatches}>
            <Pressable
              accessibilityRole="radio"
              aria-checked={!item.color}
              accessibilityLabel="Обычный"
              onPress={() => onUpdate((current) => withColor(current, null))}
              style={[styles.swatch, { borderColor: !item.color ? colors.accent : colors.line }]}
            >
              <Text style={[styles.swatchLetter, { color: colors.text }]}>А</Text>
            </Pressable>
            {TEXT_COLOR_NAMES.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="radio"
                aria-checked={item.color === name}
                accessibilityLabel={TEXT_COLOR_LABELS[name]}
                onPress={() => onUpdate((current) => withColor(current, name))}
                style={[
                  styles.swatch,
                  { borderColor: item.color === name ? colors.accent : colors.line },
                ]}
              >
                <Text style={[styles.swatchLetter, { color: TEXT_COLORS[themeName][name] }]}>А</Text>
              </Pressable>
            ))}
          </View>

          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
            Заметки
          </Text>
          {notes.map((note) => (
            <NoteEditor
              key={note.id}
              note={note}
              colors={colors}
              onChange={(text) => onUpdate((current) => editNote(current, note.id, text))}
              onDelete={() => onUpdate((current) => removeNote(current, note.id))}
            />
          ))}
          <View style={[styles.noteComposer, { borderColor: colors.line }]}>
            <TextInput
              accessibilityLabel="Новая заметка"
              multiline
              scrollEnabled={false}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Новая заметка"
              placeholderTextColor={colors.muted}
              maxLength={MAX_TEXT_LENGTH}
              style={[styles.noteComposerInput, { color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!noteDraft.trim()}
              onPress={submitNote}
              style={styles.noteAdd}
            >
              <Text
                style={[
                  styles.textButtonLabel,
                  { color: noteDraft.trim() ? colors.accent : colors.muted },
                ]}
              >
                Добавить заметку
              </Text>
            </Pressable>
          </View>

          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
            Фото
          </Text>
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <Pressable
                  key={photo}
                  accessibilityRole="button"
                  accessibilityLabel={`Открыть фото ${index + 1}`}
                  onPress={() => setViewedPhoto(photo)}
                >
                  <Image
                    source={{ uri: photoUri(photo) }}
                    style={[styles.thumbnail, { backgroundColor: colors.surface }]}
                  />
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.photoButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={() => addFrom('gallery')}
              style={[styles.photoButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.textButtonLabel, { color: colors.accent }]}>Из галереи</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => addFrom('camera')}
              style={[styles.photoButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.textButtonLabel, { color: colors.accent }]}>Снять фото</Text>
            </Pressable>
          </View>
          {photoError && (
            <Text style={[styles.photoError, { color: colors.danger }]}>{photoError}</Text>
          )}

          <View style={[styles.deleteRow, { borderTopColor: colors.line }]}>
            <DeleteButton
              label="Удалить строку"
              confirmLabel="Нажмите ещё раз, чтобы удалить"
              colors={colors}
              onDelete={onDelete}
            />
          </View>
        </ScrollView>

        {viewedPhoto && (
          <View style={styles.viewer}>
            <Image
              accessibilityLabel="Фото"
              source={{ uri: photoUri(viewedPhoto) }}
              resizeMode="contain"
              style={styles.viewerImage}
            />
            <View style={[styles.viewerBar, { paddingBottom: insets.bottom + 8 }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setViewedPhoto(null)}
                style={styles.textButton}
              >
                <Text style={[styles.textButtonLabel, styles.viewerLabel]}>Закрыть</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const name = viewedPhoto;
                  setViewedPhoto(null);
                  onUpdate((current) => removePhoto(current, name));
                  deletePhotoFiles([name]);
                }}
                style={styles.textButton}
              >
                <Text style={[styles.textButtonLabel, styles.viewerLabel]}>Удалить фото</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  titleInput: {
    padding: 0,
    paddingBottom: 8,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    borderBottomWidth: 1,
  },
  tickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    marginTop: 8,
  },
  tickLabel: {
    marginLeft: 12,
    fontSize: 16,
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLetter: {
    fontSize: 18,
    fontWeight: '700',
  },
  note: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
  },
  noteInput: {
    padding: 0,
    fontSize: 16,
    lineHeight: 22,
  },
  noteComposer: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  noteComposerInput: {
    padding: 0,
    minHeight: 44,
    fontSize: 16,
    lineHeight: 22,
  },
  noteAdd: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  textButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoError: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  deleteRow: {
    marginTop: 24,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  viewer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  viewerImage: {
    flex: 1,
  },
  viewerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  viewerLabel: {
    color: '#FFFFFF',
  },
});
