import React from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

// This route redirects to appropriate admin interface
// On web: shows admin login if not logged in, or dashboard if logged in
// On mobile: redirects to mobile beheer tab

export default function AdminIndex() {
  const { user } = useAuth();
  
  // On mobile, redirect to the beheer tab
  if (Platform.OS !== 'web') {
    return <Redirect href="/(tabs)/beheer" />;
  }
  
  // On web, check if user is logged in and is admin
  if (!user || !['beheerder', 'admin', 'manager', 'master_admin', 'platform_admin'].includes(user.rol)) {
    return <Redirect href="/admin/login" />;
  }
  
  // User is admin, redirect to dashboard
  return <Redirect href="/admin/dashboard" />;
}
