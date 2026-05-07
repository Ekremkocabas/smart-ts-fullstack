import React from 'react';
import { Platform, View, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

// This route redirects to appropriate admin interface
// On web: shows admin login if not logged in, or dashboard if logged in
// On mobile: redirects to mobile beheer tab

export default function AdminIndex() {
  const { user, isLoading } = useAuth();

  // On mobile, redirect to the beheer tab
  if (Platform.OS !== 'web') {
    return <Redirect href="/(tabs)/beheer" />;
  }

  // While AuthContext is hydrating localStorage, do NOT redirect — otherwise
  // we race the loadUser() effect and bounce a freshly logged-in user back
  // to /admin/login because user is still null in this render cycle.
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' }}>
        <Text style={{ fontSize: 16, color: '#6c757d' }}>Laden...</Text>
      </View>
    );
  }

  // On web, check if user is logged in and is admin
  if (!user || !['beheerder', 'admin', 'manager', 'master_admin', 'platform_admin'].includes(user.rol)) {
    return <Redirect href="/admin/login" />;
  }

  // User is admin, redirect to dashboard
  return <Redirect href="/admin/dashboard" />;
}
