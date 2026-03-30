import { Stack } from 'expo-router';

export default function WerkbonnenLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F5F6FA' },
      }}
    />
  );
}
