import React, { useEffect, useState, useRef } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import ErrorBoundary from '../../components/ErrorBoundary';

interface DashboardStats {
  totaalWerknemers: number;
  totaalOnderaannemers: number;
  totaalTeams: number;
  totaalKlanten: number;
  totaalWerven: number;
  werkbonnenDezeWeek: number;
  werkbonnenWachtend: number;
  totaalUrenDezeWeek: number;
  totaalUrenDezeMaand: number;
  werkbonnenDezeMaandAantal: number;
  totaalWerkbonnen: number;
  planningDezeWeek: number;
  planningAfgerond: number;
}

export default function AdminDashboard() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { theme } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRetryCount = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web' && !authLoading && token && user) {
      const isAdmin = ['admin', 'master_admin', 'manager', 'beheerder'].includes(user?.rol || '');
      if (isAdmin) {
        const timer = setTimeout(() => fetchData(), 100);
        return () => clearTimeout(timer);
      }
    }
  }, [user, token, authLoading]);

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (fetchRetryCount.current >= 2) {
      setError('Maximale pogingen bereikt. Herlaad de pagina.');
      setLoading(false);
      return;
    }
    fetchRetryCount.current += 1;
    try {
      setLoading(true);
      setError(null);

      const [statsRes, werknemersRes, teamsRes, klantenRes, wervenRes] = await Promise.all([
        apiClient.get('/api/dashboard/stats'),
        apiClient.get('/api/auth/users'),
        apiClient.get('/api/teams'),
        apiClient.get('/api/klanten'),
        apiClient.get('/api/werven'),
      ]);

      const ds = statsRes.data;
      const weekNr = typeof ds?.week_nummer === 'number' ? ds.week_nummer : 1;
      const jaarCal = typeof ds?.jaar === 'number' ? ds.jaar : new Date().getFullYear();
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const [urenWeekOk, urenMaandOk, totaalCountRes] = await Promise.all([
        apiClient.get(`/api/dashboard/uren-week?week_nummer=${weekNr}&jaar=${jaarCal}`),
        apiClient.get(`/api/dashboard/uren-maand?jaar=${currentYear}&maand=${currentMonth}`),
        apiClient.get('/api/werkbonnen/filter-count').catch(() => ({ data: { count: 0 } })),
      ]);

      const werknemers = werknemersRes.data;
      const teams = teamsRes.data;
      const klanten = klantenRes.data;
      const werven = wervenRes.data;
      const werknemersList = Array.isArray(werknemers) ? werknemers : [];
      const teamsList = Array.isArray(teams) ? teams : [];
      const klantenList = Array.isArray(klanten) ? klanten : [];
      const wervenList = Array.isArray(werven) ? werven : [];

      const actieveWerknemers = werknemersList.filter((w: any) => w.actief !== false);
      const werknemerCount = actieveWerknemers.filter(
        (w: any) => !['beheerder', 'admin', 'master_admin', 'onderaannemer'].includes(w.rol)
      ).length;
      const onderaannemerCount = actieveWerknemers.filter((w: any) => w.rol === 'onderaannemer').length;

      setStats({
        totaalWerknemers: werknemerCount,
        totaalOnderaannemers: onderaannemerCount,
        totaalTeams: teamsList.length,
        totaalKlanten: klantenList.filter((k: any) => k.actief !== false).length,
        totaalWerven: wervenList.filter((w: any) => w.actief !== false).length,
        werkbonnenDezeWeek: ds?.werkbonnen_deze_week ?? 0,
        werkbonnenWachtend: ds?.werkbonnen_concept ?? 0,
        totaalUrenDezeWeek: urenWeekOk.data?.totaal_uren ?? 0,
        totaalUrenDezeMaand: urenMaandOk.data?.totaal_uren ?? 0,
        werkbonnenDezeMaandAantal: urenMaandOk.data?.werkbonnen_aantal ?? 0,
        totaalWerkbonnen: typeof totaalCountRes.data?.count === 'number' ? totaalCountRes.data.count : 0,
        planningDezeWeek: ds?.planning_deze_week ?? 0,
        planningAfgerond: ds?.planning_afgerond ?? 0,
      });
      fetchRetryCount.current = 0;
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Kon gegevens niet laden. Controleer de verbinding en probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  if (Platform.OS !== 'web') return null;

  if (!['beheerder', 'admin', 'master_admin', 'manager'].includes(user?.rol || '')) {
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

  const quickActions = [
    { icon: 'person-add', label: 'Nieuwe werknemer', route: '/admin/werknemers', color: '#3498db' },
    { icon: 'add-circle', label: 'Nieuwe klant', route: '/admin/klanten', color: '#1abc9c' },
    { icon: 'business', label: 'Nieuwe werf', route: '/admin/werven', color: '#e67e22' },
    { icon: 'document-text', label: 'Bekijk werkbonnen', route: '/admin/werkbonnen', color: theme.primaryColor || '#D4A017' },
    { icon: 'bar-chart', label: 'Rapporten', route: '/admin/rapporten', color: '#9b59b6' },
    { icon: 'archive', label: 'Download werkbonnen', route: '/admin/werkbonnen/volledig', color: '#0056b3' },
  ];

  return (
    <ErrorBoundary>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.greeting}>Welkom terug,</Text>
          <Text style={styles.pageTitle}>{theme?.bedrijfsnaam || 'Signybon'}</Text>
        </View>
        <Text style={styles.dateText}>
          {new Date().toLocaleDateString('nl-BE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.primaryColor} style={{ marginVertical: 40 }} />
      ) : error ? (
        <View
          style={{
            backgroundColor: '#fff3cd',
            borderRadius: 12,
            padding: 20,
            margin: 8,
            borderWidth: 1,
            borderColor: '#ffc107',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Ionicons name="warning-outline" size={24} color="#e67e22" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1B4332' }}>Fout bij laden</Text>
            <Text style={{ fontSize: 13, color: '#6c757d', marginTop: 4 }}>{error}</Text>
          </View>
          <TouchableOpacity
            onPress={fetchData}
            style={{ backgroundColor: theme.primaryColor, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Opnieuw</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {stats &&
            stats.totaalKlanten === 0 &&
            stats.totaalWerknemers === 0 &&
            stats.totaalWerven === 0 && (
              <View style={wizardStyles.wrap}>
                <Text style={wizardStyles.title}>Welkom bij Signybon!</Text>
                <Text style={wizardStyles.subtitle}>
                  Volg deze stappen om aan de slag te gaan:
                </Text>
                {[
                  { n: 1, label: 'Bedrijfsgegevens aanvullen', route: '/admin/instellingen' },
                  { n: 2, label: 'Uw eerste klant aanmaken', route: '/admin/klanten' },
                  { n: 3, label: 'Werknemers toevoegen', route: '/admin/werknemers' },
                  { n: 4, label: 'Werven aanmaken', route: '/admin/werven' },
                  { n: 5, label: 'Planning maken', route: '/admin/planning' },
                  { n: 6, label: 'Eerste werkbon', route: '/admin/werkbonnen' },
                ].map((step) => (
                  <TouchableOpacity
                    key={step.n}
                    style={wizardStyles.step}
                    onPress={() => router.push(step.route as any)}
                  >
                    <View style={wizardStyles.badge}>
                      <Text style={wizardStyles.badgeText}>{step.n}</Text>
                    </View>
                    <Text style={wizardStyles.stepLabel}>Stap {step.n}: {step.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#1B4332" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          <View style={styles.statsGrid}>
            <TouchableOpacity
              style={[styles.statCard, styles.statCardLarge]}
              onPress={() => router.push('/admin/werknemers')}
            >
              <View style={[styles.statIcon, { backgroundColor: '#3498db15' }]}>
                <Ionicons name="people" size={28} color="#3498db" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalWerknemers || 0}</Text>
              <Text style={styles.statLabel}>Werknemers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, styles.statCardLarge]}
              onPress={() => router.push('/admin/werknemers')}
            >
              <View style={[styles.statIcon, { backgroundColor: '#e67e2215' }]}>
                <Ionicons name="construct" size={28} color="#e67e22" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalOnderaannemers || 0}</Text>
              <Text style={styles.statLabel}>Onderaannemers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, styles.statCardLarge]}
              onPress={() => router.push('/admin/teams')}
            >
              <View style={[styles.statIcon, { backgroundColor: '#9b59b615' }]}>
                <Ionicons name="git-branch" size={28} color="#9b59b6" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalTeams || 0}</Text>
              <Text style={styles.statLabel}>Teams</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, styles.statCardLarge]}
              onPress={() => router.push('/admin/klanten')}
            >
              <View style={[styles.statIcon, { backgroundColor: '#1abc9c15' }]}>
                <Ionicons name="briefcase" size={28} color="#1abc9c" />
              </View>
              <Text style={styles.statValue}>{stats?.totaalKlanten || 0}</Text>
              <Text style={styles.statLabel}>Klanten</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, styles.statCardLarge]}
              onPress={() => router.push('/admin/werven')}
            >
              <View style={[styles.statIcon, { backgroundColor: (theme.primaryColor || '#D4A017') + '20' }]}>
                <Ionicons name="business" size={28} color={theme.primaryColor} />
              </View>
              <Text style={styles.statValue}>{stats?.totaalWerven || 0}</Text>
              <Text style={styles.statLabel}>Werven</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, styles.statCardLarge]}
              onPress={() => router.push('/admin/planning')}
            >
              <View style={[styles.statIcon, { backgroundColor: '#28a74515' }]}>
                <Ionicons name="calendar" size={28} color="#28a745" />
              </View>
              <Text style={styles.statValue}>{stats?.planningDezeWeek || 0}</Text>
              <Text style={styles.statLabel}>Planning deze week</Text>
              {typeof stats?.planningAfgerond === 'number' && stats.planningAfgerond > 0 && (
                <Text style={styles.statHint}>{stats.planningAfgerond} afgerond</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Werkbonnen overzicht</Text>
            <TouchableOpacity onPress={() => router.push('/admin/werkbonnen' as any)} style={[styles.bekijkAlleBtn, { borderColor: (theme.primaryColor || '#D4A017') + '40' }]}>
              <Text style={[styles.bekijkAlleText, { color: theme.primaryColor }]}>Bekijk alle werkbonnen</Text>
              <Ionicons name="arrow-forward" size={16} color={theme.primaryColor} />
            </TouchableOpacity>
          </View>

          <View style={styles.werkbonStats}>
            <TouchableOpacity
              style={[styles.werkbonStatCard, { borderLeftColor: theme.primaryColor }]}
              onPress={() => router.push('/admin/werkbonnen/week' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.werkbonStatValue}>{stats?.werkbonnenDezeWeek ?? 0}</Text>
              <Text style={styles.werkbonStatLabel}>Werkbonnen deze week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.werkbonStatCard, { borderLeftColor: '#e67e22' }]}
              onPress={() => router.push('/admin/werkbonnen/month' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.werkbonStatValue}>{stats?.werkbonnenDezeMaandAantal ?? 0}</Text>
              <Text style={styles.werkbonStatLabel}>Werkbonnen deze maand</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.werkbonStatCard, { borderLeftColor: '#9b59b6' }]}
              onPress={() => router.push('/admin/werkbonnen' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.werkbonStatValue}>{stats?.totaalWerkbonnen ?? 0}</Text>
              <Text style={styles.werkbonStatLabel}>Totaal werkbonnen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.werkbonStatCard, { borderLeftColor: '#3498db' }]}
              onPress={() => router.push('/admin/werkbonnen/week' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.werkbonStatValue}>{stats?.totaalUrenDezeWeek ?? 0}</Text>
              <Text style={styles.werkbonStatLabel}>Uren deze week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.werkbonStatCard, { borderLeftColor: '#28a745' }]}
              onPress={() => router.push('/admin/werkbonnen/month' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.werkbonStatValue}>{stats?.totaalUrenDezeMaand ?? 0}</Text>
              <Text style={styles.werkbonStatLabel}>Uren deze maand</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Snelle acties</Text>
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
    </ErrorBoundary>
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
    color: '#1B4332',
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
    marginBottom: 28,
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
    color: '#1B4332',
  },
  statLabel: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  statHint: {
    fontSize: 12,
    color: '#28a745',
    marginTop: 6,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1B4332',
    marginBottom: 0,
  },
  bekijkAlleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D4A01740',
  },
  bekijkAlleText: {
    fontSize: 14,
    color: '#D4A017',
    fontWeight: '600',
  },
  werkbonStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  werkbonStatCard: {
    flex: 1,
    minWidth: 160,
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
    color: '#1B4332',
  },
  werkbonStatLabel: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 4,
  },
  werkbonStatSub: {
    fontSize: 12,
    color: '#adb5bd',
    marginTop: 8,
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
    color: '#1B4332',
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
    color: '#1B4332',
    marginTop: 16,
  },
  noAccessSub: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
  },
});

const wizardStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    margin: 8,
    borderWidth: 1,
    borderColor: '#D4A017',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B4332',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 18,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginBottom: 10,
    gap: 14,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D4A017',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#1B4332',
    fontWeight: '800',
    fontSize: 14,
  },
  stepLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1B4332',
  },
});
