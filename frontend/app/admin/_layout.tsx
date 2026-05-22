import React, { useState, useEffect, useRef } from 'react';
import { Stack, usePathname, router } from 'expo-router';
import { Platform, View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

type MenuItem = { icon: string; label: string; route: string; feature?: 'berichten' };

const menuItems: MenuItem[] = [
  { icon: 'grid-outline', label: 'Dashboard', route: '/admin/dashboard' },
  { icon: 'calendar-outline', label: 'Planning', route: '/admin/planning' },
  { icon: 'people-outline', label: 'Werknemers', route: '/admin/werknemers' },
  // { icon: 'git-branch-outline', label: 'Teams', route: '/admin/teams' }, // Hidden from menu
  { icon: 'briefcase-outline', label: 'Klanten', route: '/admin/klanten' },
  { icon: 'business-outline', label: 'Werven', route: '/admin/werven' },
  { icon: 'document-text-outline', label: 'Werkbonnen', route: '/admin/werkbonnen' },
  { icon: 'chatbubbles-outline', label: 'Berichten', route: '/admin/berichten', feature: 'berichten' },
  { icon: 'bar-chart-outline', label: 'Rapporten', route: '/admin/rapporten' },
  { icon: 'settings-outline', label: 'Instellingen', route: '/admin/instellingen' },
];

function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasFeature } = useAuth();
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [contactNaam, setContactNaam] = useState<string>('');

  useEffect(() => {
    if (Platform.OS !== 'web' || !user) return;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        const res = await fetch('/api/instellingen', { headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) {
          const inst = await res.json();
          const full = ((inst.voornaam || '') + ' ' + (inst.achternaam || '')).trim();
          if (full) setContactNaam(full);
        }
      } catch (e) { /* ignore */ }
    })();
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    router.replace('/admin/login');
  };

  // Logo fallback rule (multi-tenant brand isolation):
  // If the tenant has NOT uploaded a logo we MUST NOT render the Signybon
  // platform logo — that would imply this tenant is Signybon. Instead, show
  // the tenant's bedrijfsnaam initials in a colored badge so the panel feels
  // branded without leaking another identity onto the user.
  const tenantInitials = (theme.bedrijfsnaam || 'Signybon')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase() || 'S';

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
                <View style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: theme.primaryColor || '#0F172A',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{tenantInitials}</Text>
                </View>
              )}
            </View>
            <View>
              <Text style={[styles.logoText, { color: theme.secondaryColor || '#0F172A' }]}>{(theme.bedrijfsnaam || 'Signybon').toUpperCase()}</Text>
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
          const locked = !!item.feature && !hasFeature(item.feature);
          const handlePress = () => {
            if (locked) {
              router.push('/admin/instellingen?section=abonnement');
            } else {
              router.push(item.route as any);
            }
          };
          return (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, isActive && { backgroundColor: `${theme.primaryColor || '#0F172A'}15` }, locked && { opacity: 0.55 }]}
              onPress={handlePress}
            >
              <Ionicons
                name={isActive ? item.icon.replace('-outline', '') as any : item.icon as any}
                size={22}
                color={isActive ? theme.primaryColor || '#0F172A' : '#6c757d'}
              />
              {!collapsed && (
                <Text style={[styles.menuLabel, isActive && { color: theme.secondaryColor || '#0F172A' }]}>
                  {item.label}
                </Text>
              )}
              {locked && !collapsed && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 6 }}>
                  <Ionicons name="lock-closed" size={12} color="#6c757d" />
                  <View style={{ backgroundColor: '#22C55E', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: '#0F172A', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>PRO</Text>
                  </View>
                </View>
              )}
              {isActive && !collapsed && !locked && <View style={[styles.activeIndicator, { backgroundColor: theme.primaryColor || '#0F172A' }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* User info & Logout */}
      <View style={styles.sidebarFooter}>
        {!collapsed && (
          <View style={styles.userInfo}>
            <View style={[styles.userAvatar, { backgroundColor: theme.primaryColor || '#0F172A' }]}>
              <Text style={styles.userAvatarText}>{(theme?.bedrijfsnaam || 'S').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName} numberOfLines={1}>{theme?.bedrijfsnaam || 'Signybon'}</Text>
              <Text style={styles.userRole} numberOfLines={1}>{contactNaam || user?.naam || ''}</Text>
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
        <Text style={[styles.compactTitle, { color: theme.secondaryColor || '#0F172A' }]}>{(theme.bedrijfsnaam || 'Signybon').toUpperCase()} ADMIN</Text>
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
              style={[styles.compactMenuItem, isActive && { backgroundColor: `${theme.primaryColor || '#0F172A'}18`, borderColor: theme.primaryColor || '#0F172A' }]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons name={item.icon as any} size={16} color={isActive ? theme.primaryColor || '#0F172A' : '#6c757d'} />
              <Text style={[styles.compactMenuLabel, isActive && { color: theme.secondaryColor || '#0F172A' }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Request browser notification permission and set up polling for new werkbonnen */
function useWebPushNotifications(user: any, isLoginPage: boolean) {
  const lastCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || isLoginPage || !user) return;
    if (typeof Notification === 'undefined') return;

    // Request permission once
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const poll = async () => {
      if (Notification.permission !== 'granted') return;
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;

        const baseUrl = window.location.origin;
        const res = await fetch(`${baseUrl}/api/werkbonnen/count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        const total: number = typeof data?.total === 'number' ? data.total : 0;

        if (lastCountRef.current === null) {
          // First poll — just store baseline
          lastCountRef.current = total;
          return;
        }

        if (total > lastCountRef.current) {
          const diff = total - lastCountRef.current;
          lastCountRef.current = total;
          new Notification('Nieuwe werkbon', {
            body: `${diff} nieuwe werkbon${diff > 1 ? 'nen' : ''} ingediend`,
            icon: '/favicon.png',
            tag: 'werkbon-new',
          });
        } else {
          lastCountRef.current = total;
        }
      } catch {
        // Silently ignore network errors
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [user?.id, isLoginPage]);
}

export default function AdminLayout() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { width } = useWindowDimensions();

  // Inject Signybon help widget script (web only, once)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    if (document.getElementById('signybon-help-script')) return;
    const s = document.createElement('script');
    s.id = 'signybon-help-script';
    s.src = '/signybon-help.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  // Set favicon dynamically — try company logo, fallback to /favicon.png
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    const setFav = (href: string) => {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = href;
    };
    (async () => {
      try {
        const hdrs: Record<string, string> = {};
        const tk = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (tk) hdrs['Authorization'] = `Bearer ${tk}`;
        const res = await fetch('/api/app-settings/logo', { headers: hdrs });
        if (res.ok) {
          const data = await res.json();
          if (data && data.logo_base64) {
            const prefix = String(data.logo_base64).startsWith('data:image') ? '' : 'data:image/png;base64,';
            setFav(prefix + data.logo_base64);
            return;
          }
        }
      } catch (e) { /* ignore */ }
      setFav('/favicon.png?v=2');
    })();
  }, []);

  if (Platform.OS !== 'web') {
    return null;
  }

  // Don't show sidebar on login page
  const isLoginPage = pathname === '/admin/login';
  const isCompactWeb = width < 1024;

  // Browser push notifications for new werkbonnen
  useWebPushNotifications(user, isLoginPage);

  // Auth check - redirect to login if not authenticated (except on login page)
  useEffect(() => {
    console.log('[AdminLayout] Auth state:', { isLoading, user: user?.naam, isLoginPage, pathname });
    if (!isLoading && !user && !isLoginPage) {
      router.replace('/admin/login');
    }
  }, [user, isLoading, isLoginPage]);

  // Trial status banner
  const [trialInfo, setTrialInfo] = useState<{status: string; days_remaining: number | null} | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !user || isLoginPage) return;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        const res = await fetch('/api/subscription/status', { headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) {
          const data = await res.json();
          setTrialInfo(data);
        }
      } catch (e) { /* ignore */ }
    })();
  }, [user, isLoginPage]);

  const showTrialBanner = trialInfo && trialInfo.status === 'trial' && trialInfo.days_remaining !== null && trialInfo.days_remaining <= 10;

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
            <Stack.Screen name="werkbonnen/week" />
            <Stack.Screen name="werkbonnen/month" />
            <Stack.Screen name="werkbonnen/year" />
            <Stack.Screen name="werkbonnen/volledig" />
            <Stack.Screen name="werkbon-detail" />
            <Stack.Screen name="planning" />
            <Stack.Screen name="berichten" />
            <Stack.Screen name="rapporten" />
            <Stack.Screen name="instellingen" />
            <Stack.Screen name="account" />
            <Stack.Screen name="facturatie-koppeling" />
            <Stack.Screen name="billit-koppeling" />
          </Stack>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Sidebar />
      <View style={styles.mainContent}>
        {showTrialBanner && (
          <View style={{ backgroundColor: '#22C55E', paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Ionicons name="time-outline" size={18} color="#0F172A" />
            <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '600' }}>
              Uw proefperiode loopt af over {trialInfo!.days_remaining} dag{trialInfo!.days_remaining === 1 ? '' : 'en'}.
            </Text>
            <TouchableOpacity onPress={() => router.push('/admin/instellingen?section=abonnement')}>
              <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>Activeer abonnement</Text>
            </TouchableOpacity>
          </View>
        )}
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
          <Stack.Screen name="werkbonnen/week" />
          <Stack.Screen name="werkbonnen/month" />
          <Stack.Screen name="werkbonnen/year" />
          <Stack.Screen name="werkbonnen/volledig" />
          <Stack.Screen name="werkbon-detail" />
          <Stack.Screen name="planning" />
          <Stack.Screen name="berichten" />
          <Stack.Screen name="rapporten" />
          <Stack.Screen name="instellingen" />
          <Stack.Screen name="account" />
          <Stack.Screen name="facturatie-koppeling" />
          <Stack.Screen name="billit-koppeling" />
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
    backgroundColor: '#0F172A',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
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
    borderBottomColor: '#1E293B',
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
    backgroundColor: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  logoSubtext: {
    fontSize: 12,
    color: '#94A3B8',
  },
  collapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  menuLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -12,
    width: 4,
    height: 24,
    backgroundColor: '#22C55E',
    borderRadius: 2,
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
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
    backgroundColor: '#0F172A',
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
    color: '#FFFFFF',
  },
  userRole: {
    fontSize: 12,
    color: '#94A3B8',
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
    backgroundColor: '#1E293B',
    marginBottom: 8,
  },
  passwordText: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
  },
});
