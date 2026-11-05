import {
  AndroidImportance,
  cancelScheduledNotificationAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_ID = 'monthly-reset';
const CHANNEL_ID = 'reminders';

/**
 * Keeps a single phone notification scheduled for the given moment, or none for null.
 * The permission prompt first appears when a tick makes a reminder necessary. If it is
 * refused, the banner inside the app still shows the reminder.
 */
export async function syncReminder(at: number | null): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelScheduledNotificationAsync(REMINDER_ID);
  if (at === null) return;

  // Android 13+ only shows the permission prompt once a channel exists.
  await setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Напоминания',
    importance: AndroidImportance.DEFAULT,
  });
  const { granted } = await requestPermissionsAsync();
  if (!granted) return;

  await scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Прошёл месяц',
      body: 'Откройте список и снимите галочки.',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
    },
  });
}
