import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, apiClient } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';

const PAGE_SIZE = 100;

interface Werkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  klant_naam: string;
  werf_naam: string;
  status: string;
  created_by_naam?: string;
  ingevuld_door_naam?: string;
  handtekening_data?: string;
  uren?: any[];
}

type Props = {
  title: string;
  description: string;
  weekNummer?: number;
  jaar: number;
  maand?: number;
  extraHeader?: ReactNode;
};

const parseUren = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const calcTotalUren = (wb: Werkbon) =>
  wb.uren?.reduce(
    (acc, u) =>
      acc +
      parseUren(u.maandag) +
      parseUren(u.dinsdag) +
      parseUren(u.woensdag) +
      parseUren(u.donderdag) +
      parseUren(u.vrijdag) +
      parseUren(u.zaterdag) +
      parseUren(u.zondag),
    0
  ) || 0;

const getStatusColor = (status: string) => {
  switch (status) {
    case 'concept':
      return '#ffc107';
    case 'ondertekend':
      return '#28a745';
    case 'verzonden':
      return '#F5A623';
    default:
      return '#6c757d';
  }
};

interface BillitConfig {
  billit_actief: boolean;
  billit_auto_versturen: boolean;
}

export function WerkbonnenPeriodList({ title, description, weekNummer, jaar, maand, extraHeader }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [items, setItems] = useState<Werkbon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [billitConfig, setBillitConfig] = useState<BillitConfig>({ billit_actief: false, billit_auto_versturen: false });
  const [billitSending, setBillitSending] = useState<string | null>(null);

  const countUrl = React.useMemo(() => {
    const p = new URLSearchParams();
    if (weekNummer !== undefined) {
      p.set('week_nummer', String(weekNummer));
      p.set('jaar', String(jaar));
    } else if (maand !== undefined) {
      p.set('jaar', String(jaar));
      p.set('maand', String(maand));
    } else {
      p.set('jaar', String(jaar));
    }
    return `/api/werkbonnen/filter-count?${p.toString()}`;
  }, [weekNummer, jaar, maand]);

  const buildListUrl = (skip: number) => {
    const uid = user?.id || '';
    const p = new URLSearchParams({
      user_id: uid,
      is_admin: 'true',
      skip: String(skip),
      limit: String(PAGE_SIZE),
    });
    if (weekNummer !== undefined) {
      p.set('week_nummer', String(weekNummer));
      p.set('jaar', String(jaar));
    } else if (maand !== undefined) {
      p.set('jaar', String(jaar));
      p.set('maand', String(maand));
    } else {
      p.set('jaar', String(jaar));
    }
    return `/api/werkbonnen?${p.toString()}`;
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setItems([]);
      try {
        const [cRes, lRes, billitRes] = await Promise.all([
          apiClient.get(countUrl),
          apiClient.get(buildListUrl(0)),
          apiClient.get('/api/instellingen/facturatie').catch(() => ({ data: {} })),
        ]);
        if (cancelled) return;
        const count = typeof cRes.data?.count === 'number' ? cRes.data.count : 0;
        const list = Array.isArray(lRes.data) ? lRes.data : [];
        setTotal(count);
        setItems(list.sort((a: Werkbon, b: Werkbon) => b.week_nummer - a.week_nummer));
        setBillitConfig({
          billit_actief: billitRes.data?.billit_actief ?? false,
          billit_auto_versturen: billitRes.data?.billit_auto_versturen ?? false,
        });
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [countUrl, user?.id, weekNummer, jaar, maand]);

  const loadMore = async () => {
    if (!user?.id || loadingMore) return;
    setLoadingMore(true);
    try {
      const lRes = await apiClient.get(buildListUrl(items.length));
      const list = Array.isArray(lRes.data) ? lRes.data : [];
      setItems((prev) => {
        const merged = [...prev, ...list];
        return merged.sort((a: Werkbon, b: Werkbon) => b.week_nummer - a.week_nummer);
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = items.filter(
    (wb) =>
      !search ||
      wb.klant_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.werf_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.ingevuld_door_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.created_by_naam?.toLowerCase().includes(search.toLowerCase())
  );

  const downloadPdf = async (id: string) => {
    try {
      const res = await apiClient.get(`/api/werkbonnen/${id}/pdf`);
      const data = res.data;
      if (data.pdf_base64) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.pdf_base64}`;
        link.download = `werkbon_${id}.pdf`;
        link.click();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteWerkbon = async (id: string) => {
    if (!confirm('Zeker weten? Deze werkbon wordt permanent verwijderd.')) return;
    try {
      await apiClient.delete(`/api/werkbonnen/${id}`);
      setItems(prev => prev.filter(wb => wb.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error(e);
      alert('Fout bij verwijderen werkbon.');
    }
  };

  const sendToBillit = async (id: string) => {
    if (billitSending) return;
    setBillitSending(id);
    try {
      await apiClient.post(`/api/werkbonnen/${id}/verstuur-billit`);
      alert('Werkbon succesvol naar Billit gestuurd!');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Onbekende fout';
      alert('Fout bij versturen naar Billit: ' + msg);
    } finally {
      setBillitSending(null);
    }
  };

  const showBillitButton = billitConfig.billit_actief && !billitConfig.billit_auto_versturen;

  if (Platform.OS !== 'web') return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={() => router.push('/admin/werkbonnen' as any)} style={styles.backRow}>
        <Ionicons name="arrow-back" size={22} color={theme.primaryColor || '#F5A623'} />
        <Text style={[styles.backText, { color: theme.primaryColor || '#F5A623' }]}>Terug naar werkbonnen</Text>
      </TouchableOpacity>
      {extraHeader}
      <Text style={[styles.title, { color: theme.secondaryColor || '#1A1A2E' }]}>{title}</Text>
      <Text style={styles.desc}>{description}</Text>
      <Text style={styles.meta}>
        {total} werkbon{total !== 1 ? 'nen' : ''} in deze periode
        {items.length < total ? ` · ${items.length} geladen` : ''}
      </Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#6c757d" />
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek klant, werf of werknemer..."
          placeholderTextColor="#6c757d"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.primaryColor || '#F5A623'} style={{ marginVertical: 40 }} />
      ) : (
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <View style={styles.seqCell}><Text style={styles.seqText}>NR</Text></View>
            <Text style={styles.tableHeaderCell}>Week</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Klant / Werf</Text>
            <Text style={styles.tableHeaderCell}>Werknemer</Text>
            <Text style={styles.tableHeaderCell}>Uren</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={[styles.tableHeaderCell, { flex: showBillitButton ? 1.2 : 0.9, textAlign: 'center' }]}>
              {showBillitButton ? 'PDF / Billit / Del' : 'PDF / Del'}
            </Text>
          </View>
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen werkbonnen</Text>
            </View>
          ) : (
            filtered.map((wb, index) => (
              <TouchableOpacity
                key={wb.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
                onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}
              >
                <View style={styles.seqCell}><Text style={styles.seqText}>{index + 1}</Text></View>
                <View style={styles.tableCell}>
                  <View style={[styles.weekBadge, { backgroundColor: `${theme.primaryColor || '#F5A623'}15` }]}>
                    <Text style={[styles.weekText, { color: theme.primaryColor || '#F5A623' }]}>W{wb.week_nummer}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, { flex: 1.5 }]}>
                  <Text style={[styles.klantText, { color: theme.secondaryColor || '#1A1A2E' }]}>{wb.klant_naam}</Text>
                  <Text style={styles.werfText}>{wb.werf_naam}</Text>
                </View>
                <Text style={styles.tableCell}>{wb.ingevuld_door_naam || wb.created_by_naam || '-'}</Text>
                <View style={styles.tableCell}>
                  <Text style={[styles.urenText, { color: theme.secondaryColor || '#1A1A2E' }]}>{calcTotalUren(wb)} u</Text>
                </View>
                <View style={styles.tableCell}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wb.status) }]}>
                    <Text style={styles.statusText}>{wb.status}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, { flex: showBillitButton ? 1.2 : 0.9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }]}>
                  <TouchableOpacity
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      downloadPdf(wb.id);
                    }}
                  >
                    <Ionicons name="download-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  {showBillitButton && (
                    <TouchableOpacity
                      onPress={(e: any) => {
                        e?.stopPropagation?.();
                        sendToBillit(wb.id);
                      }}
                      disabled={billitSending === wb.id}
                      style={styles.billitBtn}
                    >
                      {billitSending === wb.id ? (
                        <ActivityIndicator size="small" color="#0066CC" />
                      ) : (
                        <View style={styles.billitBtnInner}>
                          <Text style={styles.billitBtnText}>B</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      deleteWerkbon(wb.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={17} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
          {!search && items.length < total && (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator color={theme.primaryColor || '#F5A623'} />
              ) : (
                <Text style={[styles.moreBtnText, { color: theme.primaryColor || '#F5A623' }]}>
                  Meer laden ({items.length} / {total})
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  backText: { fontSize: 15, fontWeight: '600', color: '#F5A623' },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
  desc: { fontSize: 14, color: '#6c757d', marginTop: 6 },
  meta: { fontSize: 13, color: '#adb5bd', marginTop: 8, marginBottom: 16 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 15, color: '#1A1A2E' },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    overflow: 'hidden',
    marginBottom: 40,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  tableHeaderCell: { flex: 1, fontSize: 11, fontWeight: '600', color: '#6c757d', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1 },
  weekBadge: {
    backgroundColor: '#F5A62315',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  weekText: { fontSize: 13, fontWeight: '700', color: '#F5A623' },
  klantText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  werfText: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  urenText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'uppercase' },
  emptyState: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#6c757d', marginTop: 12 },
  moreBtn: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    backgroundColor: '#FAFAFA',
  },
  moreBtnText: { fontSize: 14, fontWeight: '600', color: '#F5A623' },
  seqCell: { width: 40, alignItems: 'center', justifyContent: 'center' },
  seqText: { fontSize: 13, color: '#444444', textAlign: 'center', fontWeight: '500' },
  billitBtn: { alignItems: 'center', justifyContent: 'center' },
  billitBtnInner: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billitBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
});
