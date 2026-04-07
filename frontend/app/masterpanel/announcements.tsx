import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../context/AuthContext';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';

interface Announcement {
  id: string;
  subject: string;
  content: string;
  target: string;
  company_count: number;
  sent_count: number;
  created_at: string;
}

const TARGETS = [
  { value: 'all', label: 'Iedereen' },
  { value: 'trial', label: 'Alleen trial' },
  { value: 'basic', label: 'Alleen Basic' },
  { value: 'pro', label: 'Alleen Pro' },
];

function formatDateTime(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function MasterAnnouncements() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/master/announcements');
      setList(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kon aankondigingen niet laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openConfirm = async () => {
    if (!subject.trim() || !content.trim()) {
      if (Platform.OS === 'web') window.alert('Vul onderwerp en inhoud in');
      return;
    }
    // Best-effort estimate of recipients via the klanten list
    try {
      const params: Record<string, string> = {};
      if (target === 'trial') params.status = 'trial';
      if (target === 'basic' || target === 'pro') params.plan = target;
      const res = await apiClient.get('/api/master/klanten', { params });
      setPreviewCount(Array.isArray(res.data) ? res.data.length : 0);
    } catch {
      setPreviewCount(null);
    }
    setConfirmOpen(true);
  };

  const send = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/api/master/announcements', { subject, content, target });
      setConfirmOpen(false);
      setSubject('');
      setContent('');
      setTarget('all');
      await load();
      if (Platform.OS === 'web') {
        window.alert(`Verstuurd naar ${res.data?.sent_count ?? '?'} ontvangers`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Versturen mislukt';
      if (Platform.OS === 'web') window.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Duyurular</Text>
        <Text style={styles.subtitle}>Platform-brede mededelingen</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nieuwe aankondiging</Text>

        <Text style={styles.label}>Onderwerp</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Bijv. Gepland onderhoud op zaterdag"
          placeholderTextColor="#adb5bd"
          style={styles.input}
        />

        <Text style={styles.label}>Inhoud</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={6}
          placeholder="Schrijf hier uw bericht…"
          placeholderTextColor="#adb5bd"
          style={styles.textarea}
        />

        <Text style={styles.label}>Doelgroep</Text>
        <View style={styles.chips}>
          {TARGETS.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, target === t.value && styles.chipActive]}
              onPress={() => setTarget(t.value)}
            >
              <Text style={[styles.chipText, target === t.value && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.sendBtn} onPress={openConfirm}>
          <Ionicons name="megaphone-outline" size={18} color="#fff" />
          <Text style={styles.sendBtnText}>Verstuur aankondiging</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Eerder verzonden</Text>
        {loading ? (
          <ActivityIndicator color={SIGNYBON_GREEN} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : list.length === 0 ? (
          <Text style={styles.emptyText}>Nog geen aankondigingen verzonden.</Text>
        ) : (
          <View style={styles.tableShell}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 160 }]}>Datum</Text>
              <Text style={[styles.th, { flex: 2 }]}>Onderwerp</Text>
              <Text style={[styles.th, { width: 120 }]}>Doelgroep</Text>
              <Text style={[styles.th, { width: 130, textAlign: 'right' }]}>Verzonden</Text>
            </View>
            {list.map((a) => (
              <View key={a.id} style={styles.tableRow}>
                <Text style={[styles.td, { width: 160 }]}>{formatDateTime(a.created_at)}</Text>
                <Text style={[styles.td, { flex: 2, fontWeight: '600', color: SIGNYBON_GREEN }]} numberOfLines={1}>{a.subject}</Text>
                <Text style={[styles.td, { width: 120 }]}>{TARGETS.find((t) => t.value === a.target)?.label || a.target}</Text>
                <Text style={[styles.td, { width: 130, textAlign: 'right', fontWeight: '600' }]}>
                  {a.sent_count}/{a.company_count}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Aankondiging versturen?</Text>
            <Text style={styles.modalBody}>
              Dit stuurt een e-mail naar{' '}
              <Text style={{ fontWeight: '700' }}>
                {previewCount !== null ? `${previewCount} bedrijven` : 'de geselecteerde doelgroep'}
              </Text>
              .
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#6c757d' }]} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.actionBtnText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: SIGNYBON_GREEN }]}
                disabled={busy}
                onPress={send}
              >
                <Text style={styles.actionBtnText}>{busy ? 'Bezig…' : 'Verstuur'}</Text>
              </TouchableOpacity>
            </View>
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
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 22, marginBottom: 18 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: SIGNYBON_GREEN, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#6c757d', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1B4332',
    outlineWidth: 0 as any,
  },
  textarea: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: '#1B4332',
    minHeight: 140,
    textAlignVertical: 'top',
    outlineWidth: 0 as any,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
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
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SIGNYBON_GREEN,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 18,
  },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorText: { color: '#dc3545', fontSize: 14 },
  emptyText: { color: '#adb5bd', fontSize: 13 },
  tableShell: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 8, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  th: { fontSize: 11, fontWeight: '700', color: '#495057', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
    alignItems: 'center',
  },
  td: { fontSize: 13, color: '#495057' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 26, width: '100%', maxWidth: 460 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: SIGNYBON_GREEN, marginBottom: 12 },
  modalBody: { fontSize: 14, color: '#495057', marginBottom: 14, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  actionBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
