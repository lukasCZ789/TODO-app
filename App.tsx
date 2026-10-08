import { useCallback, useEffect, useMemo, useState } from 'react';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

type Todo = {
  id: string;
  title: string;
  description: string;
  dueAt: number | null;
  completed: boolean;
};

type Filter = 'open' | 'done' | 'all';

type Editor = {
  id: string | null;
  title: string;
  description: string;
  dueAt: number | null;
};

const STORAGE_KEY = 'todo-app.tasks.v1';

const COLORS = {
  bg: '#0f1218',
  card: '#1a2030',
  cardBorder: '#2b3448',
  text: '#f4f6fb',
  muted: '#8d97ab',
  accent: '#5b8cff',
  accentSoft: 'rgba(91, 140, 255, 0.16)',
  done: '#3dd68c',
  danger: '#ff6b7a',
  warning: '#ffb347',
  field: '#141924',
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Dobré ráno';
  if (hour < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

function formatDue(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const time = date.toLocaleTimeString('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return `Dnes ${time}`;

  const day = date.toLocaleDateString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${day} · ${time}`;
}

function mergeDate(base: Date, picked: Date) {
  const next = new Date(base);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

function mergeTime(base: Date, picked: Date) {
  const next = new Date(base);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toDateInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toTimeInput(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function sortTodos(todos: Todo[]) {
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueAt === null && b.dueAt === null) return 0;
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt - b.dueAt;
  });
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TodoApp />
    </SafeAreaProvider>
  );
}

function TodoApp() {
  const insets = useSafeAreaInsets();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [awaitingTime, setAwaitingTime] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Todo[];
        if (Array.isArray(parsed)) setTodos(parsed);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos)).catch(() => {});
  }, [ready, todos]);

  const remaining = todos.filter((t) => !t.completed).length;
  const visible = useMemo(() => {
    const filtered =
      filter === 'all'
        ? todos
        : todos.filter((t) => (filter === 'done' ? t.completed : !t.completed));
    return sortTodos(filtered);
  }, [filter, todos]);

  const openNew = () => {
    setPickerMode(null);
    setAwaitingTime(false);
    setEditor({ id: null, title: '', description: '', dueAt: null });
  };

  const openEdit = (todo: Todo) => {
    setPickerMode(null);
    setAwaitingTime(false);
    setEditor({
      id: todo.id,
      title: todo.title,
      description: todo.description,
      dueAt: todo.dueAt,
    });
  };

  const closeEditor = () => {
    setPickerMode(null);
    setAwaitingTime(false);
    setEditor(null);
  };

  const saveEditor = () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) return;

    const description = editor.description.trim();

    if (editor.id === null) {
      setTodos((prev) => [
        {
          id: createId(),
          title,
          description,
          dueAt: editor.dueAt,
          completed: false,
        },
        ...prev,
      ]);
    } else {
      setTodos((prev) =>
        prev.map((t) =>
          t.id === editor.id
            ? { ...t, title, description, dueAt: editor.dueAt }
            : t,
        ),
      );
    }
    closeEditor();
  };

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }, []);

  const confirmDelete = (id: string, fromEditor = false) => {
    Alert.alert('Smazat úkol?', 'Tuhle akci nepůjde vrátit.', [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: () => {
          setTodos((prev) => prev.filter((t) => t.id !== id));
          if (fromEditor) closeEditor();
        },
      },
    ]);
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === 'dismissed') {
      setPickerMode(null);
      setAwaitingTime(false);
      return;
    }
    if (!selected) return;

    setEditor((prev) => {
      if (!prev) return prev;
      const base = new Date(prev.dueAt ?? Date.now());
      const next =
        pickerMode === 'time' ? mergeTime(base, selected) : mergeDate(base, selected);
      return { ...prev, dueAt: next.getTime() };
    });

    if (Platform.OS === 'android') {
      setPickerMode(null);
      if (pickerMode === 'date' && awaitingTime) {
        setTimeout(() => {
          setPickerMode('time');
          setAwaitingTime(false);
        }, 250);
      }
    }
  };

  const pickDue = () => {
    setAwaitingTime(true);
    setPickerMode('date');
  };

  const canSave = Boolean(editor?.title.trim());

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.hello}>{greeting()}</Text>
          <Text style={styles.title}>Moje úkoly</Text>
          <Text style={styles.subtitle}>
            {todos.length === 0
              ? 'Přidej první úkol tlačítkem +'
              : remaining === 0
                ? 'Všechno je hotové'
                : `${remaining} ${remaining === 1 ? 'úkol zbývá' : 'úkolů zbývá'}`}
          </Text>
        </View>

        <View style={styles.filters}>
          {(
            [
              ['open', 'Aktivní'],
              ['done', 'Hotové'],
              ['all', 'Vše'],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.chip, filter === key && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            visible.length === 0 && styles.listEmpty,
            { paddingBottom: 108 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            ready ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {filter === 'done' ? 'Zatím nic hotového' : 'Žádné úkoly'}
                </Text>
                <Text style={styles.emptyHint}>
                  Klepni na + a napiš název, popis a termín.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const overdue =
              !item.completed && item.dueAt !== null && item.dueAt < Date.now();
            return (
              <Pressable
                style={styles.card}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel="Otevřít úkol"
              >
                <Pressable
                  style={styles.checkHit}
                  onPress={() => toggleTodo(item.id)}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.completed }}
                >
                  <View style={[styles.check, item.completed && styles.checkDone]}>
                    {item.completed ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                </Pressable>
                <View style={styles.cardBody}>
                  <Text
                    style={[styles.cardTitle, item.completed && styles.cardTitleDone]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {item.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  {item.dueAt !== null ? (
                    <View
                      style={[styles.dueChip, overdue && styles.dueChipLate]}
                    >
                      <Text style={[styles.dueChipText, overdue && styles.dueChipTextLate]}>
                        {overdue ? 'Po termínu · ' : ''}
                        {formatDue(item.dueAt)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.fab, { bottom: 24 + insets.bottom }]}
          onPress={openNew}
          accessibilityRole="button"
          accessibilityLabel="Nový úkol"
        >
          <Text style={styles.fabPlus}>+</Text>
        </Pressable>
      </SafeAreaView>

      <Modal
        visible={editor !== null}
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <View style={styles.modalBar}>
              <Pressable onPress={closeEditor} hitSlop={12}>
                <Text style={styles.modalBarBtn}>Zrušit</Text>
              </Pressable>
              <Text style={styles.modalBarTitle}>
                {editor?.id ? 'Úkol' : 'Nový úkol'}
              </Text>
              <Pressable onPress={saveEditor} disabled={!canSave} hitSlop={12}>
                <Text
                  style={[
                    styles.modalBarBtn,
                    styles.modalBarSave,
                    !canSave && styles.modalBarDisabled,
                  ]}
                >
                  Uložit
                </Text>
              </Pressable>
            </View>

            {editor ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalForm}
              >
                <Text style={styles.label}>Název</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Co je potřeba udělat?"
                  placeholderTextColor={COLORS.muted}
                  value={editor.title}
                  onChangeText={(title) =>
                    setEditor((prev) => (prev ? { ...prev, title } : prev))
                  }
                  maxLength={120}
                  autoFocus={!editor.id}
                />

                <Text style={styles.label}>Popis</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Sem napiš detaily, odkazy, co nesmíš zapomenout…"
                  placeholderTextColor={COLORS.muted}
                  value={editor.description}
                  onChangeText={(description) =>
                    setEditor((prev) => (prev ? { ...prev, description } : prev))
                  }
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />

                <Text style={styles.label}>Termín</Text>
                {Platform.OS === 'web' ? (
                  <View style={styles.webDueRow}>
                    <TextInput
                      style={[styles.input, styles.webDueField]}
                      placeholder="RRRR-MM-DD"
                      placeholderTextColor={COLORS.muted}
                      value={editor.dueAt ? toDateInput(editor.dueAt) : ''}
                      onChangeText={(value) => {
                        const time = editor.dueAt
                          ? toTimeInput(editor.dueAt)
                          : '09:00';
                        const next = new Date(`${value}T${time}`);
                        setEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                dueAt: Number.isNaN(next.getTime())
                                  ? prev.dueAt
                                  : next.getTime(),
                              }
                            : prev,
                        );
                      }}
                    />
                    <TextInput
                      style={[styles.input, styles.webDueField]}
                      placeholder="HH:MM"
                      placeholderTextColor={COLORS.muted}
                      value={editor.dueAt ? toTimeInput(editor.dueAt) : ''}
                      onChangeText={(value) => {
                        const date = editor.dueAt
                          ? toDateInput(editor.dueAt)
                          : toDateInput(Date.now());
                        const next = new Date(`${date}T${value}`);
                        setEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                dueAt: Number.isNaN(next.getTime())
                                  ? prev.dueAt
                                  : next.getTime(),
                              }
                            : prev,
                        );
                      }}
                    />
                  </View>
                ) : (
                  <Pressable style={styles.dueButton} onPress={pickDue}>
                    <Text style={styles.dueButtonText}>
                      {editor.dueAt ? formatDue(editor.dueAt) : 'Vybrat datum a čas'}
                    </Text>
                  </Pressable>
                )}
                {editor.dueAt ? (
                  <Pressable
                    onPress={() =>
                      setEditor((prev) => (prev ? { ...prev, dueAt: null } : prev))
                    }
                  >
                    <Text style={styles.clearDue}>Odstranit termín</Text>
                  </Pressable>
                ) : null}

                {pickerMode && Platform.OS !== 'web' ? (
                  <DateTimePicker
                    value={new Date(editor.dueAt ?? Date.now())}
                    mode={pickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onPickerChange}
                    locale="cs-CZ"
                  />
                ) : null}

                {editor.id ? (
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete(editor.id as string, true)}
                  >
                    <Text style={styles.deleteBtnText}>Smazat úkol</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 16,
  },
  hello: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 6,
    color: COLORS.muted,
    fontSize: 16,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  chipActive: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accent,
  },
  chipText: {
    color: COLORS.muted,
    fontWeight: '600',
    fontSize: 14,
  },
  chipTextActive: {
    color: COLORS.text,
  },
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyHint: {
    color: COLORS.muted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
    gap: 12,
  },
  checkHit: {
    paddingTop: 2,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {
    borderColor: COLORS.done,
    backgroundColor: 'rgba(61, 214, 140, 0.18)',
  },
  checkMark: {
    color: COLORS.done,
    fontWeight: '800',
    fontSize: 15,
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  cardTitleDone: {
    color: COLORS.muted,
    textDecorationLine: 'line-through',
  },
  cardDesc: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  dueChip: {
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dueChipLate: {
    backgroundColor: 'rgba(255, 179, 71, 0.16)',
  },
  dueChipText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  dueChipTextLate: {
    color: COLORS.warning,
  },
  fab: {
    position: 'absolute',
    right: 22,
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPlus: {
    color: COLORS.text,
    fontSize: 34,
    marginTop: -2,
    fontWeight: '500',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalSafe: {
    flex: 1,
  },
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  modalBarTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBarBtn: {
    color: COLORS.muted,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 64,
  },
  modalBarSave: {
    color: COLORS.accent,
    textAlign: 'right',
  },
  modalBarDisabled: {
    opacity: 0.35,
  },
  modalForm: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: COLORS.field,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
  },
  textarea: {
    minHeight: 140,
    paddingTop: 14,
  },
  dueButton: {
    backgroundColor: COLORS.field,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  dueButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  webDueRow: {
    flexDirection: 'row',
    gap: 8,
  },
  webDueField: {
    flex: 1,
  },
  clearDue: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtn: {
    marginTop: 32,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 122, 0.12)',
  },
  deleteBtnText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '700',
  },
});
