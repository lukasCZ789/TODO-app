import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

const COLORS = {
  bg: '#12141a',
  surface: '#1c212b',
  surfaceBorder: '#2a3344',
  text: '#eef2f7',
  textMuted: '#8b95a8',
  accent: '#6c8cff',
  accentMuted: '#3d4f7a',
  success: '#3dd68c',
  danger: '#ff6b7a',
  inputBg: '#252b36',
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function App() {
  const [draft, setDraft] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);

  const canAdd = useMemo(() => draft.trim().length > 0, [draft]);
  const remaining = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos],
  );

  const addTodo = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [
      { id: createId(), text, completed: false },
      ...prev,
    ]);
    setDraft('');
    Keyboard.dismiss();
  }, [draft]);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <PhonePreviewShell>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Úkoly</Text>
        <Text style={styles.subtitle}>
          {todos.length === 0
            ? 'Začni přidáním prvního úkolu'
            : `${remaining} zbývá · ${todos.length} celkem`}
        </Text>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Co je potřeba udělat?"
          placeholderTextColor={COLORS.textMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={canAdd ? addTodo : undefined}
          returnKeyType="done"
          maxLength={200}
        />
        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            !canAdd && styles.addButtonDisabled,
            pressed && canAdd && styles.addButtonPressed,
          ]}
          onPress={addTodo}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="Přidat úkol"
        >
          <Text style={[styles.addButtonText, !canAdd && styles.addButtonTextDisabled]}>
            +
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={todos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          todos.length === 0 ? styles.listEmpty : styles.listContent
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>☁️</Text>
            <Text style={styles.emptyTitle}>Seznam je prázdný</Text>
            <Text style={styles.emptyHint}>Napiš úkol nahoře a klepni na +</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              style={styles.checkHit}
              onPress={() => toggleTodo(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.completed }}
              accessibilityLabel={item.completed ? 'Označit jako nedokončené' : 'Označit jako hotové'}
            >
              <View
                style={[
                  styles.checkbox,
                  item.completed && styles.checkboxDone,
                ]}
              >
                {item.completed ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : null}
              </View>
            </Pressable>
            <Text
              style={[styles.todoText, item.completed && styles.todoTextDone]}
              numberOfLines={3}
            >
              {item.text}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.deleteHit, pressed && styles.deletePressed]}
              onPress={() => deleteTodo(item.id)}
              accessibilityRole="button"
              accessibilityLabel="Smazat úkol"
            >
              <Text style={styles.deleteIcon}>×</Text>
            </Pressable>
          </View>
        )}
      />
    </PhonePreviewShell>
  );
}

function PhonePreviewShell({ children }: { children: ReactNode }) {
  const screen = <View style={styles.screen}>{children}</View>;

  if (Platform.OS !== 'web') {
    return screen;
  }

  return (
    <View style={styles.webViewport}>
      <View style={styles.phoneBezel}>
        <View style={styles.phoneNotch} />
        {screen}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08080c',
    paddingVertical: 16,
  },
  phoneBezel: {
    width: 390,
    maxWidth: '100%',
    flex: 1,
    maxHeight: 844,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#3a3f4a',
    overflow: 'hidden',
    backgroundColor: COLORS.bg,
  },
  phoneNotch: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    width: 120,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0a0a0a',
    zIndex: 10,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: COLORS.textMuted,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: COLORS.accentMuted,
  },
  addButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  addButtonText: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: -2,
  },
  addButtonTextDisabled: {
    color: COLORS.textMuted,
  },
  listContent: {
    paddingBottom: 32,
    gap: 10,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 48,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  checkHit: {
    padding: 4,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    borderColor: COLORS.success,
    backgroundColor: 'rgba(61, 214, 140, 0.15)',
  },
  checkmark: {
    color: COLORS.success,
    fontSize: 16,
    fontWeight: '700',
  },
  todoText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.text,
  },
  todoTextDone: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  deleteHit: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePressed: {
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
  },
  deleteIcon: {
    fontSize: 26,
    lineHeight: 28,
    color: COLORS.danger,
    fontWeight: '400',
  },
});
