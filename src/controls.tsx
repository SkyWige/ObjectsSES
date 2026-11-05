import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from './theme';

export function CheckBox({ checked, colors }: { checked: boolean; colors: Colors }) {
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

const KINDS = [
  { value: 'task', label: 'С галочкой' },
  { value: 'text', label: 'Просто текст' },
] as const;

export function KindPicker({
  value,
  colors,
  onChange,
}: {
  value: 'task' | 'text';
  colors: Colors;
  onChange: (kind: 'task' | 'text') => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={[styles.kinds, { backgroundColor: colors.surface }]}>
      {KINDS.map((kind) => {
        const selected = kind.value === value;
        return (
          <Pressable
            key={kind.value}
            accessibilityRole="radio"
            aria-checked={selected}
            onPress={() => onChange(kind.value)}
            style={[styles.kind, selected && { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.kindLabel, { color: selected ? colors.onAccent : colors.text }]}>
              {kind.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  kinds: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 8,
  },
  kind: {
    flex: 1,
    minHeight: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
