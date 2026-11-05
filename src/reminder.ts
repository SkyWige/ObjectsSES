import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  cancelScheduledNotificationAsync,
  clearLastNotificationResponse,
  dismissNotificationAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  NotificationResponse,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationCategoryAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_ID = 'monthly-reset';
const CHANNEL_ID = 'reminders';
const CATEGORY_ID = 'monthlyReset';
const CLEAR_ACTION = 'clearTicks';

/**
 * Keeps a single phone notification scheduled for the given moment, or none for null.
 * The permission prompt first appears when a tick makes a reminder necessary. If it is
 * refused, the banner inside the app still shows the reminder. Widgets run in the
 * background and pass `ask: false`, because they cannot show the prompt.
 */
export async function syncReminder(at: number | null, { ask = true } = {}): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelScheduledNotificationAsync(REMINDER_ID);
  if (at === null) return;

  // Android 13+ only shows the permission prompt once a channel exists.
  await setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Напоминания',
    importance: AndroidImportance.DEFAULT,
  });
  const { granted } = ask ? await requestPermissionsAsync() : await getPermissionsAsync();
  if (!granted) return;

  await setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: CLEAR_ACTION,
      buttonTitle: 'Снять все галочки',
      options: { opensAppToForeground: true },
    },
  ]);
  await scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Прошёл месяц',
      body: 'Пора снять галочки в списке.',
      categoryIdentifier: CATEGORY_ID,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
    },
  });
}

function isClearRequest(response: NotificationResponse | null): boolean {
  return response?.actionIdentifier === CLEAR_ACTION;
}

function dismiss(response: NotificationResponse): void {
  clearLastNotificationResponse();
  dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
}

/** True once if the app was opened by the notification's button. */
export function takeClearRequest(): boolean {
  if (Platform.OS === 'web') return false;
  const response = getLastNotificationResponse();
  if (!response || !isClearRequest(response)) return false;
  dismiss(response);
  return true;
}

/** Calls back when the notification's button is pressed while the app is running. */
export function onClearRequest(callback: () => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const subscription = addNotificationResponseReceivedListener((response) => {
    if (!isClearRequest(response)) return;
    dismiss(response);
    callback();
  });
  return () => subscription.remove();
}
