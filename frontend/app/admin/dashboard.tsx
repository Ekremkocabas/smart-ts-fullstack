import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, apiClient } from '../../context/AuthContext';
import Constants from 'expo-constants';

// Determine API URL - ALWAYS use window.location.origin for web production
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    // Production - use current origin, NO env variables
    return window.location.origin;
  }
  // Mobile only
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

interface DashboardStats {
  totaalWerknemers: number;
  totaalOnderaannemers: number;
  totaalTeams: number;
  totaalKlanten: number;
  totaalWerven: number;
  werkbonnenDezeWeek: number;
  werkbonnenWachtend: number;
  totaalUrenDezeWeek: number;
  planningDezeWeek: number;
  planningAfgerond: number;
}

interface RecentWerkbon {
  id: string;
  klant_naam: string;
  werf_naam: string;
  created_by_naam: string;
  week_nummer: number;
  status: string;
  created_at: string;
}

export default function AdminDashboard() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentWerkbonnen, setRecentWerkbonnen] = useState<RecentWerkbon[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug: Log component state
  useEffect(() => {
    console.log('[Dashboard] Component mounted. authLoading:', authLoading, 'token:', token?.substring(0, 20), 'user:', user?.naam);
  }, [authLoading, token, user]);

  useEffect(() => {
    // Wait for auth to complete and verify we have a valid admin user
    if (Platform.OS === 'web' && !authLoading && token && user) {
      const isAdmin = user?.rol === 'admin' || user?.rol === 'master_admin' || user?.rol === 'manager';
      if (isAdmin) {
        // Small delay to ensure apiClient has the token set
        const timer = setTimeout(() => {
          fetchData();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [user, token, authLoading]);

  const fetchData = async () => {
    if (!token) {
      console.warn('No token available');
      return;
    }
    try {
      setLoading(true);
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const currentWeek = Math.ceil((days + startOfYear.getDay() + 1) / 7);

      console.log('[Dashboard] Fetching data with token:', token?.substring(0, 20) + '...');
      
      const [werknemersRes, teamsRes, klantenRes, wervenRes, werkbonnenRes, planningRes] = await Promise.all([
        apiClient.get('/api/auth/users'),
        apiClient.get('/api/teams'),
        apiClient.get('/api/klanten'),
        apiClient.get('/api/werven'),
        apiClient.get(`/api/werkbonnen?user_id=${user?.id}&is_admin=true`),
        apiClient.get(`/api/planning?week_nummer=${currentWeek}&jaar=${now.getFullYear()}`),
      ]);

      const werknemers = werknemersRes.data;
      const teams = teamsRes.data;
      const klanten = klantenRes.data;
      const werven = wervenRes.data;
      const werkbonnen = werkbonnenRes.data;
      const planningData = planningRes.data;

      const werknemersList = Array.isArray(werknemers) ? werknemers : [];
      const teamsList = Array.isArray(teams) ? teams : [];
      const klantenList = Array.isArray(klanten) ? klanten : [];
      const wervenList = Array.isArray(werven) ? werven : [];
      const werkbonnenList = Array.isArray(werkbonnen) ? werkbonnen : [];
      const planningList = Array.isArray(planningData) ? planningData : [];

      // Separate werknemers and onderaannemers
      const actieveWerknemers = werknemersList.filter((w: any) => w.actief !== false);
      // Count workers, planners, managers as werknemers (exclude admin roles)
      const werknemerCount = actieveWerknemers.filter((w: any) => 
        w.rol === 'worker' || w.rol === 'werknemer' || w.rol === 'planner' || w.rol === 'manager'
      ).length;
      const onderaannemerCount = actieveWerknemers.filter((w: any) => w.rol === 'onderaannemer').length;

      const werkbonnenDezeWeek = werkbonnenList.filter(
        (wb: any) => wb.week_nummer === currentWeek && wb.jaar === now.getFullYear()
      );

      const werkbonnenWachtend = werkbonnenList.filter(
        (wb: any) => wb.status === 'concept' || !wb.handtekening_data
      );

      const totaalUren = werkbonnenDezeWeek.reduce((acc: number, wb: any) => {
        const wbUren = wb.uren?.reduce((sum: number, uren: any) => {
          return sum + (uren.maandag || 0) + (uren.dinsdag || 0) + (uren.woensdag || 0) +
            (uren.donderdag || 0) + (uren.vrijdag || 0) + (uren.zaterdag || 0) + (uren.zondag || 0);
        }, 0) || 0;
        return acc + wbUren;
      }, 0);

      setStats({
        totaalWerknemers: werknemerCount,
        totaalOnderaannemers: onderaannemerCount,
        totaalTeams: teamsList.length,
        totaalKlanten: klantenList.filter((k: any) => k.actief !== false).length,
        totaalWerven: wervenList.filter((w: any) => w.actief !== false).length,
        werkbonnenDezeWeek: werkbonnenDezeWeek.length,
        werkbonnenWachtend: werkbonnenWachtend.length,
        totaalUrenDezeWeek: totaalUren,
        planningDezeWeek: planningList.length,
        planningAfgerond: planningList.filter((p: any) => p.status === 'afgerond').length,
      });

      // Sort by created_at descending and take last 5
      const sorted = werkbonnenList
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 5);
      setRecentWerkbonnen(sorted);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (Platform.OS !== 'web') return null;

  if (user?.rol !== 'beheerder' && user?.rol !== 'admin') {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
          <Text style={styles.noAccessSub}>Dit portaal is alleen voor beheerders</Text>
        </View>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept': return '#ffc107';
      case 'ondertekend': return '#28a745';
      case 'verzonden': return '#F5A623';
      default: return '#6c757d';
    }
  };

  const quickActions = [
    { icon: 'person-add', label: 'Nieuwe werknemer', route: '/admin/werknemers', color: '#3498db' },
    { icon: 'add-circle', label: 'Nieuwe klant', route: '/admin/klanten', color: '#1abc9c' },
    { icon: 'business', label: 'Nieuwe werf', route: '/admin/werven', color: '#e67e22' },
    { icon: 'document-text', label: 'Bekijk werkbonnen', route: '/admin/werkbonnen', color: '#F5A623' },
    { icon: 'bar-chart', label: 'Rapporten', route: '/admin/rapporten', color: '#9b59b6' },
    { icon: 'download', label: 'Export CSV', route: '/admin/rapporten', color: '#34495e' },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.greeting}>Welkom terug,</Text>
          <Text style={styles.pageTitle}>{user?.naam || 'Beheerder'}</Text>
        </View>
        <Text style={styles.dateText}>{new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginVertical: 40 }} />
      ) : (
        <>
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <TouchableOpacity style={[styles.statCard, styles.statCardLarge]} onPress={() => router.push('/admin/werknemers')}>
              <View style={[styles.statIcon, { backgroundColor: '#3498db15' }]}>
                <Ionicons name="people" size={28} color="#3498db" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalWerknemers || 0}</Text>
              <Text style={styles.statLabel}>Werknemers</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.statCard, styles.statCardLarge]} onPress={() => router.push('/admin/werknemers')}>
              <View style={[styles.statIcon, { backgroundColor: '#e67e2215' }]}>
                <Ionicons name="construct" size={28} color="#e67e22" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalOnderaannemers || 0}</Text>
              <Text style={styles.statLabel}>Onderaannemers</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.statCard, styles.statCardLarge]} onPress={() => router.push('/admin/teams')}>
              <View style={[styles.statIcon, { backgroundColor: '#9b59b615' }]}>
                <Ionicons name="git-branch" size={28} color="#9b59b6" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalTeams || 0}</Text>
              <Text style={styles.statLabel}>Teams</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.statCard, styles.statCardLarge]} onPress={() => router.push('/admin/klanten')}>
              <View style={[styles.statIcon, { backgroundColor: '#1abc9c15' }]}>
                <Ionicons name="briefcase" size={28} color="#1abc9c" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalKlanten || 0}</Text>
              <Text style={styles.statLabel}>Klanten</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.statCard, styles.statCardLarge]} onPress={() => router.push('/admin/werven')}>
              <View style={[styles.statIcon, { backgroundColor: '#F5A62315' }]}>
                <Ionicons name="business" size={28} color="#F5A623" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalWerven || 0}</Text>
              <Text style={styles.statLabel}>Werven</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.statCard, styles.statCardLarge]} onPress={() => router.push('/admin/planning')}>
              <View style={[styles.statIcon, { backgroundColor: '#28a74515' }]}>
                <Ionicons name="calendar" size={28} color="#28a745" />
              </View>
              <Text style={styles.statValue}>{stats?.planningDezeWeek || 0}</Text>
              <Text style={styles.statLabel}>Planning deze week</Text>
            </TouchableOpacity>
          </View>

          {/* Werkbonnen Stats */}
          <Text style={styles.sectionTitle}>Werkbonnen overzicht</Text>
          <View style={styles.werkbonStats}>
            <View style={[styles.werkbonStatCard, { borderLeftColor: '#F5A623' }]}>
              <Text style={styles.werkbonStatValue}>{stats?.werkbonnenDezeWeek || 0}</Text>
              <Text style={styles.werkbonStatLabel}>Deze week</Text>
            </View>
            <View style={[styles.werkbonStatCard, { borderLeftColor: '#ffc107' }]}>
              <Text style={styles.werkbonStatValue}>{stats?.werkbonnenWachtend || 0}</Text>
              <Text style={styles.werkbonStatLabel}>Wachtend op handtekening</Text>
            </View>
            <View style={[styles.werkbonStatCard, { borderLeftColor: '#28a745' }]}>
              <Text style={styles.werkbonStatValue}>{stats?.totaalUrenDezeWeek || 0}</Text>
              <Text style={styles.werkbonStatLabel}>Uren deze week</Text>
            </View>
          </View>

          {/* Recent Werkbonnen */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent aangemaakte werkbonnen</Text>
            <TouchableOpacity onPress={() => router.push('/admin/werkbonnen')}>
              <Text style={styles.viewAllLink}>Bekijk alle</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.recentList}>
            {recentWerkbonnen.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color="#E8E9ED" />
                <Text style={styles.emptyText}>Geen recente werkbonnen</Text>
              </View>
            ) : (
              recentWerkbonnen.map((wb) => (
                <TouchableOpacity
                  key={wb.id}
                  style={styles.recentCard}
                  onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}
                >
                  <View style={styles.recentCardLeft}>
                    <View style={styles.weekBadge}>
                      <Text style={styles.weekBadgeText}>W{wb.week_nummer}</Text>
                    </View>
                    <View>
                      <Text style={styles.recentKlant}>{wb.klant_naam}</Text>
                      <Text style={styles.recentWerf}>{wb.werf_naam}</Text>
                      <Text style={styles.recentMeta}>{wb.created_by_naam}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wb.status) }]}>
                    <Text style={styles.statusText}>{wb.status}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Snelle acties</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickActionCard}
                onPress={() => router.push(action.route as any)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}15` }]}>
                  <Ionicons name={action.icon as any} size={24} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
    padding: 24,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    color: '#6c757d',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  dateText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  statCardLarge: {
    flex: 1,
    minWidth: 180,
  },
  statIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  statLabel: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 16,
  },
  viewAllLink: {
    fontSize: 14,
    color: '#F5A623',
    fontWeight: '500',
  },
  werkbonStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  werkbonStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  werkbonStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  werkbonStatLabel: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 4,
  },
  recentList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    marginBottom: 32,
    overflow: 'hidden',
  },
  recentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  recentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weekBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F5A62315',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5A623',
  },
  recentKlant: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  recentWerf: {
    fontSize: 13,
    color: '#6c757d',
  },
  recentMeta: {
    fontSize: 12,
    color: '#adb5bd',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 40,
  },
  quickActionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    minWidth: 140,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 13,
    color: '#1A1A2E',
    fontWeight: '500',
    textAlign: 'center',
  },
  noAccess: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noAccessText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1A2E',
    marginTop: 16,
  },
  noAccessSub: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
  },
});
