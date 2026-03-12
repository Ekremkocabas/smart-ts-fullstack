import React from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function AdminLayout() {
  // Only show admin routes on web
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F5F6FA' },
      }}
    >
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="werknemers" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="werven" />
      <Stack.Screen name="klanten" />
      <Stack.Screen name="instellingen" />
      <Stack.Screen name="werkbonnen" />
    </Stack>
  );
}
