import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Reminder } from '@maindy/core/contracts';
import { api } from './api';

/**
 * Reminders are delivered two ways:
 *  1. a LOCAL notification scheduled on the device when the reminder is created (works offline);
 *  2. a remote Expo push sent by the API scheduler (cross-device), when a push token exists.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function ensureChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Lembretes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#7600FF',
    });
  }
}

export async function notificationPermission(request: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !request) return current.granted;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

export async function scheduleLocalReminder(r: Reminder): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!(await notificationPermission(false))) return null;
  const at = new Date(r.remindAt);
  if (at.getTime() <= Date.now()) return null;
  await ensureChannel();
  return Notifications.scheduleNotificationAsync({
    identifier: `reminder-${r.id}`,
    content: { title: r.title, body: r.body ?? 'Lembrete da MAINDY', data: { reminderId: r.id, url: `maindy://reminders/${r.id}` }, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminders' },
  });
}

export async function cancelLocalReminder(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(`reminder-${id}`).catch(() => undefined);
}

/** Registers the device + Expo push token with the API (requires a physical device and an EAS projectId). */
export async function registerDevice(): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  let pushToken: string | null = null;
  if (platform !== 'web' && Device.isDevice && (await notificationPermission(false))) {
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (projectId) {
      try {
        pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch {
        pushToken = null;
      }
    }
  }
  await api.registerDevice({ platform, name: Device.deviceName ?? null, pushToken }).catch(() => undefined);
}
