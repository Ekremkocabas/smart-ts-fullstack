import React, { useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import { useAuth, apiClient } from '../../context/AuthContext';
import Constants from 'expo-constants';

// Determine API URL - ALWAYS use window.location.origin for web production
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    // Production - use current origin, NO env variables
    return window.location.origin;
  }
  // Mobile only
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

interface Werf {
  id: string;
  naam: string;
  adres?: string;
  klant_id?: string;
  klant_naam?: string;
  werfleider?: string;
  werfleider_email?: string;
  actief: boolean;
}

interface Klant {
  id: string;
  naam: string;
}

export default function WervenAdmin() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [werven, setWerven] = useState<Werf[]>([]);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActief, setFilterActief] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingWerf, setEditingWerf] = useState<Werf | null>(null);
  const [formData, setFormData] = useState({ naam: '', adres: '', klant_id: '', werfleider: '', werfleider_email: '' });
  const [saving, setSaving] = useState(false);

  // Helper to create auth headers
  const getAuthConfig = () => ({
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  useEffect(() => { 
    if (Platform.OS === 'web' && !authLoading && token && (user?.rol === 'beheerder' || user?.rol === 'admin' || user?.rol === 'master_admin' || user?.rol === 'manager')) {
      fetchData(); 
    }
  }, [user, token, authLoading]);

  const fetchData = async () => {
    if (!token) {
      console.warn('No token available for API requests');
      return;
    }
    try {
      setLoading(true);
      const [wervenRes, klantenRes] = await Promise.all([
        apiClient.get('/api/werven', getAuthConfig()),
        apiClient.get('/api/klanten', getAuthConfig()),
      ]);
      setWerven(Array.isArray(wervenRes.data) ? wervenRes.data : []);
      setKlanten(Array.isArray(klantenRes.data) ? klantenRes.data : []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingWerf(null);
    setFormData({ naam: '', adres: '', klant_id: '', werfleider: '', werfleider_email: '' });
    setShowModal(true);
  };

  const openEditModal = (w: Werf) => {
    setEditingWerf(w);
    setFormData({ naam: w.naam, adres: w.adres || '', klant_id: w.klant_id || '', werfleider: w.werfleider || '', werfleider_email: w.werfleider_email || '' });
    setShowModal(true);
  };

  const saveWerf = async () => {
    if (!formData.naam.trim()) { alert('Naam is verplicht'); return; }
    if (!formData.klant_id) { alert('Selecteer een klant'); return; }
    if (!token) { alert('Sessie verlopen, log opnieuw in'); return; }
    
    setSaving(true);
    const klant = klanten.find(k => k.id === formData.klant_id);
    try {
      if (editingWerf) {
        await apiClient.put(`/api/werven/${editingWerf.id}`, { ...editingWerf, ...formData, klant_naam: klant?.naam }, getAuthConfig());
      } else {
        await apiClient.post('/api/werven', { 
          naam: formData.naam, 
          klant_id: formData.klant_id, 
          klant_naam: klant?.naam,
          adres: formData.adres, 
          werfleider: formData.werfleider, 
          werfleider_email: formData.werfleider_email,
          actief: true
        }, getAuthConfig());
      }
      setShowModal(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving werf:', error);
      alert(error.response?.data?.detail || 'Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  const toggleActief = async (w: Werf) => {
    if (!token) { alert('Sessie verlopen'); return; }
    try {
      await apiClient.put(`/api/werven/${w.id}`, { ...w, actief: !w.actief }, getAuthConfig());
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const deleteWerf = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze werf wilt verwijderen?')) return;
    if (!token) { alert('Sessie verlopen'); return; }
    try {
      await apiClient.delete(`/api/werven/${id}`, getAuthConfig());
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  if (Platform.OS !== 'web') return null;
  
  if (user?.rol !== 'beheerder' && user?.rol !== 'admin') {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
        </View>
      </View>
    );
  }

  let filtered = werven;
  if (search) {
    filtered = filtered.filter(w => w.naam?.toLowerCase().includes(search.toLowerCase()) || w.klant_naam?.toLowerCase().includes(search.toLowerCase()));
  }
  if (filterActief !== null) {
    filtered = filtered.filter(w => w.actief === filterActief);
  }

  const getKlantNaam = (klantId?: string) => klanten.find(k => k.id === klantId)?.naam || '-';

  const exportWerven = (format: 'csv' | 'pdf') => {
    const data = filtered;
    if (format === 'csv') {
      const headers = ['Naam', 'Adres', 'Klant', 'Werfleider', 'Werfleider E-mail', 'Status'];
      const rows = data.map(w => [w.naam, w.adres || '', w.klant_naam || getKlantNaam(w.klant_id), w.werfleider || '', w.werfleider_email || '', w.actief ? 'Actief' : 'Inactief']
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Werven_Export.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } else {
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:20px;color:#1A1A2E}h1{color:#F5A623;font-size:22px;border-bottom:2px solid #F5A623;padding-bottom:8px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}th{background:#1A1A2E;color:#fff;padding:8px 10px;text-align:left}td{padding:6px 10px;border-bottom:1px solid #E8E9ED}tr:nth-child(even){background:#F5F6FA}.meta{color:#6c757d;font-size:12px}.footer{margin-top:20px;text-align:center;color:#999;font-size:10px;border-top:1px solid #E8E9ED;padding-top:8px}</style></head><body>
      <h1>Smart-Tech BV - Werven Overzicht</h1><p class="meta">${data.length} werven | ${new Date().toLocaleDateString('nl-BE')}</p>
      <table><tr><th>Naam</th><th>Adres</th><th>Klant</th><th>Werfleider</th><th>E-mail</th><th>Status</th></tr>`;
      data.forEach(w => { html += `<tr><td><strong>${w.naam}</strong></td><td>${w.adres||'-'}</td><td>${w.klant_naam||getKlantNaam(w.klant_id)}</td><td>${w.werfleider||'-'}</td><td>${w.werfleider_email||'-'}</td><td>${w.actief?'Actief':'Inactief'}</td></tr>`; });
      html += `</table><div class="footer">Smart-Tech BV - ${new Date().toLocaleString('nl-BE')}</div></body></html>`;
      const win = window.open('', '_blank'); if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Werven</Text>
          <Text style={styles.subtitle}>{werven.length} werven, {werven.filter(w => w.actief !== false).length} actief</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#27ae60', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => exportWerven('csv')}>
            <Ionicons name="document-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1A1A2E', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => exportWerven('pdf')}>
            <Ionicons name="print-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.addBtnText}>Nieuwe werf</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6c757d" />
          <TextInput style={styles.searchInput} placeholder="Zoek op naam of klant..." placeholderTextColor="#6c757d" value={search} onChangeText={setSearch} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
        <View style={styles.filters}>
          <TouchableOpacity style={[styles.filterChip, filterActief === null && styles.filterChipActive]} onPress={() => setFilterActief(null)}>
            <Text style={[styles.filterText, filterActief === null && styles.filterTextActive]}>Alle statussen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterChip, filterActief === true && styles.filterChipActive]} onPress={() => setFilterActief(filterActief === true ? null : true)}>
            <View style={[styles.statusDot, { backgroundColor: '#28a745' }]} />
            <Text style={[styles.filterText, filterActief === true && styles.filterTextActive]}>Actief</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterChip, filterActief === false && styles.filterChipActive]} onPress={() => setFilterActief(filterActief === false ? null : false)}>
            <View style={[styles.statusDot, { backgroundColor: '#dc3545' }]} />
            <Text style={[styles.filterText, filterActief === false && styles.filterTextActive]}>Inactief</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Werf</Text>
            <Text style={styles.tableHeaderCell}>Klant</Text>
            <Text style={styles.tableHeaderCell}>Werfleider</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'center' }]}>Acties</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen werven gevonden</Text>
            </View>
          ) : (
            filtered.map((w, index) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
                onPress={() => router.push(`/admin/werf-detail?id=${w.id}` as any)}
              >
                <View style={[styles.tableCell, { flex: 2 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={styles.werfIcon}>
                      <Ionicons name="business" size={20} color="#e67e22" />
                    </View>
                    <View>
                      <Text style={styles.werfName}>{w.naam}</Text>
                      {w.adres && <Text style={styles.werfAdres}>{w.adres}</Text>}
                    </View>
                  </View>
                </View>
                <Text style={styles.tableCell}>{w.klant_naam || getKlantNaam(w.klant_id)}</Text>
                <View style={styles.tableCell}>
                  {w.werfleider ? (
                    <View>
                      <Text style={styles.werfleiderName}>{w.werfleider}</Text>
                      {w.werfleider_email && <Text style={styles.werfleiderEmail}>{w.werfleider_email}</Text>}
                    </View>
                  ) : (
                    <Text style={styles.emptyValue}>-</Text>
                  )}
                </View>
                <View style={styles.tableCell}>
                  <TouchableOpacity style={[styles.statusBadge, { backgroundColor: w.actief !== false ? '#28a74520' : '#dc354520' }]} onPress={(e) => { e.stopPropagation(); toggleActief(w); }}>
                    <View style={[styles.statusDot, { backgroundColor: w.actief !== false ? '#28a745' : '#dc3545' }]} />
                    <Text style={[styles.statusText, { color: w.actief !== false ? '#28a745' : '#dc3545' }]}>{w.actief !== false ? 'Actief' : 'Inactief'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.tableCell, { flex: 0.5, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); openEditModal(w); }}>
                    <Ionicons name="create-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); deleteWerf(w.id); }}>
                    <Ionicons name="trash-outline" size={18} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingWerf ? 'Werf bewerken' : 'Nieuwe werf'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Werfnaam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Werfnaam" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Klant *</Text>
              <ScrollView horizontal style={styles.klantScroll}>
                {klanten.map((k) => (
                  <TouchableOpacity key={k.id} style={[styles.klantChip, formData.klant_id === k.id && styles.klantChipActive]} onPress={() => setFormData({ ...formData, klant_id: k.id })}>
                    <Text style={[styles.klantChipText, formData.klant_id === k.id && styles.klantChipTextActive]}>{k.naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} value={formData.adres} onChangeText={(v) => setFormData({ ...formData, adres: v })} placeholder="Straat, nr, postcode, stad" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Werfleider naam</Text>
              <TextInput style={styles.input} value={formData.werfleider} onChangeText={(v) => setFormData({ ...formData, werfleider: v })} placeholder="Naam werfleider" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Werfleider e-mail</Text>
              <TextInput style={styles.input} value={formData.werfleider_email} onChangeText={(v) => setFormData({ ...formData, werfleider_email: v })} placeholder="email@voorbeeld.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerf} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Opslaan</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e67e22', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  filterBar: { marginBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 15, color: '#1A1A2E' },
  filtersScroll: { marginBottom: 16 },
  filters: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  filterChipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  filterText: { fontSize: 13, color: '#6c757d' },
  filterTextActive: { color: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  tableContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden', marginBottom: 40 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableHeaderCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#6c757d', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1 },
  werfIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#e67e2220', alignItems: 'center', justifyContent: 'center' },
  werfName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  werfAdres: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  werfleiderName: { fontSize: 14, color: '#1A1A2E' },
  werfleiderEmail: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  emptyValue: { color: '#adb5bd', fontSize: 13 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  actionIcon: { padding: 6 },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  klantScroll: { marginBottom: 8 },
  klantChip: { backgroundColor: '#F5F6FA', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  klantChipActive: { backgroundColor: '#1abc9c', borderColor: '#1abc9c' },
  klantChipText: { color: '#6c757d', fontSize: 14 },
  klantChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#e67e22', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
