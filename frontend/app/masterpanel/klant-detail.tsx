import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../context/AuthContext';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';

interface Detail {
  company: {
    company_id: string;
    bedrijfsnaam: string;
    btw_nummer: string;
    email: string;
    telefoon: string;
    contactpersoon: string;
    adres: any;
    created_at: string;
  };
  subscription: {
    status: string;
    plan: string;
    trial_start_date: string | null;
    trial_end_date: string | null;
    days_remaining: number | null;
  };
  werknemers: Array<{ id: string; naam: string; email: string; rol: string; actief: boolean }>;
  klanten: Array<{ id: string; naam: string; email: string }>;
  werven: Array<{ id: string; naam: string; klant_naam: string }>;
  werkbonnen: { total: number; recent: Array<{ id: string; datum: string; klant_naam: string; werf_naam: string; type: string; status: string }> };
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  trial: { bg: '#fff3cd', fg: '#856404', label: 'Trial' },
  active: { bg: '#d4edda', fg: '#155724', label: 'Actief' },
  expired: { bg: '#f8d7da', fg: '#721c24', label: 'Verlopen' },
  blocked: { bg: '#e2e3e5', fg: '#383d41', label: 'Geblokkeerd' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_COLORS[status] || { bg: '#e9ecef', fg: '#495057', label: status };
  return (
    <View style={[badgeStyles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[badgeStyles.text, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  text: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function MasterKlantDetail() {
  const params = useLocalSearchParams<{ company_id?: string }>();
  const companyId = params.company_id || '';
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trialDate, setTrialDate] = useState('');
  const [planDraft, setPlanDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const load = async () => {
    if (!companyId) {
      setError('Geen company_id meegegeven');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/api/master/klanten/${companyId}`);
      setData(res.data);
      setPlanDraft(res.data?.subscription?.plan || '');
      setTrialDate((res.data?.subscription?.trial_end_date || '').slice(0, 10));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kon detail niet laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const action = async (fn: () => Promise<any>, successMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (successMsg && Platform.OS === 'web') window.alert(successMsg);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Actie mislukt';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Fout', msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SIGNYBON_GREEN} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="warning-outline" size={32} color="#dc3545" />
        <Text style={styles.errorText}>{error || 'Geen data'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>Terug</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isBlocked = data.subscription.status === 'blocked';
  const adres = data.company.adres || {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={SIGNYBON_GREEN} />
        <Text style={styles.backLink}>Terug naar bedrijven</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{data.company.bedrijfsnaam || '—'}</Text>
          <Text style={styles.subtitle}>{data.company.email || '—'}</Text>
        </View>
        <StatusBadge status={data.subscription.status} />
      </View>

      <View style={styles.twoCol}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bedrijfsgegevens</Text>
          <Field label="Bedrijfsnaam" value={data.company.bedrijfsnaam} />
          <Field label="BTW nummer" value={data.company.btw_nummer} />
          <Field label="Contactpersoon" value={data.company.contactpersoon} />
          <Field label="E-mail" value={data.company.email} />
          <Field label="Telefoon" value={data.company.telefoon} />
          <Field
            label="Adres"
            value={[adres.straat, adres.huisnummer, adres.postcode, adres.stad, adres.land]
              .filter(Boolean)
              .join(' ')}
          />
          <Field label="Geregistreerd" value={formatDate(data.company.created_at)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Abonnement</Text>
          <View style={styles.badgeRow}>
            <StatusBadge status={data.subscription.status} />
            <View style={[badgeStyles.badge, { backgroundColor: '#1B433215' }]}>
              <Text style={[badgeStyles.text, { color: SIGNYBON_GREEN }]}>
                {data.subscription.plan || 'GEEN PLAN'}
              </Text>
            </View>
          </View>
          <Field label="Trial start" value={formatDate(data.subscription.trial_start_date)} />
          <Field label="Trial einde" value={formatDate(data.subscription.trial_end_date)} />
          <Field
            label="Dagen resterend"
            value={data.subscription.days_remaining !== null ? `${data.subscription.days_remaining} dagen` : '—'}
          />
        </View>
      </View>

      <Section title={`Werknemers (${data.werknemers.length})`}>
        {data.werknemers.length === 0 ? <EmptyRow /> : (
          <Table
            headers={['Naam', 'E-mail', 'Rol', 'Actief']}
            rows={data.werknemers.map((w) => [
              w.naam || '—',
              w.email || '—',
              w.rol || '—',
              w.actief ? 'Ja' : 'Nee',
            ])}
          />
        )}
      </Section>

      <Section title={`Klanten (${data.klanten.length})`}>
        {data.klanten.length === 0 ? <EmptyRow /> : (
          <Table
            headers={['Naam', 'E-mail']}
            rows={data.klanten.map((k) => [k.naam || '—', k.email || '—'])}
          />
        )}
      </Section>

      <Section title={`Werven (${data.werven.length})`}>
        {data.werven.length === 0 ? <EmptyRow /> : (
          <Table
            headers={['Naam', 'Klant']}
            rows={data.werven.map((w) => [w.naam || '—', w.klant_naam || '—'])}
          />
        )}
      </Section>

      <Section title={`Werkbonnen — totaal ${data.werkbonnen.total} (laatste 10)`}>
        {data.werkbonnen.recent.length === 0 ? <EmptyRow /> : (
          <Table
            headers={['Datum', 'Klant', 'Werf', 'Type', 'Status']}
            rows={data.werkbonnen.recent.map((w) => [
              formatDate(w.datum),
              w.klant_naam || '—',
              w.werf_naam || '—',
              w.type || '—',
              w.status || '—',
            ])}
          />
        )}
      </Section>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acties</Text>

        <View style={styles.actionRow}>
          <Text style={styles.actionLabel}>{isBlocked ? 'Account is geblokkeerd' : 'Account is actief'}</Text>
          <TouchableOpacity
            style={[styles.actionBtn, isBlocked ? styles.unblockBtn : styles.blockBtn]}
            disabled={busy}
            onPress={() =>
              action(
                () =>
                  isBlocked
                    ? apiClient.post(`/api/master/klanten/${companyId}/unblock`)
                    : apiClient.post(`/api/master/klanten/${companyId}/block`),
                isBlocked ? 'Account gedeblokkeerd' : 'Account geblokkeerd',
              )
            }
          >
            <Ionicons name={isBlocked ? 'lock-open-outline' : 'lock-closed-outline'} size={16} color="#fff" />
            <Text style={styles.actionBtnText}>{isBlocked ? 'Deblokkeren' : 'Blokkeren'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>Trial verlengen tot</Text>
            <TextInput
              value={trialDate}
              onChangeText={setTrialDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#adb5bd"
              style={styles.input}
            />
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, styles.saveBtn]}
            disabled={busy || !trialDate}
            onPress={() =>
              action(
                () => apiClient.post(`/api/master/klanten/${companyId}/extend-trial`, { end_date: `${trialDate}T23:59:59+00:00` }),
                'Trial verlengd',
              )
            }
          >
            <Text style={styles.actionBtnText}>Opslaan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionLabel}>Plan wijzigen</Text>
            <View style={styles.planChips}>
              {['basic', 'pro', 'free'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, planDraft === p && styles.chipActive]}
                  onPress={() => setPlanDraft(p)}
                >
                  <Text style={[styles.chipText, planDraft === p && styles.chipTextActive]}>{p === 'free' ? 'free (gratis)' : p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, styles.saveBtn]}
            disabled={busy || !planDraft}
            onPress={() =>
              action(
                () => apiClient.post(`/api/master/klanten/${companyId}/change-plan`, { plan: planDraft }),
                'Plan gewijzigd',
              )
            }
          >
            <Text style={styles.actionBtnText}>Opslaan</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.actionRow, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f3f5' }]}>
          <Text style={[styles.actionLabel, { color: '#dc3545' }]}>Account permanent verwijderen</Text>
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => setDeleteOpen(true)}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Verwijderen</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Account verwijderen</Text>
            <Text style={styles.modalBody}>
              Dit verwijdert <Text style={{ fontWeight: '700' }}>{data.company.bedrijfsnaam}</Text> en alle bijbehorende data permanent.
              Typ <Text style={{ fontWeight: '700' }}>DELETE</Text> om te bevestigen.
            </Text>
            <TextInput
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              placeholder="DELETE"
              placeholderTextColor="#adb5bd"
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#6c757d' }]} onPress={() => setDeleteOpen(false)}>
                <Text style={styles.actionBtnText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                disabled={deleteConfirm !== 'DELETE' || busy}
                onPress={async () => {
                  try {
                    setBusy(true);
                    await apiClient.delete(`/api/master/klanten/${companyId}`, { data: { confirm: 'DELETE' } });
                    setDeleteOpen(false);
                    router.replace('/masterpanel/klanten' as any);
                  } catch (err: any) {
                    const msg = err?.response?.data?.detail || 'Verwijderen mislukt';
                    if (Platform.OS === 'web') window.alert(msg);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Text style={styles.actionBtnText}>Definitief verwijderen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function EmptyRow() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>Geen gegevens.</Text>
    </View>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {headers.map((h, i) => (
          <Text key={i} style={styles.th}>{h}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.tableRow}>
          {r.map((cell, j) => (
            <Text key={j} style={styles.td} numberOfLines={1}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  errorText: { color: '#6c757d', fontSize: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  backLink: { color: SIGNYBON_GREEN, fontWeight: '600' },
  backBtn: { backgroundColor: SIGNYBON_GREEN, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  backText: { color: '#fff', fontWeight: '600' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  twoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 22,
    flexGrow: 1,
    flexBasis: 320,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: SIGNYBON_GREEN, marginBottom: 14 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  fieldLabel: { fontSize: 13, color: '#6c757d', flex: 1 },
  fieldValue: { fontSize: 13, color: '#1B4332', fontWeight: '600', flex: 2, textAlign: 'right' },
  table: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 8, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  th: { flex: 1, fontSize: 11, fontWeight: '700', color: '#495057', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  td: { flex: 1, fontSize: 13, color: '#495057' },
  empty: { padding: 14 },
  emptyText: { color: '#adb5bd', fontSize: 13 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  actionLabel: { flex: 1, fontSize: 13, color: '#1B4332', fontWeight: '600' },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1B4332',
    marginTop: 6,
    outlineWidth: 0 as any,
  },
  planChips: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f8f9fa',
  },
  chipActive: { backgroundColor: SIGNYBON_GREEN, borderColor: SIGNYBON_GREEN },
  chipText: { fontSize: 12, color: '#495057', fontWeight: '600', textTransform: 'uppercase' },
  chipTextActive: { color: '#fff' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  blockBtn: { backgroundColor: '#dc3545' },
  unblockBtn: { backgroundColor: '#28a745' },
  saveBtn: { backgroundColor: SIGNYBON_GREEN },
  deleteBtn: { backgroundColor: '#dc3545' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 26,
    width: '100%',
    maxWidth: 460,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#dc3545', marginBottom: 12 },
  modalBody: { fontSize: 14, color: '#495057', marginBottom: 14, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
});
