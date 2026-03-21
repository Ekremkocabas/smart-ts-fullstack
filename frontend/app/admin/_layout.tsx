import React, { useState, useEffect } from 'react';
import { Stack, usePathname, router } from 'expo-router';
import { Platform, View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const menuItems = [
  { icon: 'grid-outline', label: 'Dashboard', route: '/admin/dashboard' },
  { icon: 'calendar-outline', label: 'Planning', route: '/admin/planning' },
  { icon: 'people-outline', label: 'Werknemers', route: '/admin/werknemers' },
  { icon: 'git-branch-outline', label: 'Teams', route: '/admin/teams' },
  { icon: 'briefcase-outline', label: 'Klanten', route: '/admin/klanten' },
  { icon: 'business-outline', label: 'Werven', route: '/admin/werven' },
  { icon: 'chatbubbles-outline', label: 'Berichten', route: '/admin/berichten' },
  { icon: 'bar-chart-outline', label: 'Rapporten', route: '/admin/rapporten' },
  { icon: 'settings-outline', label: 'Instellingen', route: '/admin/instellingen' },
];

function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace('/admin/login');
  };

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      {/* Header */}
      <View style={styles.sidebarHeader}>
        {!collapsed && (
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              {theme.logoBase64 ? (
                <Image
                  source={{ uri: theme.logoBase64.startsWith('data:image') ? theme.logoBase64 : `data:image/png;base64,${theme.logoBase64}` }}
                  style={styles.sidebarLogoImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="cube" size={24} color={theme.primaryColor || '#F5A623'} />
              )}
            </View>
            <View>
              <Text style={[styles.logoText, { color: theme.secondaryColor || '#1A1A2E' }]}>{theme.bedrijfsnaam || 'Smart-Tech'}</Text>
              <Text style={styles.logoSubtext}>Beheerportaal</Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={styles.collapseBtn} onPress={() => setCollapsed(!collapsed)}>
          <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-back'} size={20} color="#6c757d" />
        </TouchableOpacity>
      </View>

      {/* Menu */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {menuItems.map((item, index) => {
          const isActive = pathname === item.route || pathname.startsWith(item.route + '/');
          return (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, isActive && { backgroundColor: `${theme.primaryColor || '#F5A623'}15` }]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons 
                name={isActive ? item.icon.replace('-outline', '') as any : item.icon as any} 
                size={22} 
                color={isActive ? theme.primaryColor || '#F5A623' : '#6c757d'} 
              />
              {!collapsed && (
                <Text style={[styles.menuLabel, isActive && { color: theme.secondaryColor || '#1A1A2E' }]}>
                  {item.label}
                </Text>
              )}
              {isActive && !collapsed && <View style={[styles.activeIndicator, { backgroundColor: theme.primaryColor || '#F5A623' }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* User info & Logout */}
      <View style={styles.sidebarFooter}>
        {!collapsed && (
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{user?.naam?.charAt(0) || 'A'}</Text>
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName} numberOfLines={1}>{user?.naam || 'Beheerder'}</Text>
              <Text style={styles.userRole}>{user?.rol || 'Admin'}</Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={styles.passwordBtn} onPress={() => router.push('/admin/account' as any)}>
          <Ionicons name="key-outline" size={22} color="#6c757d" />
          {!collapsed && <Text style={styles.passwordText}>Wachtwoord</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#dc3545" />
          {!collapsed && <Text style={styles.logoutText}>Uitloggen</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CompactTopNav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { theme } = useTheme();

  const handleLogout = async () => {
    await logout();
    router.replace('/admin/login');
  };

  return (
    <View style={styles.compactShell}>
      <View style={styles.compactHeader}>
        <Text style={[styles.compactTitle, { color: theme.secondaryColor || '#1A1A2E' }]}>{theme.bedrijfsnaam || 'Smart-Tech'} Admin</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.compactLogoutBtn}>
          <Ionicons name="log-out-outline" size={18} color="#dc3545" />
          <Text style={styles.compactLogoutText}>Uitloggen</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactMenuRow}>
        {menuItems.map((item) => {
          const isActive = pathname === item.route || pathname.startsWith(item.route + '/');
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.compactMenuItem, isActive && { backgroundColor: `${theme.primaryColor || '#F5A623'}18`, borderColor: theme.primaryColor || '#F5A623' }]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons name={item.icon as any} size={16} color={isActive ? theme.primaryColor || '#F5A623' : '#6c757d'} />
              <Text style={[styles.compactMenuLabel, isActive && { color: theme.secondaryColor || '#1A1A2E' }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function AdminLayout() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return null;
  }

  // Don't show sidebar on login page
  const isLoginPage = pathname === '/admin/login';
  const isCompactWeb = width < 1024;

  // Auth check - redirect to login if not authenticated (except on login page)
  useEffect(() => {
    console.log('[AdminLayout] Auth state:', { isLoading, user: user?.naam, isLoginPage, pathname });
    if (!isLoading && !user && !isLoginPage) {
      router.replace('/admin/login');
    }
  }, [user, isLoading, isLoginPage]);

  // Show loading while checking auth
  if (isLoading) {
    console.log('[AdminLayout] Still loading auth...');
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' }}>
        <Text style={{ fontSize: 16, color: '#6c757d' }}>Laden...</Text>
      </View>
    );
  }

  // If not logged in and not on login page, don't render anything (will redirect)
  if (!user && !isLoginPage) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' }}>
        <Text style={{ fontSize: 16, color: '#6c757d' }}>Doorverwijzen naar login...</Text>
      </View>
    );
  }

  if (isLoginPage) {
    return (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F6FA' } }}>
        <Stack.Screen name="login" />
      </Stack>
    );
  }

  if (isCompactWeb) {
    return (
      <View style={styles.compactContainer}>
        <CompactTopNav />
        <View style={styles.compactContent}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F6FA' } }}>
            <Stack.Screen name="dashboard" />
            <Stack.Screen name="werknemers" />
            <Stack.Screen name="werknemer-detail" />
            <Stack.Screen name="teams" />
            <Stack.Screen name="team-detail" />
            <Stack.Screen name="klanten" />
            <Stack.Screen name="klant-detail" />
            <Stack.Screen name="werven" />
            <Stack.Screen name="werf-detail" />
            <Stack.Screen name="werkbonnen" />
            <Stack.Screen name="werkbon-detail" />
            <Stack.Screen name="planning" />
            <Stack.Screen name="berichten" />
            <Stack.Screen name="rapporten" />
            <Stack.Screen name="instellingen" />
            <Stack.Screen name="account" />
          </Stack>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Sidebar />
      <View style={styles.mainContent}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F6FA' } }}>
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="werknemers" />
          <Stack.Screen name="werknemer-detail" />
          <Stack.Screen name="teams" />
          <Stack.Screen name="team-detail" />
          <Stack.Screen name="klanten" />
          <Stack.Screen name="klant-detail" />
          <Stack.Screen name="werven" />
          <Stack.Screen name="werf-detail" />
          <Stack.Screen name="werkbonnen" />
          <Stack.Screen name="werkbon-detail" />
          <Stack.Screen name="planning" />
          <Stack.Screen name="berichten" />
          <Stack.Screen name="rapporten" />
          <Stack.Screen name="instellingen" />
          <Stack.Screen name="account" />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
  },
  compactContainer: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  compactShell: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
    paddingTop: 10,
    paddingBottom: 8,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  compactTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  compactLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactLogoutText: {
    color: '#dc3545',
    fontSize: 13,
    fontWeight: '600',
  },
  compactMenuRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  compactMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  compactMenuLabel: {
    color: '#6c757d',
    fontSize: 13,
    fontWeight: '600',
  },
  compactContent: {
    flex: 1,
  },
  sidebar: {
    width: 260,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E8E9ED',
    flexDirection: 'column',
  },
  sidebarCollapsed: {
    width: 70,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
    minHeight: 72,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F5A62315',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarLogoImage: {
    width: 30,
    height: 30,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  logoSubtext: {
    fontSize: 12,
    color: '#6c757d',
  },
  collapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContainer: {
    flex: 1,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
    gap: 12,
    position: 'relative',
  },
  menuItemActive: {
    backgroundColor: '#F5A62310',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#6c757d',
    fontWeight: '500',
  },
  menuLabelActive: {
    color: '#1A1A2E',
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -10,
    width: 4,
    height: 20,
    backgroundColor: '#F5A623',
    borderRadius: 2,
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  userRole: {
    fontSize: 12,
    color: '#6c757d',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#dc354510',
  },
  logoutText: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: '500',
  },
  passwordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    marginBottom: 8,
  },
  passwordText: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
  },
});
