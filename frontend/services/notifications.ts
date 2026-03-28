/**
 * Push Notifications Service
 * Handles registration, permissions, and notification listeners
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../context/AuthContext';

// Configure foreground notification handling (app open → still show alert + sound)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Setup Android notification channels.
 * Must be called before any notification can be received on Android 8+.
 */
async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Smart-Tech Notificaties',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#F5A623',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('planning', {
    name: 'Planning',
    description: 'Nieuwe taken en planning updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3498db',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('berichten', {
    name: 'Berichten',
    description: 'Nieuwe berichten van het bedrijf',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#27ae60',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('werkbon', {
    name: 'Werkbonnen',
    description: 'Nieuwe werkbon ingediend',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#e67e22',
    sound: 'default',
  });
}

/**
 * Request notification permissions and get Expo push token.
 * Works on physical devices only.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Only works on physical devices
  if (!Device.isDevice) {
    console.log('[Push] Push notifications require a physical device');
    return null;
  }

  // Setup Android channels first (so they exist when first notification arrives)
  await setupAndroidChannels();

  // Check / request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission denied');
    return null;
  }

  // Resolve projectId: prefer app.json extra.eas.projectId, fallback to env var
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    process.env.EXPO_PUBLIC_PROJECT_ID;

  if (!projectId) {
    console.error('[Push] projectId not found — check app.json extra.eas.projectId');
    return null;
  }

  try {
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[Push] Token obtained:', pushToken.data.slice(0, 40) + '...');
    return pushToken.data;
  } catch (error) {
    console.error('[Push] Error getting push token:', error);
    return null;
  }
}

/**
 * Save push token to backend
 */
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken) {
      console.error('[Push] No auth token available for savePushToken');
      return false;
    }

    await apiClient.post(
      `/api/auth/users/${userId}/push-token`,
      { push_token: token },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    await AsyncStorage.setItem('pushToken', token);
    console.log('[Push] Token saved to backend');
    return true;
  } catch (error) {
    console.error('[Push] Error saving push token:', error);
    return false;
  }
}

/**
 * Remove push token from backend (on logout)
 */
export async function removePushToken(userId: string): Promise<void> {
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken) return;

    await apiClient.delete(
      `/api/auth/users/${userId}/push-token`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    await AsyncStorage.removeItem('pushToken');
    console.log('[Push] Token removed from backend');
  } catch (error) {
    // Non-critical — just log
    console.warn('[Push] Could not remove push token from backend:', error);
  }
}

/**
 * Setup notification listeners (foreground + tap)
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Push] Notification received in foreground:', notification.request.content.title);
    onNotificationReceived?.(notification);
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Push] Notification tapped:', response.notification.request.content.title);
    onNotificationResponse?.(response);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications and reset badge
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}
