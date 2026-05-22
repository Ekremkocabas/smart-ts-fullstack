import React, { useEffect } from 'react';
import { Stack, usePathname, router } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const NAVY = '#0F172A';
const NAVY_LIGHT = '#1E293B';
const GREEN = '#22C55E';
const BG = '#E2E8F0';

const menuItems: { icon: any; label: string; route: string }[] = [
  { icon: 'grid-outline', label: 'Dashboard', route: '/masterpanel' },
  { icon: 'business-outline', label: 'Klanten', route: '/masterpanel/klanten' },
  { icon: 'help-buoy-outline', label: 'Support', route: '/masterpanel/tickets' },
  { icon: 'megaphone-outline', label: 'Duyurular', route: '/masterpanel/announcements' },
];

function SignybonDiamond() {
  const ref = React.useRef<any>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML =
        '<img src="/icon-white.png?v=4" alt="" width="40" height="40" style="display:block;object-fit:contain" />';
    }
  }, []);
  return <View ref={ref} style={{ width: 40, height: 40 }} />;
}

function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/admin/login');
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View style={styles.logoWrap}>
          {Platform.OS === 'web' ? (
            <SignybonDiamond />
          ) : (
            <Ionicons name="diamond-outline" size={30} color={GREEN} />
          )}
        </View>
        <View>
          <Text style={styles.brand}>SIGNYBON</Text>
          <Text style={styles.brandSub}>Master Panel</Text>
        </View>
      </View>

      <ScrollView style={styles.menu} showsVerticalScrollIndicator={false}>
        {menuItems.map((item) => {
          const isActive =
            pathname === item.route ||
            (item.route !== '/masterpanel' && pathname.startsWith(item.route));
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={isActive ? GREEN : '#cfd9d3'}
              />
              <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerEmail} numberOfLines={1}>
          {user?.email || ''}
        </Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutText}>Uitloggen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function MasterPanelLayout() {
  const { user, isLoading } = useAuth();

  // Web-only — mobile users have no business here
  if (Platform.OS !== 'web') return null;

  // Strict role guard: anything that isn't platform_admin gets bounced
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/admin/login');
      return;
    }
    if ((user as any).rol !== 'platform_admin') {
      router.replace('/admin/dashboard');
    }
  }, [user, isLoading]);

  if (isLoading || !user || (user as any).rol !== 'platform_admin') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <Text style={{ color: '#6c757d' }}>Laden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Sidebar />
      <View style={styles.main}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: BG },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="klanten" />
          <Stack.Screen name="klant-detail" />
          <Stack.Screen name="tickets" />
          <Stack.Screen name="announcements" />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: BG,
  },
  sidebar: {
    width: 260,
    backgroundColor: NAVY,
    flexDirection: 'column',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logoWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  menu: {
    flex: 1,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
  },
  menuItemActive: {
    backgroundColor: NAVY_LIGHT,
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
  },
  menuLabel: {
    color: '#cfd9d3',
    fontSize: 15,
    fontWeight: '500',
  },
  menuLabelActive: {
    color: GREEN,
    fontWeight: '700',
  },
  footer: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  footerEmail: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginBottom: 10,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(220,53,69,0.85)',
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  main: {
    flex: 1,
  },
});
