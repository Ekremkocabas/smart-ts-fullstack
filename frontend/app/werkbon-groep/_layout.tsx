import { Stack } from 'expo-router';
import React from 'react';

export default function WerkbonGroepLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F172A' },
      }}
    />
  );
}
