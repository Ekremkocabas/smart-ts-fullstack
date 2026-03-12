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

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Werf {
  id: string;
  naam: string;
  adres?: string;
  klant_id?: string;
  klant_naam?: string;
  werfleider?: string;
  actief: boolean;
}

interface Klant {
  id: string;
  naam: string;
}

export default function WervenAdmin() {
  const { user } = useAuth();
  const [werven, setWerven] = useState<Werf[]>([]);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWerf, setEditingWerf] = useState<Werf | null>(null);
  const [formData, setFormData] = useState({ naam: '', adres: '', klant_id: '', werfleider: '' });
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [wervenRes, klantenRes] = await Promise.all([
        fetch(`${API_URL}/api/werven`),
        fetch(`${API_URL}/api/klanten`),
      ]);
      setWerven(await wervenRes.json());
      setKlanten(await klantenRes.json());
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingWerf(null);
    setFormData({ naam: '', adres: '', klant_id: '', werfleider: '' });
    setShowModal(true);
  };

  const openEditModal = (w: Werf) => {
    setEditingWerf(w);
    setFormData({ naam: w.naam, adres: w.adres || '', klant_id: w.klant_id || '', werfleider: w.werfleider || '' });
    setShowModal(true);
  };

  const saveWerf = async () => {
    if (!formData.naam.trim()) { alert('Naam is verplicht'); return; }
    setSaving(true);
    const klant = klanten.find(k => k.id === formData.klant_id);
    try {
      if (editingWerf) {
        await fetch(`${API_URL}/api/werven/${editingWerf.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...editingWerf, ...formData, klant_naam: klant?.naam }),
        });
      } else {
        await fetch(`${API_URL}/api/werven`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, klant_naam: klant?.naam, actief: true }),
        });
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteWerf = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze werf wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/werven/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const filtered = werven.filter(w =>
    w.naam?.toLowerCase().includes(search.toLowerCase()) ||
    w.klant_naam?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Werven</Text>
          <Text style={styles.subtitle}>{werven.length} totaal</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#6c757d" />
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek werf..."
          placeholderTextColor="#6c757d"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list}>
          {filtered.map((w) => (
            <TouchableOpacity key={w.id} style={[styles.card, !w.actief && { opacity: 0.6 }]} onPress={() => openEditModal(w)}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: '#e67e2220' }]}>
                  <Ionicons name="business" size={24} color="#e67e22" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{w.naam}</Text>
                  {w.klant_naam && <Text style={styles.cardSub}>Klant: {w.klant_naam}</Text>}
                  {w.adres && <Text style={styles.cardSub}>{w.adres}</Text>}
                  {w.werfleider && <Text style={styles.cardSub}>Werfleider: {w.werfleider}</Text>}
                </View>
                <TouchableOpacity onPress={() => deleteWerf(w.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={22} color="#dc3545" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
              <Text style={styles.label}>Naam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Werfnaam" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Klant</Text>
              <ScrollView horizontal style={styles.klantScroll}>
                {klanten.map((k) => (
                  <TouchableOpacity key={k.id} style={[styles.klantChip, formData.klant_id === k.id && styles.klantChipActive]} onPress={() => setFormData({ ...formData, klant_id: k.id })}>
                    <Text style={[styles.klantChipText, formData.klant_id === k.id && styles.klantChipTextActive]}>{k.naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} value={formData.adres} onChangeText={(v) => setFormData({ ...formData, adres: v })} placeholder="Straat, nr, postcode, stad" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Werfleider</Text>
              <TextInput style={styles.input} value={formData.werfleider} onChangeText={(v) => setFormData({ ...formData, werfleider: v })} placeholder="Naam werfleider" placeholderTextColor="#6c757d" />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerf} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Opslaan</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, marginLeft: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#6c757d' },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e67e22', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 16, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 16, color: '#1A1A2E' },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  cardSub: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  deleteBtn: { padding: 8 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  klantScroll: { marginBottom: 8 },
  klantChip: { backgroundColor: '#F5F6FA', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  klantChipActive: { backgroundColor: '#e67e22', borderColor: '#e67e22' },
  klantChipText: { color: '#6c757d', fontSize: 14 },
  klantChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#e67e22', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});