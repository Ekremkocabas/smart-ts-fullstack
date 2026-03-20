/**
 * Notification Context
 * Provides push notification functionality throughout the app
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  removePushToken,
  setupNotificationListeners,
  getBadgeCount,
  setBadgeCount,
  clearAllNotifications,
} from '../services/notifications';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  badgeCount: number;
  requestPermissions: () => Promise<boolean>;
  clearBadge: () => Promise<void>;
  clearNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [badgeCount, setBadgeCountState] = useState(0);

  // Register for push notifications when user logs in
  useEffect(() => {
    if (user?.id && Platform.OS !== 'web') {
      initializePushNotifications();
    }
  }, [user?.id]);

  // Setup notification listeners
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const cleanup = setupNotificationListeners(
      // When notification received in foreground
      (notif) => {
        setNotification(notif);
        updateBadgeCount();
      },
      // When user taps notification
      (response) => {
        const data = response.notification.request.content.data;
        handleNotificationTap(data);
      }
    );

    return cleanup;
  }, []);

  // Update badge count on mount
  useEffect(() => {
    if (Platform.OS !== 'web') {
      updateBadgeCount();
    }
  }, []);

  const initializePushNotifications = async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (token && user?.id) {
        setExpoPushToken(token);
        await savePushToken(user.id, token);
      }
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  };

  const handleNotificationTap = (data: any) => {
    if (data?.type === 'planning') {
      router.push('/(tabs)/planning');
    } else if (data?.type === 'bericht') {
      router.push('/(tabs)/berichten');
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    
    try {
      const token = await registerForPushNotificationsAsync();
      if (token && user?.id) {
        setExpoPushToken(token);
        await savePushToken(user.id, token);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  };

  const updateBadgeCount = async () => {
    if (Platform.OS === 'web') return;
    const count = await getBadgeCount();
    setBadgeCountState(count);
  };

  const clearBadge = async () => {
    if (Platform.OS === 'web') return;
    await setBadgeCount(0);
    setBadgeCountState(0);
  };

  const clearNotificationsHandler = async () => {
    if (Platform.OS === 'web') return;
    await clearAllNotifications();
    setBadgeCountState(0);
  };

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        notification,
        badgeCount,
        requestPermissions,
        clearBadge,
        clearNotifications: clearNotificationsHandler,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
