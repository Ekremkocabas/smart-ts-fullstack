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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../context/AuthContext';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';

interface Reply {
  message: string;
  created_at: string;
  by: string;
}

interface Ticket {
  id: string;
  company_id: string | null;
  bedrijfsnaam: string;
  naam: string;
  email: string;
  vraag: string;
  status: string;
  created_at: string;
  replies: Reply[];
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  open: { bg: '#fff3cd', fg: '#856404', label: 'Open' },
  beantwoord: { bg: '#d1ecf1', fg: '#0c5460', label: 'Beantwoord' },
  gesloten: { bg: '#e2e3e5', fg: '#383d41', label: 'Gesloten' },
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
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});

function formatDateTime(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('nl-BE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncate(s: string, n: number) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function MasterTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/master/tickets');
      setTickets(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kon tickets niet laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/master/tickets/${selected.id}/reply`, { message: reply.trim() });
      setReply('');
      setSelected(null);
      await load();
      if (Platform.OS === 'web') window.alert('Antwoord verstuurd');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Kon antwoord niet versturen';
      if (Platform.OS === 'web') window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/master/tickets/${selected.id}/status`, { status });
      await load();
      setSelected((prev) => (prev ? { ...prev, status } : prev));
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Kon status niet wijzigen';
      if (Platform.OS === 'web') window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Support Tickets</Text>
        <Text style={styles.subtitle}>{tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}</Text>
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
      ) : tickets.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={36} color="#adb5bd" />
          <Text style={styles.emptyText}>Geen tickets gevonden.</Text>
        </View>
      ) : (
        <View style={styles.tableShell}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 160 }]}>Datum</Text>
            <Text style={[styles.th, { flex: 1 }]}>Bedrijf</Text>
            <Text style={[styles.th, { flex: 1 }]}>Naam</Text>
            <Text style={[styles.th, { flex: 2 }]}>Vraag</Text>
            <Text style={[styles.th, { width: 130 }]}>Status</Text>
          </View>
          {tickets.map((t) => (
            <TouchableOpacity key={t.id} style={styles.tableRow} onPress={() => setSelected(t)}>
              <Text style={[styles.td, { width: 160 }]}>{formatDateTime(t.created_at)}</Text>
              <Text style={[styles.td, { flex: 1, fontWeight: '600', color: SIGNYBON_GREEN }]} numberOfLines={1}>
                {t.bedrijfsnaam || '—'}
              </Text>
              <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{t.naam}</Text>
              <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{truncate(t.vraag, 50)}</Text>
              <View style={{ width: 130 }}>
                <StatusBadge status={t.status} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selected && (
              <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{selected.bedrijfsnaam || selected.naam}</Text>
                    <Text style={styles.modalSub}>{selected.email} · {formatDateTime(selected.created_at)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={24} color="#6c757d" />
                  </TouchableOpacity>
                </View>

                <View style={styles.statusRow}>
                  <StatusBadge status={selected.status} />
                  <View style={styles.statusBtns}>
                    {(['open', 'beantwoord', 'gesloten'] as const).map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.statusBtn, selected.status === s && styles.statusBtnActive]}
                        onPress={() => setStatus(s)}
                      >
                        <Text style={[styles.statusBtnText, selected.status === s && { color: '#fff' }]}>
                          {STATUS_COLORS[s].label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <Text style={styles.label}>Vraag</Text>
                <View style={styles.questionBox}>
                  <Text style={styles.questionText}>{selected.vraag}</Text>
                </View>

                {selected.replies && selected.replies.length > 0 && (
                  <>
                    <Text style={styles.label}>Antwoorden</Text>
                    {selected.replies.map((r, i) => (
                      <View key={i} style={styles.replyBox}>
                        <Text style={styles.replyMeta}>{r.by} · {formatDateTime(r.created_at)}</Text>
                        <Text style={styles.replyText}>{r.message}</Text>
                      </View>
                    ))}
                  </>
                )}

                <Text style={styles.label}>Antwoord schrijven</Text>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  multiline
                  numberOfLines={5}
                  placeholder="Typ uw antwoord…"
                  placeholderTextColor="#adb5bd"
                  style={styles.textarea}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!reply.trim() || busy) && { opacity: 0.5 }]}
                  disabled={!reply.trim() || busy}
                  onPress={sendReply}
                >
                  <Ionicons name="send-outline" size={16} color="#fff" />
                  <Text style={styles.sendBtnText}>Verstuur antwoord</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  center: { alignItems: 'center', padding: 60, gap: 12 },
  errorText: { color: '#6c757d', fontSize: 14 },
  empty: { backgroundColor: '#fff', borderRadius: 12, padding: 60, alignItems: 'center', gap: 12 },
  emptyText: { color: '#6c757d', fontSize: 14 },
  tableShell: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
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
    maxWidth: 640,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: SIGNYBON_GREEN },
  modalSub: { fontSize: 12, color: '#6c757d', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  statusBtns: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#fff',
  },
  statusBtnActive: { backgroundColor: SIGNYBON_GREEN, borderColor: SIGNYBON_GREEN },
  statusBtnText: { fontSize: 11, color: '#495057', fontWeight: '700', textTransform: 'uppercase' },
  label: { fontSize: 12, fontWeight: '700', color: '#6c757d', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  questionBox: { backgroundColor: '#f8f9fa', borderRadius: 8, padding: 14, borderLeftWidth: 4, borderLeftColor: '#adb5bd' },
  questionText: { fontSize: 13, color: '#495057', whiteSpace: 'pre-wrap' as any, lineHeight: 20 },
  replyBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: SIGNYBON_GREEN,
    marginBottom: 8,
  },
  replyMeta: { fontSize: 11, color: '#6c757d', marginBottom: 6 },
  replyText: { fontSize: 13, color: '#1B4332', whiteSpace: 'pre-wrap' as any, lineHeight: 20 },
  textarea: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: '#1B4332',
    minHeight: 120,
    textAlignVertical: 'top',
    outlineWidth: 0 as any,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SIGNYBON_GREEN,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 14,
  },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
