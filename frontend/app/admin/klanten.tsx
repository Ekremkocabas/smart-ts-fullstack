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
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

interface Klant {
  id: string;
  naam: string;
  email?: string;
  telefoon?: string;
  adres?: string;
  contactpersoon?: string;
  actief: boolean;
}

export default function KlantenAdmin() {
  const { user } = useAuth();
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingKlant, setEditingKlant] = useState<Klant | null>(null);
  const [formData, setFormData] = useState({ naam: '', email: '', telefoon: '', adres: '', contactpersoon: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    if (Platform.OS === 'web' && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchKlanten(); 
    }
  }, [user]);

  const fetchKlanten = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/klanten`);
      const data = await res.json();
      setKlanten(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingKlant(null);
    setFormData({ naam: '', email: '', telefoon: '', adres: '', contactpersoon: '' });
    setShowModal(true);
  };

  const openEditModal = (k: Klant) => {
    setEditingKlant(k);
    setFormData({ naam: k.naam, email: k.email || '', telefoon: k.telefoon || '', adres: k.adres || '', contactpersoon: k.contactpersoon || '' });
    setShowModal(true);
  };

  const saveKlant = async () => {
    if (!formData.naam.trim()) { alert('Naam is verplicht'); return; }
    if (!formData.email.trim()) { alert('Email is verplicht'); return; }
    setSaving(true);
    try {
      if (editingKlant) {
        await fetch(`${API_URL}/api/klanten/${editingKlant.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editingKlant, ...formData }) });
      } else {
        await fetch(`${API_URL}/api/klanten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: formData.naam, email: formData.email, telefoon: formData.telefoon, adres: formData.adres, contactpersoon: formData.contactpersoon }) });
      }
      setShowModal(false);
      fetchKlanten();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteKlant = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze klant wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/klanten/${id}`, { method: 'DELETE' });
      fetchKlanten();
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

  const filtered = klanten.filter(k =>
    k.naam?.toLowerCase().includes(search.toLowerCase()) ||
    k.email?.toLowerCase().includes(search.toLowerCase()) ||
    k.contactpersoon?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Klanten</Text>
          <Text style={styles.subtitle}>{klanten.length} klanten</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Nieuwe klant</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6c757d" />
        <TextInput style={styles.searchInput} placeholder="Zoek op naam, e-mail of contactpersoon..." placeholderTextColor="#6c757d" value={search} onChangeText={setSearch} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Bedrijf</Text>
            <Text style={styles.tableHeaderCell}>Contactpersoon</Text>
            <Text style={styles.tableHeaderCell}>E-mail</Text>
            <Text style={styles.tableHeaderCell}>Telefoon</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'center' }]}>Acties</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen klanten gevonden</Text>
            </View>
          ) : (
            filtered.map((k, index) => (
              <TouchableOpacity
                key={k.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
                onPress={() => router.push(`/admin/klant-detail?id=${k.id}` as any)}
              >
                <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                  <View style={styles.klantIcon}>
                    <Ionicons name="briefcase" size={20} color="#1abc9c" />
                  </View>
                  <Text style={styles.klantName}>{k.naam}</Text>
                </View>
                <Text style={styles.tableCell}>{k.contactpersoon || '-'}</Text>
                <Text style={styles.tableCell}>{k.email || '-'}</Text>
                <Text style={styles.tableCell}>{k.telefoon || '-'}</Text>
                <View style={[styles.tableCell, { flex: 0.5, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); openEditModal(k); }}>
                    <Ionicons name="create-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); deleteKlant(k.id); }}>
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
              <Text style={styles.modalTitle}>{editingKlant ? 'Klant bewerken' : 'Nieuwe klant'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Bedrijfsnaam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Bedrijfsnaam" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Contactpersoon</Text>
              <TextInput style={styles.input} value={formData.contactpersoon} onChangeText={(v) => setFormData({ ...formData, contactpersoon: v })} placeholder="Naam contactpersoon" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>E-mail *</Text>
              <TextInput style={styles.input} value={formData.email} onChangeText={(v) => setFormData({ ...formData, email: v })} placeholder="email@voorbeeld.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
              <Text style={styles.label}>Telefoon</Text>
              <TextInput style={styles.input} value={formData.telefoon} onChangeText={(v) => setFormData({ ...formData, telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} value={formData.adres} onChangeText={(v) => setFormData({ ...formData, adres: v })} placeholder="Straat, nr, postcode, stad" placeholderTextColor="#6c757d" />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveKlant} disabled={saving}>
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1abc9c', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED', marginBottom: 16 },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 15, color: '#1A1A2E' },
  tableContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden', marginBottom: 40 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableHeaderCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#6c757d', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1, fontSize: 14, color: '#1A1A2E' },
  klantIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1abc9c20', alignItems: 'center', justifyContent: 'center' },
  klantName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
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
  saveBtn: { backgroundColor: '#1abc9c', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
