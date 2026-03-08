import { Stack } from 'expo-router';
import React from 'react';

export default function HandtekeningLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1a1a2e' },
      }}
    />
  );
}
