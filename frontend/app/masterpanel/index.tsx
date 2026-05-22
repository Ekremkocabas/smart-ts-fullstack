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

const SIGNYBON_GREEN = '#0F172A';
const SIGNYBON_GOLD = '#22C55E';

interface TopClient {
  company_id: string;
  bedrijfsnaam: string;
  werkbon_count: number;
}

interface InactiveClient {
  company_id: string;
  bedrijfsnaam: string;
  last_login: string | null;
  status: string;
}

interface RecentTicket {
  ticket_id: string;
  naam: string;
  bedrijfsnaam: string;
  vraag: string;
  created_at: string;
  status: string;
}

interface MonthlyTrendPoint {
  month: string;
  label: string;
  new_companies: number;
  werkbonnen: number;
}

interface Stats {
  companies: { total: number; active: number; trial: number; expired: number; blocked: number };
  new_this_month: number;
  total_werkbonnen: number;
  total_users: number;
  revenue_monthly: number;
  revenue_prev_month: number;
  mrr_delta_pct: number;
  revenue_breakdown: { basic: number; pro: number };
  active_this_month: number;
  churn_this_month: number;
  trial_conversion_pct: number;
  trial_started_this_month: number;
  trial_converted_this_month: number;
  werkbonnen_this_month: number;
  open_tickets_total: number;
  top_clients: TopClient[];
  inactive_clients_14d: InactiveClient[];
  recent_tickets: RecentTicket[];
  monthly_trend: MonthlyTrendPoint[];
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

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return 'Nooit ingelogd';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 1) return 'Vandaag';
    if (days === 1) return '1 dag geleden';
    if (days < 30) return `${days} dagen geleden`;
    if (days < 365) return `${Math.floor(days / 30)} maand geleden`;
    return `${Math.floor(days / 365)} jaar geleden`;
  } catch {
    return iso;
  }
}

function TrendChip({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const up = value > 0;
  const flat = value === 0;
  const bg = flat ? '#e9ecef' : up ? '#d4edda' : '#f8d7da';
  const fg = flat ? '#495057' : up ? '#155724' : '#721c24';
  const icon = flat ? 'remove' : up ? 'arrow-up' : 'arrow-down';
  return (
    <View style={[trendChipStyles.chip, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={11} color={fg} />
      <Text style={[trendChipStyles.text, { color: fg }]}>
        {Math.abs(value).toFixed(1)}{suffix}
      </Text>
    </View>
  );
}

const trendChipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  text: { fontSize: 11, fontWeight: '700' },
});

// View-only bar chart — avoids adding react-native-svg as a native dep, so
// the existing APK build pipeline keeps working without a fresh prebuild.
function TrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  if (points.length === 0) return null;
  const maxNew = Math.max(1, ...points.map(p => p.new_companies));
  const maxBon = Math.max(1, ...points.map(p => p.werkbonnen));
  const H = 180;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 12, paddingHorizontal: 8 }}>
        {points.map(p => (
          <View key={p.month} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H - 28, gap: 6, width: '100%', justifyContent: 'center' }}>
              <View
                style={{
                  flex: 1,
                  maxWidth: 22,
                  height: `${Math.max(2, (100 * p.new_companies) / maxNew)}%`,
                  backgroundColor: SIGNYBON_GREEN,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
              />
              <View
                style={{
                  flex: 1,
                  maxWidth: 22,
                  height: `${Math.max(2, (100 * p.werkbonnen) / maxBon)}%`,
                  backgroundColor: SIGNYBON_GOLD,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
              />
            </View>
            <Text style={{ fontSize: 11, color: '#6c757d', fontWeight: '600' }}>{p.label}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Text style={{ fontSize: 10, color: SIGNYBON_GREEN, fontWeight: '700' }}>{p.new_companies}</Text>
              <Text style={{ fontSize: 10, color: '#bd8a13', fontWeight: '700' }}>{p.werkbonnen}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 10, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, backgroundColor: SIGNYBON_GREEN, borderRadius: 3 }} />
          <Text style={{ fontSize: 12, color: '#495057' }}>Nieuwe bedrijven</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, backgroundColor: SIGNYBON_GOLD, borderRadius: 3 }} />
          <Text style={{ fontSize: 12, color: '#495057' }}>Werkbonnen</Text>
        </View>
      </View>
    </View>
  );
}

interface KpiCardConfig {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  accent?: string;
}

