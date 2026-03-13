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

  // ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
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
        await fetch(`${API_URL}/api/klanten/${editingKlant.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...editingKlant, ...formData }),
        });
      } else {
        await fetch(`${API_URL}/api/klanten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ naam: formData.naam, email: formData.email, telefoon: formData.telefoon, adres: formData.adres }),
        });
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

  // CONDITIONAL RETURNS AFTER ALL HOOKS
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
    k.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Klanten</Text>
          <Text style={styles.subtitle}>{klanten.length} totaal</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#6c757d" />
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek klant..."
          placeholderTextColor="#6c757d"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list}>
          {filtered.map((k) => (
            <TouchableOpacity key={k.id} style={styles.card} onPress={() => openEditModal(k)}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: '#1abc9c20' }]}>
                  <Ionicons name="briefcase" size={24} color="#1abc9c" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{k.naam}</Text>
                  {k.contactpersoon && <Text style={styles.cardSub}>Contact: {k.contactpersoon}</Text>}
                  {k.email && <Text style={styles.cardSub}>{k.email}</Text>}
                  {k.telefoon && <Text style={styles.cardSub}>{k.telefoon}</Text>}
                </View>
                <TouchableOpacity onPress={() => deleteKlant(k.id)} style={styles.deleteBtn}>
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
              <Text style={styles.modalTitle}>{editingKlant ? 'Klant bewerken' : 'Nieuwe klant'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Naam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Bedrijfsnaam" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>E-mail *</Text>
              <TextInput style={styles.input} value={formData.email} onChangeText={(v) => setFormData({ ...formData, email: v })} placeholder="email@voorbeeld.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
              <Text style={styles.label}>Telefoon</Text>
              <TextInput style={styles.input} value={formData.telefoon} onChangeText={(v) => setFormData({ ...formData, telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} value={formData.adres} onChangeText={(v) => setFormData({ ...formData, adres: v })} placeholder="Straat, nr, postcode, stad" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>Contactpersoon</Text>
              <TextInput style={styles.input} value={formData.contactpersoon} onChangeText={(v) => setFormData({ ...formData, contactpersoon: v })} placeholder="Naam contactpersoon" placeholderTextColor="#6c757d" />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveKlant} disabled={saving}>
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
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1abc9c', alignItems: 'center', justifyContent: 'center' },
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
  saveBtn: { backgroundColor: '#1abc9c', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
