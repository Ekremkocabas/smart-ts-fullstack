import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, WEB_PANEL_ROLES, MOBILE_APP_ROLES } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function TabsLayout() {
  const { user, canAccessWebPanel } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Role-based visibility using new role system
  const userRole = user?.rol || 'worker';
  const isAdminOrManager = ['master_admin', 'admin', 'manager'].includes(userRole);
  const isWebPanelUser = WEB_PANEL_ROLES.includes(userRole);
  const isMobileAppUser = MOBILE_APP_ROLES.includes(userRole);

  // Calculate safe tab bar height for Samsung and other devices
  // Samsung gesture navigation typically adds ~20-34px to bottom
  const bottomInset = insets.bottom;
  const baseTabHeight = Platform.OS === 'ios' ? 50 : 56;
  const tabBarHeight = baseTabHeight + Math.max(bottomInset, Platform.OS === 'android' ? 16 : 0);
  const tabBarPaddingBottom = Math.max(bottomInset, Platform.OS === 'android' ? 8 : 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8E9ED',
          borderTopWidth: 1,
          // Safe area handling for Samsung and other devices
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 8,
          // Ensure tab bar is above system navigation
          elevation: 8,
        },
        tabBarActiveTintColor: theme.primaryColor,
        tabBarInactiveTintColor: '#6c757d',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginBottom: Platform.OS === 'android' ? 4 : 0,
        },
        // Better touch targets
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Werkbonnen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: 'Planning',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="berichten"
        options={{
          title: 'Berichten',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="documenten"
        options={{
          title: 'Documenten',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder" size={size} color={color} />
          ),
        }}
      />
      {/* Beheer tab - only visible for admin/manager roles */}
      <Tabs.Screen
        name="beheer"
        options={{
          title: 'Beheer',
          href: isAdminOrManager ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      {/* Rapport tab - only visible for admin/manager roles */}
      <Tabs.Screen
        name="rapport"
        options={{
          title: 'Rapport',
          href: isAdminOrManager ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profiel"
        options={{
          title: 'Profiel',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