function KpiCard({ cfg, size = 'big' }: { cfg: KpiCardConfig; size?: 'big' | 'small' }) {
  return (
    <View style={[styles.card, size === 'big' ? styles.cardBig : styles.cardSmall, cfg.accent ? { borderTopColor: cfg.accent } : null]}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}>
          <Ionicons name={cfg.icon} size={size === 'big' ? 24 : 20} color={SIGNYBON_GREEN} />
        </View>
        {typeof cfg.trend === 'number' && <TrendChip value={cfg.trend} />}
      </View>
      <Text style={[styles.cardValue, size === 'small' && { fontSize: 22 }]}>{cfg.value}</Text>
      <Text style={styles.cardLabel}>{cfg.label}</Text>
      {cfg.sub ? <Text style={styles.cardSub}>{cfg.sub}</Text> : null}
    </View>
  );
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

  const topKpis: KpiCardConfig[] = [
    {
      icon: 'cash-outline',
      label: 'MRR',
      value: formatEUR(stats.revenue_monthly),
      sub: `${stats.revenue_breakdown.basic} basic · ${stats.revenue_breakdown.pro} pro`,
      trend: stats.mrr_delta_pct,
      accent: SIGNYBON_GOLD,
    },
    {
      icon: 'pulse-outline',
      label: 'Aktief deze maand',
      value: String(stats.active_this_month),
      sub: `${stats.companies.total} totaal · ${Math.round(100 * stats.active_this_month / Math.max(1, stats.companies.total))}%`,
      accent: '#28a745',
    },
    {
      icon: 'sparkles-outline',
      label: 'Nieuwe inschrijvingen',
      value: String(stats.new_this_month),
      sub: `${stats.companies.trial} actieve trials`,
      accent: SIGNYBON_GREEN,
    },
    {
      icon: 'trending-down-outline',
      label: 'Churn deze maand',
      value: String(stats.churn_this_month),
      sub: `${stats.companies.blocked} blocked · ${stats.companies.expired} expired`,
      accent: '#dc3545',
    },
  ];

  const secondKpis: KpiCardConfig[] = [
    {
      icon: 'swap-horizontal-outline',
      label: 'Trial → ödeme dönüşüm',
      value: `${stats.trial_conversion_pct.toFixed(1)}%`,
      sub: `${stats.trial_converted_this_month}/${stats.trial_started_this_month} deze maand`,
    },
    {
      icon: 'document-text-outline',
      label: 'Werkbonnen deze maand',
      value: stats.werkbonnen_this_month.toLocaleString('nl-BE'),
      sub: `${stats.total_werkbonnen.toLocaleString('nl-BE')} totaal · ${stats.total_users} users`,
    },
    {
      icon: 'help-buoy-outline',
      label: 'Open support tickets',
      value: String(stats.open_tickets_total),
      sub: 'Klik Support voor details',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.contentInner}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>Platform overzicht — bijgewerkt: nu</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={load}>
            <Ionicons name="refresh-outline" size={16} color={SIGNYBON_GREEN} />
            <Text style={styles.refreshText}>Vernieuwen</Text>
          </TouchableOpacity>
        </View>

        {/* Top KPI row */}
        <View style={styles.bigKpiGrid}>
          {topKpis.map(cfg => <KpiCard key={cfg.label} cfg={cfg} size="big" />)}
        </View>

        {/* Second KPI row */}
        <View style={styles.smallKpiGrid}>
          {secondKpis.map(cfg => <KpiCard key={cfg.label} cfg={cfg} size="small" />)}
        </View>

        {/* Trend chart */}
        <View style={styles.sectionFull}>
          <Text style={styles.sectionTitle}>Trend laatste 6 maanden</Text>
          <TrendChart points={stats.monthly_trend} />
        </View>

        {/* Two-column lists row 1 */}
        <View style={styles.twoCol}>
          <View style={styles.sectionHalf}>
            <Text style={styles.sectionTitle}>Top 5 actiefste klanten</Text>
            {stats.top_clients.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Nog geen werkbon data.</Text>
              </View>
            ) : (
              <View style={styles.tableShell}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 3 }]}>Bedrijf</Text>
                  <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Werkbonnen</Text>
                </View>
                {stats.top_clients.map(c => (
                  <TouchableOpacity
                    key={c.company_id}
                    style={styles.tableRow}
                    onPress={() => router.push(`/masterpanel/klant-detail?company_id=${c.company_id}` as any)}
                  >
                    <Text style={[styles.td, { flex: 3, fontWeight: '600', color: SIGNYBON_GREEN }]} numberOfLines={1}>
                      {c.bedrijfsnaam || '—'}
                    </Text>
                    <Text style={[styles.td, { width: 90, textAlign: 'right', fontWeight: '700' }]}>
                      {c.werkbon_count.toLocaleString('nl-BE')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionHalf}>
            <Text style={styles.sectionTitle}>Trials verlopen binnenkort</Text>
            {stats.expiring_trials.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#28a745" />
                <Text style={styles.emptyText}>Geen aflopende trials.</Text>
              </View>
            ) : (
              <View style={styles.tableShell}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 2 }]}>Bedrijf</Text>
                  <Text style={[styles.th, { flex: 2 }]}>E-mail</Text>
                  <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>Dgn</Text>
                </View>
                {stats.expiring_trials.slice(0, 5).map(row => (
                  <TouchableOpacity
                    key={row.company_id}
                    style={styles.tableRow}
                    onPress={() => router.push(`/masterpanel/klant-detail?company_id=${row.company_id}` as any)}
                  >
                    <Text style={[styles.td, { flex: 2, fontWeight: '600', color: SIGNYBON_GREEN }]} numberOfLines={1}>
                      {row.bedrijfsnaam || '—'}
                    </Text>
                    <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{row.email}</Text>
                    <View style={{ width: 70, alignItems: 'flex-end' }}>
                      <View style={[
                        styles.daysBadge,
                        row.days_remaining <= 1 && { backgroundColor: '#f8d7da' },
                        row.days_remaining > 1 && row.days_remaining <= 3 && { backgroundColor: '#fff3cd' },
                      ]}>
                        <Text style={[
                          styles.daysText,
                          row.days_remaining <= 1 && { color: '#721c24' },
                          row.days_remaining > 1 && row.days_remaining <= 3 && { color: '#856404' },
                        ]}>{row.days_remaining}d</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Two-column lists row 2 */}
        <View style={styles.twoCol}>
          <View style={styles.sectionHalf}>
            <Text style={styles.sectionTitle}>Inactieve klanten (14+ dagen)</Text>
            {stats.inactive_clients_14d.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#28a745" />
                <Text style={styles.emptyText}>Iedereen is recent actief geweest.</Text>
              </View>
            ) : (
              <View style={styles.tableShell}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 3 }]}>Bedrijf</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Laatste login</Text>
                </View>
                {stats.inactive_clients_14d.map(c => (
                  <TouchableOpacity
                    key={c.company_id}
                    style={styles.tableRow}
                    onPress={() => router.push(`/masterpanel/klant-detail?company_id=${c.company_id}` as any)}
                  >
                    <Text style={[styles.td, { flex: 3, fontWeight: '600', color: SIGNYBON_GREEN }]} numberOfLines={1}>
                      {c.bedrijfsnaam || '—'}
                    </Text>
                    <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{relativeDate(c.last_login)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionHalf}>
            <Text style={styles.sectionTitle}>Recente open tickets</Text>
            {stats.recent_tickets.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#28a745" />
                <Text style={styles.emptyText}>Geen open tickets.</Text>
              </View>
            ) : (
              <View style={styles.tableShell}>
                {stats.recent_tickets.map(t => (
                  <TouchableOpacity
                    key={t.ticket_id}
                    style={[styles.tableRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}
                    onPress={() => router.push('/masterpanel/tickets' as any)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                      <Text style={{ fontSize: 13, color: SIGNYBON_GREEN, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                        {t.bedrijfsnaam || t.naam || '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#6c757d' }}>{formatDate(t.created_at)}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#495057' }} numberOfLines={2}>{t.vraag || '—'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 24 },
  contentInner: { maxWidth: 1400, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  errorText: { color: '#6c757d', fontSize: 14 },
  retryBtn: { backgroundColor: SIGNYBON_GREEN, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  refreshText: { fontSize: 13, fontWeight: '600', color: SIGNYBON_GREEN },

  bigKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 },
  smallKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 18 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    borderTopWidth: 3,
    borderTopColor: SIGNYBON_GOLD,
    flexGrow: 1,
  },
  cardBig: { flexBasis: 250, minWidth: 220 },
  cardSmall: { flexBasis: 230, minWidth: 200, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#0F172A15',
    alignItems: 'center', justifyContent: 'center',
  },
  cardValue: { fontSize: 28, fontWeight: '800', color: SIGNYBON_GREEN },
  cardLabel: { fontSize: 13, color: '#0F172A', fontWeight: '600', marginTop: 4 },
  cardSub: { fontSize: 11, color: '#6c757d', marginTop: 4 },

  sectionFull: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: SIGNYBON_GREEN, marginBottom: 14 },

  twoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 14,
  },
  sectionHalf: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    flexGrow: 1,
    flexBasis: 380,
  },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyText: { color: '#6c757d', fontSize: 13 },

  tableShell: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  th: { fontSize: 11, fontWeight: '700', color: '#495057', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
    alignItems: 'center',
  },
  td: { fontSize: 13, color: '#495057' },

  daysBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#d1ecf1',
  },
  daysText: { fontSize: 12, fontWeight: '700', color: '#0c5460' },
});
