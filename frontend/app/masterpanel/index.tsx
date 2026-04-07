import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiClient } from '../../context/AuthContext';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';

interface Stats {
  companies: { total: number; active: number; trial: number; expired: number; blocked: number };
  new_this_month: number;
  total_werkbonnen: number;
  total_users: number;
  revenue_monthly: number;
  revenue_breakdown: { basic: number; pro: number };
  expiring_trials: Array<{
    company_id: string;
    bedrijfsnaam: string;
    email: string;
    trial_end_date: string;
    days_remaining: number;
  }>;
}

function formatEUR(n: number) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function MasterDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/master/dashboard-stats');
      setStats(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kon statistieken niet laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SIGNYBON_GREEN} />
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={styles.center}>
        <Ionicons name="warning-outline" size={32} color="#dc3545" />
        <Text style={styles.errorText}>{error || 'Geen data'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Opnieuw proberen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cards = [
    {
      icon: 'business' as const,
      label: 'Totaal bedrijven',
      value: String(stats.companies.total),
      sub: `${stats.companies.active} actief · ${stats.companies.trial} trial · ${stats.companies.expired} expired · ${stats.companies.blocked} blocked`,
    },
    {
      icon: 'time' as const,
      label: 'Actieve trials',
      value: String(stats.companies.trial),
      sub: `${stats.new_this_month} nieuw deze maand`,
    },
    {
      icon: 'document-text' as const,
      label: 'Totaal werkbonnen',
      value: stats.total_werkbonnen.toLocaleString('nl-BE'),
      sub: `${stats.total_users} gebruikers`,
    },
    {
      icon: 'cash' as const,
      label: 'Maandelijkse omzet',
      value: formatEUR(stats.revenue_monthly),
      sub: `${stats.revenue_breakdown.basic} basic · ${stats.revenue_breakdown.pro} pro`,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>Platform overzicht</Text>
      </View>

      <View style={styles.grid}>
        {cards.map((card) => (
          <View key={card.label} style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name={card.icon} size={26} color={SIGNYBON_GREEN} />
            </View>
            <Text style={styles.cardValue}>{card.value}</Text>
            <Text style={styles.cardLabel}>{card.label}</Text>
            <Text style={styles.cardSub}>{card.sub}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trial verloopt binnenkort</Text>
        {stats.expiring_trials.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#28a745" />
            <Text style={styles.emptyText}>Geen aflopende trials in de komende 10 dagen.</Text>
          </View>
        ) : (
          <View style={styles.tableShell}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Bedrijf</Text>
              <Text style={[styles.th, { flex: 2 }]}>E-mail</Text>
              <Text style={[styles.th, { flex: 1 }]}>Verloopt</Text>
              <Text style={[styles.th, { flex: 1 }]}>Resterend</Text>
            </View>
            {stats.expiring_trials.map((row) => (
              <TouchableOpacity
                key={row.company_id}
                style={styles.tableRow}
                onPress={() => router.push(`/masterpanel/klant-detail?company_id=${row.company_id}` as any)}
              >
                <Text style={[styles.td, { flex: 2, fontWeight: '600', color: SIGNYBON_GREEN }]} numberOfLines={1}>
                  {row.bedrijfsnaam || '—'}
                </Text>
                <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{row.email}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{formatDate(row.trial_end_date)}</Text>
                <View style={[{ flex: 1 }]}>
                  <View
                    style={[
                      styles.daysBadge,
                      row.days_remaining <= 1 && { backgroundColor: '#f8d7da' },
                      row.days_remaining > 1 && row.days_remaining <= 3 && { backgroundColor: '#fff3cd' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.daysText,
                        row.days_remaining <= 1 && { color: '#721c24' },
                        row.days_remaining > 1 && row.days_remaining <= 3 && { color: '#856404' },
                      ]}
                    >
                      {row.days_remaining}d
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  errorText: { color: '#6c757d', fontSize: 14 },
  retryBtn: { backgroundColor: SIGNYBON_GREEN, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  header: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 28 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 22,
    minWidth: 240,
    flexGrow: 1,
    flexBasis: 240,
    borderTopWidth: 3,
    borderTopColor: SIGNYBON_GOLD,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1B433215',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardValue: { fontSize: 30, fontWeight: '800', color: SIGNYBON_GREEN },
  cardLabel: { fontSize: 14, color: '#1B4332', fontWeight: '600', marginTop: 4 },
  cardSub: { fontSize: 12, color: '#6c757d', marginTop: 6 },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: SIGNYBON_GREEN, marginBottom: 14 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyText: { color: '#6c757d', fontSize: 13 },
  tableShell: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  th: { fontSize: 12, fontWeight: '700', color: '#495057', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
    alignItems: 'center',
  },
  td: { fontSize: 13, color: '#495057' },
  daysBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#d1ecf1',
  },
  daysText: { fontSize: 12, fontWeight: '700', color: '#0c5460' },
});
