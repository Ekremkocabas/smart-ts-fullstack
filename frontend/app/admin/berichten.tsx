import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

interface Bericht {
  id: string;
  van_id: string;
  van_naam: string;
  naar_id?: string;
  naar_naam?: string;
  is_broadcast: boolean;
  onderwerp: string;
  inhoud: string;
  vastgepind: boolean;
  gelezen_door: string[];
  created_at: string;
}

interface Werknemer {
  id: string;
  naam: string;
  rol: string;
  actief: boolean;
}

export default function BerichtenAdmin() {
  const { user } = useAuth();
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedBericht, setSelectedBericht] = useState<Bericht | null>(null);

  const [form, setForm] = useState({
    naar_id: '',
    is_broadcast: false,
    onderwerp: '',
    inhoud: '',
    vastgepind: false,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id || 'admin-001';
      const [berichtenRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/berichten?user_id=${userId}`),
        fetch(`${API_URL}/api/auth/users`),
      ]);
      const berichtenData = await berichtenRes.json();
      const usersData = await usersRes.json();
      setBerichten(Array.isArray(berichtenData) ? berichtenData : []);
      setWerknemers(Array.isArray(usersData) ? usersData.filter((u: any) => u.actief && u.rol !== 'beheerder' && u.rol !== 'admin') : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (Platform.OS === 'web') fetchData();
  }, [fetchData]);

  const openNewMessage = () => {
    setForm({ naar_id: '', is_broadcast: false, onderwerp: '', inhoud: '', vastgepind: false });
    setSelectedBericht(null);
    setShowModal(true);
  };

  const sendBericht = async () => {
    if (!form.onderwerp.trim() || !form.inhoud.trim()) {
      alert('Vul onderwerp en bericht in');
      return;
    }
    if (!form.is_broadcast && !form.naar_id) {
      alert('Selecteer een werknemer of verstuur als broadcast');
      return;
    }
    setSaving(true);
    try {
      const body = {
        naar_id: form.is_broadcast ? null : form.naar_id,
        is_broadcast: form.is_broadcast,
        onderwerp: form.onderwerp,
        inhoud: form.inhoud,
        vastgepind: form.vastgepind,
      };
      const userId = user?.id || 'admin-001';
      const userName = user?.naam || 'Admin';
      await fetch(`${API_URL}/api/berichten?van_id=${userId}&van_naam=${encodeURIComponent(userName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setShowModal(false);
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij verzenden'); }
    finally { setSaving(false); }
  };

  const deleteBericht = async (id: string) => {
    if (!confirm('Weet u zeker dat u dit bericht wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/berichten/${id}`, { method: 'DELETE' });
      setSelectedBericht(null);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return dateStr; }
  };

  if (Platform.OS !== 'web') return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Berichten</Text>
          <Text style={styles.subtitle}>{berichten.length} berichten</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNewMessage}>
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Nieuw bericht</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : berichten.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={64} color="#E8E9ED" />
          <Text style={styles.emptyTitle}>Geen berichten</Text>
          <Text style={styles.emptyText}>Stuur een bericht naar werknemers</Text>
        </View>
      ) : (
        <View style={styles.berichtenList}>
          {berichten.map(b => (
            <TouchableOpacity key={b.id} style={[styles.berichtCard, b.vastgepind && styles.berichtPinned]}
              onPress={() => setSelectedBericht(b)} activeOpacity={0.7}>
              <View style={styles.berichtHeader}>
                <View style={styles.berichtFrom}>
                  <View style={styles.berichtAvatar}><Text style={styles.berichtAvatarText}>{b.van_naam?.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.berichtFromName}>{b.van_naam}</Text>
                    <Text style={styles.berichtTo}>
                      {b.is_broadcast ? '📢 Alle werknemers' : `→ ${b.naar_naam || 'Onbekend'}`}
                    </Text>
                  </View>
                  {b.vastgepind && <Ionicons name="pin" size={16} color="#F5A623" />}
                  <Text style={styles.berichtDate}>{formatDate(b.created_at)}</Text>
                </View>
              </View>
              <Text style={styles.berichtSubject}>{b.onderwerp}</Text>
              <Text style={styles.berichtInhoud} numberOfLines={2}>{b.inhoud}</Text>
              <View style={styles.berichtFooter}>
                <View style={[styles.berichtTypeBadge, { backgroundColor: b.is_broadcast ? '#3498db20' : '#27ae6020' }]}>
                  <Ionicons name={b.is_broadcast ? 'megaphone-outline' : 'person-outline'} size={12} color={b.is_broadcast ? '#3498db' : '#27ae60'} />
                  <Text style={{ fontSize: 11, color: b.is_broadcast ? '#3498db' : '#27ae60', fontWeight: '600' }}>
                    {b.is_broadcast ? 'Broadcast' : 'Direct'}
                  </Text>
                </View>
                <Text style={styles.berichtGelezen}>{b.gelezen_door.length} gelezen</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Detail Modal */}
      {selectedBericht && (
        <Modal visible={!!selectedBericht} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Bericht</Text>
                <TouchableOpacity onPress={() => setSelectedBericht(null)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
              </View>
              <ScrollView>
                <View style={styles.detailMeta}>
                  <Text style={styles.detailFrom}>Van: {selectedBericht.van_naam}</Text>
                  <Text style={styles.detailTo}>Naar: {selectedBericht.is_broadcast ? 'Alle werknemers' : selectedBericht.naar_naam}</Text>
                  <Text style={styles.detailDate}>{formatDate(selectedBericht.created_at)}</Text>
                </View>
                <Text style={styles.detailSubject}>{selectedBericht.onderwerp}</Text>
                <Text style={styles.detailInhoud}>{selectedBericht.inhoud}</Text>
                <View style={styles.detailGelezen}>
                  <Text style={styles.detailGelezenTitle}>Gelezen door ({selectedBericht.gelezen_door.length})</Text>
                  {selectedBericht.gelezen_door.length === 0 ? (
                    <Text style={styles.detailGelezenEmpty}>Nog niemand</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {selectedBericht.gelezen_door.map((uid, i) => {
                        const w = werknemers.find(wk => wk.id === uid);
                        return (
                          <View key={i} style={styles.gelezenChip}>
                            <Text style={styles.gelezenChipText}>{w?.naam || uid}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </ScrollView>
              <View style={styles.detailActions}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#dc354515' }]} onPress={() => deleteBericht(selectedBericht.id)}>
                  <Ionicons name="trash-outline" size={18} color="#dc3545" />
                  <Text style={{ color: '#dc3545', fontWeight: '600' }}>Verwijderen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* New Message Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nieuw bericht</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Broadcast toggle */}
              <TouchableOpacity style={styles.broadcastToggle} activeOpacity={0.7}
                onPress={() => setForm({ ...form, is_broadcast: !form.is_broadcast, naar_id: '' })}>
                <Ionicons name="megaphone-outline" size={20} color={form.is_broadcast ? '#3498db' : '#6c757d'} />
                <Text style={{ flex: 1, fontSize: 14, color: '#1A1A2E' }}>Verstuur naar alle werknemers (broadcast)</Text>
                <View style={[styles.toggle, form.is_broadcast && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, form.is_broadcast && styles.toggleThumbActive]} />
                </View>
              </TouchableOpacity>

              {/* Select Worker (if not broadcast) */}
              {!form.is_broadcast && (
                <>
                  <Text style={styles.label}>Naar werknemer *</Text>
                  <View style={styles.workerList}>
                    {werknemers.map(w => (
                      <TouchableOpacity key={w.id} style={[styles.workerOption, form.naar_id === w.id && styles.workerOptionActive]}
                        onPress={() => setForm({ ...form, naar_id: w.id })}>
                        <View style={[styles.workerAvatar, form.naar_id === w.id && { backgroundColor: '#F5A623' }]}>
                          <Text style={[styles.workerAvatarText, form.naar_id === w.id && { color: '#fff' }]}>{w.naam?.charAt(0)}</Text>
                        </View>
                        <Text style={[styles.workerOptionName, form.naar_id === w.id && { color: '#F5A623', fontWeight: '600' }]}>{w.naam}</Text>
                        {form.naar_id === w.id && <Ionicons name="checkmark-circle" size={18} color="#F5A623" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.label}>Onderwerp *</Text>
              <TextInput style={styles.input} value={form.onderwerp} onChangeText={v => setForm({ ...form, onderwerp: v })}
                placeholder="Onderwerp van het bericht" placeholderTextColor="#999" />

              <Text style={styles.label}>Bericht *</Text>
              <TextInput style={[styles.input, { minHeight: 120 }]} value={form.inhoud} onChangeText={v => setForm({ ...form, inhoud: v })}
                placeholder="Schrijf uw bericht..." placeholderTextColor="#999" multiline textAlignVertical="top" />

              {/* Pin toggle */}
              <TouchableOpacity style={styles.pinToggle} activeOpacity={0.7}
                onPress={() => setForm({ ...form, vastgepind: !form.vastgepind })}>
                <Ionicons name="pin-outline" size={18} color={form.vastgepind ? '#F5A623' : '#6c757d'} />
                <Text style={{ flex: 1, fontSize: 14, color: '#1A1A2E' }}>Bericht vastpinnen (bovenaan tonen)</Text>
                <View style={[styles.toggle, form.vastgepind && { backgroundColor: '#F5A623' }]}>
                  <View style={[styles.toggleThumb, form.vastgepind && styles.toggleThumbActive]} />
                </View>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={sendBericht} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Versturen</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5A623', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#6c757d', marginTop: 6 },

  berichtenList: { gap: 12 },
  berichtCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  berichtPinned: { borderColor: '#F5A62350', backgroundColor: '#FFFCF5' },
  berichtHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  berichtFrom: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  berichtAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5A62320', alignItems: 'center', justifyContent: 'center' },
  berichtAvatarText: { fontSize: 14, fontWeight: '600', color: '#F5A623' },
  berichtFromName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  berichtTo: { fontSize: 12, color: '#6c757d' },
  berichtDate: { fontSize: 11, color: '#999' },
  berichtSubject: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  berichtInhoud: { fontSize: 13, color: '#6c757d', lineHeight: 18 },
  berichtFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5F6FA' },
  berichtTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  berichtGelezen: { fontSize: 11, color: '#999' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 8, marginTop: 16, fontWeight: '500' },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },

  broadcastToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F6FA', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED' },
  pinToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F6FA', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', marginTop: 16 },
  toggle: { width: 48, height: 26, borderRadius: 13, backgroundColor: '#E8E9ED', padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: '#3498db' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: 'flex-start' },
  toggleThumbActive: { alignSelf: 'flex-end' },

  workerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workerOption: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6FA', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E8E9ED' },
  workerOptionActive: { borderColor: '#F5A623', backgroundColor: '#F5A62310' },
  workerAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E8E9ED', alignItems: 'center', justifyContent: 'center' },
  workerAvatarText: { fontSize: 12, fontWeight: '600', color: '#6c757d' },
  workerOptionName: { fontSize: 13, color: '#1A1A2E' },

  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  detailMeta: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, marginBottom: 16 },
  detailFrom: { fontSize: 14, color: '#1A1A2E', fontWeight: '600' },
  detailTo: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  detailDate: { fontSize: 12, color: '#999', marginTop: 4 },
  detailSubject: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  detailInhoud: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  detailGelezen: { marginTop: 20, backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14 },
  detailGelezenTitle: { fontSize: 13, fontWeight: '600', color: '#6c757d' },
  detailGelezenEmpty: { fontSize: 12, color: '#999', marginTop: 6, fontStyle: 'italic' },
  gelezenChip: { backgroundColor: '#28a74520', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  gelezenChipText: { fontSize: 12, color: '#28a745', fontWeight: '500' },

  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
});
