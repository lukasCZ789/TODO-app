import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'task-reminders';
const LEAD_MS = 15 * 60 * 1000;

export type ReminderTodo = {
  id: string;
  title: string;
  description: string;
  dueAt: number | null;
  completed: boolean;
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureReminderPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Připomínky úkolů',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C6BFF',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

function triggerAt(date: Date): Notifications.NotificationTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
    channelId: CHANNEL_ID,
  };
}

export async function syncTaskReminders(
  todos: ReminderTodo[],
  enabled: boolean,
): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return;

  const allowed = await ensureReminderPermissions();
  if (!allowed) return;

  const now = Date.now();

  for (const todo of todos) {
    if (todo.completed || todo.dueAt === null) continue;

    if (todo.dueAt > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `todo-due-${todo.id}`,
        content: {
          title: 'Čas na úkol',
          body: todo.description
            ? `${todo.title} — ${todo.description}`
            : todo.title,
          data: { todoId: todo.id },
          sound: 'default',
        },
        trigger: triggerAt(new Date(todo.dueAt)),
      });
    }

    const soonAt = todo.dueAt - LEAD_MS;
    if (soonAt > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `todo-soon-${todo.id}`,
        content: {
          title: 'Za 15 minut',
          body: todo.title,
          data: { todoId: todo.id },
          sound: 'default',
        },
        trigger: triggerAt(new Date(soonAt)),
      });
    }
  }
}
