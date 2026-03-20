/**
 * Push Notifications Service
 * Handles registration, permissions, and notification listeners
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Configure notification handling
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
 * Request notification permissions and get push token
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  // Only works on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  try {
    // Get Expo push token
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // Add to .env if needed
    });
    token = pushToken.data;
    console.log('Push token:', token);
  } catch (error) {
    console.error('Error getting push token:', error);
  }

  // Android specific channel setup
  if (Platform.OS === 'android') {
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
  }

  return token;
}

/**
 * Save push token to backend
 */
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken) {
      console.error('No auth token available');
      return false;
    }

    await apiClient.post(
      `/api/auth/users/${userId}/push-token`,
      { push_token: token },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    
    // Store locally for reference
    await AsyncStorage.setItem('pushToken', token);
    console.log('Push token saved to backend');
    return true;
  } catch (error) {
    console.error('Error saving push token:', error);
    return false;
  }
}

/**
 * Remove push token from backend (logout)
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
    console.log('Push token removed');
  } catch (error) {
    console.error('Error removing push token:', error);
  }
}

/**
 * Setup notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  // When notification is received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification);
    onNotificationReceived?.(notification);
  });

  // When user taps on notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Notification response:', response);
    const data = response.notification.request.content.data;
    
    // Handle navigation based on notification type
    if (data?.type === 'planning') {
      // Navigate to planning tab
      // router.push('/(tabs)/planning');
    } else if (data?.type === 'bericht') {
      // Navigate to berichten tab
      // router.push('/(tabs)/berichten');
    }
    
    onNotificationResponse?.(response);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Send a local notification (for testing)
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  channelId: string = 'default'
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: null, // Immediately
  });
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
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}
