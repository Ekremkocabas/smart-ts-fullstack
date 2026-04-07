import React, { useEffect } from 'react';
import { Stack, usePathname, router } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';
const BG = '#F5F6FA';

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
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="36" height="36">' +
        '<rect x="15" y="15" width="70" height="70" rx="12" ry="12" fill="#D4A017" transform="rotate(45 50 50)"/>' +
        '<rect x="23" y="23" width="54" height="54" rx="9" ry="9" fill="#1B4332" transform="rotate(45 50 50)"/>' +
        '<rect x="36" y="36" width="28" height="28" rx="5" ry="5" fill="#D4A017" transform="rotate(45 50 50)"/>' +
        '</svg>';
    }
  }, []);
  return <View ref={ref} style={{ width: 36, height: 36 }} />;
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
            <Ionicons name="diamond-outline" size={30} color={SIGNYBON_GOLD} />
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
                color={isActive ? SIGNYBON_GOLD : '#cfd9d3'}
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
    backgroundColor: SIGNYBON_GREEN,
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
    color: SIGNYBON_GOLD,
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
    backgroundColor: 'rgba(212,160,23,0.15)',
  },
  menuLabel: {
    color: '#cfd9d3',
    fontSize: 15,
    fontWeight: '500',
  },
  menuLabelActive: {
    color: SIGNYBON_GOLD,
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
