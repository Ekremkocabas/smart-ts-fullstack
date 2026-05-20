import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiClient } from '../../context/AuthContext';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';

interface KlantRow {
  company_id: string;
  bedrijfsnaam: string;
  contactpersoon: string;
  email: string;
  telefoon: string;
  btw_nummer: string;
  plan: string;
  status: string;
  created_at: string | null;
  trial_end_date: string | null;
  days_remaining: number | null;
  last_login_at: string | null;
  werkbonnen: number;
  werkbonnen_this_month: number;
  gebruikers: number;
  active_werknemers: number;
  prijsmodel: string | null;
  uurtarief: number | null;
  dagtarief: number | null;
  adres: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  trial: { bg: '#fff3cd', fg: '#856404', label: 'Trial' },
  active: { bg: '#d4edda', fg: '#155724', label: 'Actief' },
  active_basic: { bg: '#d1ecf1', fg: '#0c5460', label: 'Basic' },
  active_pro: { bg: '#fff3cd', fg: '#856404', label: 'Pro' },
  expired: { bg: '#f8d7da', fg: '#721c24', label: 'Verlopen' },
  blocked: { bg: '#e2e3e5', fg: '#383d41', label: 'Geblokkeerd' },
};

const PLAN_COLORS: Record<string, { bg: string; fg: string }> = {
  basic: { bg: '#d1ecf1', fg: '#0c5460' },
  pro: { bg: '#fff3cd', fg: '#856404' },
  free: { bg: '#e9ecef', fg: '#495057' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatTarief(pm: string | null, uur: number | null, dag: number | null): string {
  if (pm === 'uurtarief' && uur) return `€${uur.toFixed(0)}/u`;
  if (pm === 'dagvergoeding' && dag) return `€${dag.toFixed(0)}/dag`;
  if (pm === 'vaste_prijs') return 'Vast';
  return '—';
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_COLORS[status] || { bg: '#e9ecef', fg: '#495057', label: status };
  return (
    <View style={[badgeStyles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[badgeStyles.text, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const cfg = PLAN_COLORS[plan?.toLowerCase()] || { bg: '#e9ecef', fg: '#495057' };
  return (
    <View style={[badgeStyles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[badgeStyles.text, { color: cfg.fg }]}>{plan || '—'}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});

// Column widths chosen so a 14-column table comfortably fits at 1800px wide.
const COLUMNS: Array<{ key: string; label: string; width: number; align?: 'left' | 'right' }> = [
  { key: 'bedrijf', label: 'Bedrijf', width: 200 },
  { key: 'contact', label: 'Contactpersoon', width: 140 },
  { key: 'telefoon', label: 'Telefoon', width: 130 },
  { key: 'email', label: 'E-mail', width: 200 },
  { key: 'btw', label: 'BTW', width: 130 },
  { key: 'plan', label: 'Plan', width: 80 },
  { key: 'status', label: 'Status', width: 100 },
  { key: 'tarief', label: 'Tarief', width: 90 },
  { key: 'reg', label: 'Geregistreerd', width: 120 },
  { key: 'login', label: 'Laatste login', width: 120 },
  { key: 'trial', label: 'Trial einde', width: 110 },
  { key: 'bonnen', label: 'Werkbonnen (maand/totaal)', width: 140, align: 'right' },
  { key: 'werkn', label: 'Werknemers', width: 90, align: 'right' },
  { key: 'actie', label: '', width: 100 },
];

const TABLE_MIN_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0) + 36;

export default function MasterKlanten() {
  const [klanten, setKlanten] = useState<KlantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (planFilter !== 'all') params.plan = planFilter;
      if (search.trim()) params.search = search.trim();
      const res = await apiClient.get('/api/master/klanten', { params });
      setKlanten(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kon bedrijven niet laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, planFilter]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const total = klanten.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Bedrijven</Text>
        <Text style={styles.subtitle}>{total} {total === 1 ? 'bedrijf' : 'bedrijven'}</Text>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#6c757d" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Zoek op bedrijfsnaam, e-mail of BTW…"
            placeholderTextColor="#adb5bd"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Status</Text>
          <View style={styles.chips}>
            {(['all', 'trial', 'active', 'expired', 'blocked'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, statusFilter === s && styles.chipActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                  {s === 'all' ? 'Alle' : STATUS_COLORS[s]?.label || s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Plan</Text>
          <View style={styles.chips}>
            {(['all', 'basic', 'pro', 'free'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, planFilter === p && styles.chipActive]}
                onPress={() => setPlanFilter(p)}
              >
                <Text style={[styles.chipText, planFilter === p && styles.chipTextActive]}>
                  {p === 'all' ? 'Alle' : p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={SIGNYBON_GREEN} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={32} color="#dc3545" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : klanten.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={36} color="#adb5bd" />
          <Text style={styles.emptyText}>Geen bedrijven gevonden.</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={[styles.tableShell, { minWidth: TABLE_MIN_WIDTH }]}>
            <View style={styles.tableHeader}>
              {COLUMNS.map(c => (
                <Text
                  key={c.key}
                  style={[
                    styles.th,
                    { width: c.width, textAlign: c.align || 'left' },
                  ]}
                  numberOfLines={2}
                >
                  {c.label}
                </Text>
              ))}
            </View>
            {klanten.map((row) => (
              <View key={row.company_id} style={styles.tableRow}>
                <Text style={[styles.td, { width: 200, fontWeight: '700', color: SIGNYBON_GREEN, paddingRight: 8 }]} numberOfLines={1}>
                  {row.bedrijfsnaam || '—'}
                </Text>
                <Text style={[styles.td, { width: 140, paddingRight: 8 }]} numberOfLines={1}>{row.contactpersoon || '—'}</Text>
                <Text style={[styles.td, { width: 130, paddingRight: 8 }]} numberOfLines={1}>{row.telefoon || '—'}</Text>
                <Text style={[styles.td, { width: 200, paddingRight: 8 }]} numberOfLines={1}>{row.email || '—'}</Text>
                <Text style={[styles.td, { width: 130, paddingRight: 8 }]} numberOfLines={1}>{row.btw_nummer || '—'}</Text>
                <View style={{ width: 80, paddingRight: 8 }}><PlanBadge plan={row.plan} /></View>
                <View style={{ width: 100, paddingRight: 8 }}><StatusBadge status={row.status} /></View>
                <Text style={[styles.td, { width: 90, paddingRight: 8 }]} numberOfLines={1}>{formatTarief(row.prijsmodel, row.uurtarief, row.dagtarief)}</Text>
                <Text style={[styles.td, { width: 120, paddingRight: 8 }]}>{formatDate(row.created_at)}</Text>
                <Text style={[styles.td, { width: 120, paddingRight: 8 }]}>{formatDate(row.last_login_at)}</Text>
                <Text style={[styles.td, { width: 110, paddingRight: 8 }]}>{formatDate(row.trial_end_date)}</Text>
                <Text style={[styles.td, { width: 140, paddingRight: 8, textAlign: 'right', fontWeight: '600' }]}>
                  <Text style={{ color: SIGNYBON_GOLD, fontWeight: '700' }}>{row.werkbonnen_this_month}</Text>
                  <Text style={{ color: '#6c757d' }}> / {row.werkbonnen}</Text>
                </Text>
                <Text style={[styles.td, { width: 90, paddingRight: 8, textAlign: 'right', fontWeight: '600' }]}>
                  <Text style={{ color: '#28a745' }}>{row.active_werknemers}</Text>
                  <Text style={{ color: '#6c757d' }}>/{row.gebruikers}</Text>
                </Text>
                <View style={{ width: 100 }}>
                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() => router.push(`/masterpanel/klant-detail?company_id=${row.company_id}` as any)}
                  >
                    <Ionicons name="eye-outline" size={14} color="#fff" />
                    <Text style={styles.viewBtnText}>Bekijk</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 24 },
  header: { marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  toolbar: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 10 : 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1B4332', outlineWidth: 0 as any },
  filterGroup: { gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#6c757d', textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f8f9fa',
  },
  chipActive: { backgroundColor: SIGNYBON_GREEN, borderColor: SIGNYBON_GREEN },
  chipText: { fontSize: 12, color: '#495057', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  tableShell: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  th: { fontSize: 11, fontWeight: '700', color: '#495057', textTransform: 'uppercase', paddingRight: 8 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  td: { fontSize: 13, color: '#495057' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SIGNYBON_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  viewBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  errorText: { color: '#6c757d', fontSize: 14 },
  emptyText: { color: '#6c757d', fontSize: 14 },
});
