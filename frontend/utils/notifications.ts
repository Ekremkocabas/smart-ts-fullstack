import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Get API URL for mobile
const getApiUrl = () => {
  return process.env.EXPO_PUBLIC_BACKEND_URL || Constants.expoConfig?.extra?.apiUrl || '';
};

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const Notifications = require('expo-notifications');
    const Device = require('expo-device');

    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    // Check and request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    const pushToken = tokenData.data;
    console.log('[Push] Got token:', pushToken);

    // Get auth token from storage
    const authToken = await AsyncStorage.getItem('token');
    const API_URL = getApiUrl();
    
    // Save token to backend with auth
    try {
      const response = await fetch(`${API_URL}/api/auth/users/${userId}/push-token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : '',
        },
        body: JSON.stringify({ push_token: pushToken }),
      });
      console.log('[Push] Token save response:', response.status);
    } catch (e) {
      console.log('[Push] Failed to save push token:', e);
    }

    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    return pushToken;
  } catch (e) {
    console.log('[Push] notification setup error:', e);
    return null;
  }
}

export async function sendPushNotification(
  pushTokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const messages = pushTokens
    .filter(token => token && token.startsWith('ExponentPushToken'))
    .map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

  if (messages.length === 0) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.log('Push send error:', e);
  }
}
