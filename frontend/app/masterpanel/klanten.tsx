import React, { useEffect, useMemo, useState } from 'react';
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
  plan: string;
  status: string;
  created_at: string | null;
  trial_end_date: string | null;
  days_remaining: number | null;
  werkbonnen: number;
  gebruikers: number;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  trial: { bg: '#fff3cd', fg: '#856404', label: 'Trial' },
  active: { bg: '#d4edda', fg: '#155724', label: 'Actief' },
  expired: { bg: '#f8d7da', fg: '#721c24', label: 'Verlopen' },
  blocked: { bg: '#e2e3e5', fg: '#383d41', label: 'Geblokkeerd' },
};

const PLAN_COLORS: Record<string, { bg: string; fg: string }> = {
  basic: { bg: '#d1ecf1', fg: '#0c5460' },
  pro: { bg: '#fff3cd', fg: '#856404' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
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
            {(['all', 'basic', 'pro'] as const).map((p) => (
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
          <View style={styles.tableShell}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 220 }]}>Bedrijf</Text>
              <Text style={[styles.th, { width: 160 }]}>Contactpersoon</Text>
              <Text style={[styles.th, { width: 220 }]}>E-mail</Text>
              <Text style={[styles.th, { width: 90 }]}>Plan</Text>
              <Text style={[styles.th, { width: 110 }]}>Status</Text>
              <Text style={[styles.th, { width: 130 }]}>Geregistreerd</Text>
              <Text style={[styles.th, { width: 130 }]}>Trial einde</Text>
              <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Werkbonnen</Text>
              <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Users</Text>
              <Text style={[styles.th, { width: 110 }]}></Text>
            </View>
            {klanten.map((row) => (
              <View key={row.company_id} style={styles.tableRow}>
                <Text style={[styles.td, { width: 220, fontWeight: '700', color: SIGNYBON_GREEN }]} numberOfLines={1}>{row.bedrijfsnaam || '—'}</Text>
                <Text style={[styles.td, { width: 160 }]} numberOfLines={1}>{row.contactpersoon || '—'}</Text>
                <Text style={[styles.td, { width: 220 }]} numberOfLines={1}>{row.email || '—'}</Text>
                <View style={{ width: 90 }}><PlanBadge plan={row.plan} /></View>
                <View style={{ width: 110 }}><StatusBadge status={row.status} /></View>
                <Text style={[styles.td, { width: 130 }]}>{formatDate(row.created_at)}</Text>
                <Text style={[styles.td, { width: 130 }]}>{formatDate(row.trial_end_date)}</Text>
                <Text style={[styles.td, { width: 90, textAlign: 'right', fontWeight: '600' }]}>{row.werkbonnen}</Text>
                <Text style={[styles.td, { width: 80, textAlign: 'right', fontWeight: '600' }]}>{row.gebruikers}</Text>
                <View style={{ width: 110 }}>
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
  content: { padding: 28 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  toolbar: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 18,
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
    minWidth: 1340,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  th: { fontSize: 11, fontWeight: '700', color: '#495057', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
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
