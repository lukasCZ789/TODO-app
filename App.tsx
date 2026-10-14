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
type Tab = 'tasks' | 'timeline' | 'calendar';

type Editor = {
  id: string | null;
  title: string;
  description: string;
  dueAt: number | null;
};

const STORAGE_KEY = 'todo-app.tasks.v1';
const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const MONTHS = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
];

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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameDay(a: number, b: Date) {
  const da = new Date(a);
  return (
    da.getFullYear() === b.getFullYear() &&
    da.getMonth() === b.getMonth() &&
    da.getDate() === b.getDate()
  );
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDue(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  const time = formatTime(ms);
  if (isSameDay(ms, today)) return `Dnes ${time}`;
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

function roundToNextHalfHour(from = Date.now()) {
  const date = new Date(from);
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  if (minutes === 0 || minutes === 30) return date.getTime();
  if (minutes < 30) {
    date.setMinutes(30);
  } else {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  }
  return date.getTime();
}

function groupTodosByDay(todos: Todo[]) {
  const dated = todos
    .filter((t): t is Todo & { dueAt: number } => t.dueAt !== null)
    .sort((a, b) => a.dueAt - b.dueAt);

  const groups: Array<{ day: number; items: Array<Todo & { dueAt: number }> }> = [];
  for (const todo of dated) {
    const day = startOfDay(new Date(todo.dueAt));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(todo);
    else groups.push({ day, items: [todo] });
  }
  return groups;
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

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < startOffset; i += 1) {
    cells.push({ date: null, key: `empty-${i}` });
  }
  for (let day = 1; day <= days; day += 1) {
    cells.push({ date: new Date(year, month, day), key: `day-${day}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, key: `tail-${cells.length}` });
  }
  return cells;
}

function DoneButton({
  completed,
  onPress,
}: {
  completed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.doneButton, completed && styles.doneButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={completed ? 'Označit jako nedokončené' : 'Označit jako hotové'}
    >
      <Text
        style={[styles.doneButtonText, completed && styles.doneButtonTextActive]}
      >
        {completed ? 'Hotovo ✓' : 'Označit jako hotové'}
      </Text>
    </Pressable>
  );
}

function TimelineItems({
  items,
  onOpen,
  onToggle,
}: {
  items: Todo[];
  onOpen: (todo: Todo) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.timeline}>
      {items.map((item, index) => (
        <View key={item.id} style={styles.timelineRow}>
          <View style={styles.timelineTimeCol}>
            <Text style={styles.timelineTime}>
              {item.dueAt ? formatTime(item.dueAt) : '--:--'}
            </Text>
            <View style={styles.timelineRail}>
              <View
                style={[
                  styles.timelineDot,
                  item.completed && styles.timelineDotDone,
                ]}
              />
              {index < items.length - 1 ? (
                <View style={styles.timelineLine} />
              ) : null}
            </View>
          </View>
          <View
            style={[
              styles.timelineCard,
              item.completed && styles.timelineCardDone,
            ]}
          >
            <Pressable onPress={() => onOpen(item)}>
              <Text
                style={[styles.cardTitle, item.completed && styles.cardTitleDone]}
              >
                {item.title}
              </Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </Pressable>
            <DoneButton
              completed={item.completed}
              onPress={() => onToggle(item.id)}
            />
          </View>
        </View>
      ))}
    </View>
  );
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
  const [tab, setTab] = useState<Tab>('tasks');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [awaitingTime, setAwaitingTime] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => new Date());

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

  const daysWithTasks = useMemo(() => {
    const set = new Set<number>();
    for (const todo of todos) {
      if (todo.dueAt) set.add(startOfDay(new Date(todo.dueAt)));
    }
    return set;
  }, [todos]);

  const dayTodos = useMemo(() => {
    return todos
      .filter((t) => t.dueAt !== null && isSameDay(t.dueAt, selectedDay))
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  }, [selectedDay, todos]);

  const timelineGroups = useMemo(() => groupTodosByDay(todos), [todos]);
  const unscheduled = useMemo(
    () => todos.filter((t) => t.dueAt === null),
    [todos],
  );

  const openNew = (dueAt: number | null = roundToNextHalfHour()) => {
    setPickerMode(null);
    setAwaitingTime(false);
    setEditor({ id: null, title: '', description: '', dueAt });
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

  const canSave = Boolean(editor?.title.trim());
  const editingTodo = editor?.id
    ? todos.find((t) => t.id === editor.id)
    : undefined;
  const tabBarHeight = 62 + insets.bottom;
  const cells = monthCells(monthCursor.getFullYear(), monthCursor.getMonth());
  const today = new Date();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {tab === 'tasks' ? (
          <>
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
                  <Text
                    style={[styles.chipText, filter === key && styles.chipTextActive]}
                  >
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
                { paddingBottom: 24 + tabBarHeight },
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
                  <View style={styles.card}>
                    <Pressable
                      style={styles.cardBody}
                      onPress={() => openEdit(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Otevřít úkol"
                    >
                      <Text
                        style={[
                          styles.cardTitle,
                          item.completed && styles.cardTitleDone,
                        ]}
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
                          <Text
                            style={[
                              styles.dueChipText,
                              overdue && styles.dueChipTextLate,
                            ]}
                          >
                            {overdue ? 'Po termínu · ' : ''}
                            {formatDue(item.dueAt)}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                    <DoneButton
                      completed={item.completed}
                      onPress={() => toggleTodo(item.id)}
                    />
                  </View>
                );
              }}
            />
          </>
        ) : tab === 'timeline' ? (
          <ScrollView
            contentContainerStyle={[
              styles.calendarPage,
              { paddingBottom: 24 + tabBarHeight },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.hello}>Přehled</Text>
              <Text style={styles.title}>Časová osa</Text>
              <Text style={styles.subtitle}>
                Úkoly podle data a času, který nastavíš při vytvoření
              </Text>
            </View>

            {timelineGroups.length === 0 && unscheduled.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Zatím žádný termín</Text>
                <Text style={styles.emptyHint}>
                  Přidej úkol a nastav datum i čas — objeví se tady na ose.
                </Text>
              </View>
            ) : (
              timelineGroups.map((group) => (
                <View key={group.day}>
                  <Text style={styles.timelineTitle}>
                    {new Date(group.day).toLocaleDateString('cs-CZ', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                  <TimelineItems
                    items={group.items}
                    onOpen={openEdit}
                    onToggle={toggleTodo}
                  />
                </View>
              ))
            )}

            {unscheduled.length > 0 ? (
              <View>
                <Text style={styles.timelineTitle}>Bez termínu</Text>
                <TimelineItems
                  items={unscheduled}
                  onOpen={openEdit}
                  onToggle={toggleTodo}
                />
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.calendarPage,
              { paddingBottom: 24 + tabBarHeight },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.hello}>Přehled</Text>
              <Text style={styles.title}>Kalendář</Text>
              <Text style={styles.subtitle}>
                Vyber den a uvidíš úkoly na časové ose
              </Text>
            </View>

            <View style={styles.monthBar}>
              <Pressable
                onPress={() =>
                  setMonthCursor(
                    new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
                  )
                }
                style={styles.monthNav}
              >
                <Text style={styles.monthNavText}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitle}>
                {MONTHS[monthCursor.getMonth()]} {monthCursor.getFullYear()}
              </Text>
              <Pressable
                onPress={() =>
                  setMonthCursor(
                    new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
                  )
                }
                style={styles.monthNav}
              >
                <Text style={styles.monthNavText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((cell) => {
                if (!cell.date) {
                  return <View key={cell.key} style={styles.dayCell} />;
                }
                const selected = isSameDay(cell.date.getTime(), selectedDay);
                const isToday = isSameDay(cell.date.getTime(), today);
                const hasTasks = daysWithTasks.has(startOfDay(cell.date));
                return (
                  <Pressable
                    key={cell.key}
                    style={[
                      styles.dayCell,
                      selected && styles.dayCellSelected,
                      isToday && !selected && styles.dayCellToday,
                    ]}
                    onPress={() => setSelectedDay(cell.date as Date)}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        selected && styles.dayNumSelected,
                      ]}
                    >
                      {cell.date.getDate()}
                    </Text>
                    {hasTasks ? (
                      <View
                        style={[styles.dayDot, selected && styles.dayDotSelected]}
                      />
                    ) : (
                      <View style={styles.dayDotSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.timelineTitle}>
              {selectedDay.toLocaleDateString('cs-CZ', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>

            {dayTodos.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nic naplánovaného</Text>
                <Text style={styles.emptyHint}>
                  Přidej úkol s datem, nebo klepni na + pro tento den.
                </Text>
              </View>
            ) : (
              <TimelineItems
                items={dayTodos}
                onOpen={openEdit}
                onToggle={toggleTodo}
              />
            )}
          </ScrollView>
        )}

        <Pressable
          style={[styles.fab, { bottom: 16 + tabBarHeight }]}
          onPress={() => {
            if (tab === 'calendar') {
              const due = new Date(selectedDay);
              due.setHours(9, 0, 0, 0);
              openNew(due.getTime());
              return;
            }
            openNew();
          }}
          accessibilityRole="button"
          accessibilityLabel="Nový úkol"
        >
          <Text style={styles.fabPlus}>+</Text>
        </Pressable>

        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.tabBtn} onPress={() => setTab('tasks')}>
            <Text style={[styles.tabLabel, tab === 'tasks' && styles.tabLabelActive]}>
              Úkoly
            </Text>
          </Pressable>
          <Pressable style={styles.tabBtn} onPress={() => setTab('timeline')}>
            <Text
              style={[styles.tabLabel, tab === 'timeline' && styles.tabLabelActive]}
            >
              Osa
            </Text>
          </Pressable>
          <Pressable style={styles.tabBtn} onPress={() => setTab('calendar')}>
            <Text
              style={[styles.tabLabel, tab === 'calendar' && styles.tabLabelActive]}
            >
              Kalendář
            </Text>
          </Pressable>
        </View>
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
                  <View style={styles.webDueRow}>
                    <Pressable
                      style={[styles.dueButton, styles.webDueField]}
                      onPress={() => {
                        setAwaitingTime(false);
                        setPickerMode('date');
                      }}
                    >
                      <Text style={styles.dueButtonText}>
                        {editor.dueAt
                          ? new Date(editor.dueAt).toLocaleDateString('cs-CZ')
                          : 'Datum'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.dueButton, styles.webDueField]}
                      onPress={() => {
                        setAwaitingTime(false);
                        setPickerMode('time');
                      }}
                    >
                      <Text style={styles.dueButtonText}>
                        {editor.dueAt ? formatTime(editor.dueAt) : 'Čas'}
                      </Text>
                    </Pressable>
                  </View>
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
                  <>
                    <Pressable
                      style={[
                        styles.doneButton,
                        styles.doneButtonLarge,
                        editingTodo?.completed && styles.doneButtonActive,
                      ]}
                      onPress={() => toggleTodo(editor.id as string)}
                    >
                      <Text
                        style={[
                          styles.doneButtonText,
                          editingTodo?.completed && styles.doneButtonTextActive,
                        ]}
                      >
                        {editingTodo?.completed
                          ? 'Hotovo ✓  ·  klepni pro vrácení'
                          : 'Označit jako hotové'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete(editor.id as string, true)}
                    >
                      <Text style={styles.deleteBtnText}>Smazat úkol</Text>
                    </Pressable>
                  </>
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
    paddingVertical: 24,
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
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
  },
  cardBody: {
    gap: 8,
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
  doneButton: {
    marginTop: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: COLORS.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  doneButtonLarge: {
    marginTop: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
  },
  doneButtonActive: {
    backgroundColor: 'rgba(61, 214, 140, 0.18)',
  },
  doneButtonText: {
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  doneButtonTextActive: {
    color: COLORS.done,
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
    zIndex: 2,
  },
  fabPlus: {
    color: COLORS.text,
    fontSize: 34,
    marginTop: -2,
    fontWeight: '500',
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#151a24',
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 10,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabel: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: COLORS.text,
  },
  calendarPage: {
    paddingBottom: 24,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  monthNav: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavText: {
    color: COLORS.text,
    fontSize: 24,
    marginTop: -2,
  },
  monthTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  dayCellSelected: {
    backgroundColor: COLORS.accent,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  dayNum: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  dayNumSelected: {
    color: COLORS.text,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginTop: 3,
  },
  dayDotSelected: {
    backgroundColor: COLORS.text,
  },
  dayDotSpacer: {
    height: 9,
  },
  timelineTitle: {
    marginTop: 18,
    marginHorizontal: 22,
    marginBottom: 12,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  timeline: {
    paddingHorizontal: 16,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineTimeCol: {
    width: 58,
    alignItems: 'center',
  },
  timelineTime: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  timelineRail: {
    flex: 1,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  timelineDotDone: {
    backgroundColor: COLORS.done,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: COLORS.cardBorder,
    marginTop: 4,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  timelineCardDone: {
    opacity: 0.7,
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
    marginTop: 16,
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
