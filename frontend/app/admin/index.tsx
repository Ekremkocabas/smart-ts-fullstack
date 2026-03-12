import React from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

// This route redirects to appropriate admin interface
// On web: shows full admin portal
// On mobile: redirects to mobile beheer tab

export default function AdminIndex() {
  // On mobile, redirect to the beheer tab
  if (Platform.OS !== 'web') {
    return <Redirect href="/(tabs)/beheer" />;
  }
  
  // On web, redirect to admin dashboard
  return <Redirect href="/admin/dashboard" />;
}
