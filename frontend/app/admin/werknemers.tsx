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
import * as Clipboard from 'expo-clipboard';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

interface Werknemer {
  id: string;
  naam: string;
  email: string;
  rol: string;
  actief: boolean;
  tijdelijk_wachtwoord?: string;
  team_id?: string;
}

export default function WerknemersAdmin() {
  const { user } = useAuth();
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWerknemer, setEditingWerknemer] = useState<Werknemer | null>(null);
  const [formData, setFormData] = useState({ naam: '', email: '', rol: 'werknemer', password: '' });
  const [saving, setSaving] = useState(false);

  // ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
  useEffect(() => { 
    if (Platform.OS === 'web' && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchWerknemers(); 
    }
  }, [user]);

  const fetchWerknemers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/auth/users`);
      const data = await res.json();
      setWerknemers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingWerknemer(null);
    setFormData({ naam: '', email: '', rol: 'werknemer', password: '' });
    setShowModal(true);
  };

  const openEditModal = (w: Werknemer) => {
    setEditingWerknemer(w);
    setFormData({ naam: w.naam, email: w.email, rol: w.rol, password: '' });
    setShowModal(true);
  };

  const saveWerknemer = async () => {
    if (!formData.naam.trim() || !formData.email.trim()) {
      alert('Naam en email zijn verplicht');
      return;
    }
    setSaving(true);
    try {
      if (editingWerknemer) {
        await fetch(`${API_URL}/api/auth/users/${editingWerknemer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            naam: formData.naam,
            email: formData.email,
            rol: formData.rol,
            actief: editingWerknemer.actief,
          }),
        });
      } else {
        const res = await fetch(`${API_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            naam: formData.naam,
            email: formData.email,
            password: formData.password || 'temp123',
            rol: formData.rol,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.detail || 'Fout bij aanmaken');
          setSaving(false);
          return;
        }
      }
      setShowModal(false);
      fetchWerknemers();
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    alert(`${label} gekopieerd!`);
  };

  const copyAllCredentials = async (w: Werknemer) => {
    const text = `Email: ${w.email}\nWachtwoord: ${w.tijdelijk_wachtwoord || 'Niet beschikbaar'}`;
    await Clipboard.setStringAsync(text);
    alert('Inloggegevens gekopieerd!');
  };

  const toggleActief = async (w: Werknemer) => {
    try {
      await fetch(`${API_URL}/api/auth/users/${w.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...w, actief: !w.actief }),
      });
      fetchWerknemers();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const deleteWerknemer = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze werknemer wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/auth/users/${id}`, { method: 'DELETE' });
      fetchWerknemers();
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

  const filtered = werknemers.filter(w =>
    w.naam?.toLowerCase().includes(search.toLowerCase()) ||
    w.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Werknemers</Text>
          <Text style={styles.subtitle}>{werknemers.length} totaal</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#6c757d" />
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek werknemer..."
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
            <View key={w.id} style={[styles.card, !w.actief && styles.cardInactive]}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{w.naam?.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{w.naam}</Text>
                  <Text style={styles.cardEmail}>{w.email}</Text>
                  <View style={styles.badges}>
                    <View style={[styles.roleBadge, (w.rol === 'beheerder' || w.rol === 'admin') && styles.adminBadge]}>
                      <Text style={styles.roleText}>{w.rol}</Text>
                    </View>
                    {!w.actief && <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>Inactief</Text></View>}
                  </View>
                </View>
              </View>

              <View style={styles.credentials}>
                <Text style={styles.credLabel}>Inloggegevens:</Text>
                <View style={styles.credRow}>
                  <Text style={styles.credValue}>{w.email}</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(w.email, 'E-mail')}>
                    <Ionicons name="copy-outline" size={18} color="#F5A623" />
                  </TouchableOpacity>
                </View>
                <View style={styles.credRow}>
                  <Text style={styles.credValue}>{w.tijdelijk_wachtwoord || '••••••'}</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(w.tijdelijk_wachtwoord || '', 'Wachtwoord')}>
                    <Ionicons name="copy-outline" size={18} color="#F5A623" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.copyAllBtn} onPress={() => copyAllCredentials(w)}>
                  <Ionicons name="clipboard-outline" size={16} color="#fff" />
                  <Text style={styles.copyAllText}>Kopieer alle gegevens</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(w)}>
                  <Ionicons name="create-outline" size={22} color="#3498db" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleActief(w)}>
                  <Ionicons name={w.actief ? 'pause-circle' : 'play-circle'} size={22} color={w.actief ? '#ffc107' : '#28a745'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => deleteWerknemer(w.id)}>
                  <Ionicons name="trash-outline" size={22} color="#dc3545" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingWerknemer ? 'Werknemer bewerken' : 'Nieuwe werknemer'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Naam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Volledige naam" placeholderTextColor="#6c757d" />
              <Text style={styles.label}>E-mail *</Text>
              <TextInput style={styles.input} value={formData.email} onChangeText={(v) => setFormData({ ...formData, email: v })} placeholder="email@voorbeeld.be" placeholderTextColor="#6c757d" keyboardType="email-address" autoCapitalize="none" />
              {!editingWerknemer && (
                <>
                  <Text style={styles.label}>Wachtwoord</Text>
                  <TextInput style={styles.input} value={formData.password} onChangeText={(v) => setFormData({ ...formData, password: v })} placeholder="Tijdelijk wachtwoord" placeholderTextColor="#6c757d" />
                </>
              )}
              <Text style={styles.label}>Rol</Text>
              <View style={styles.rolSelector}>
                <TouchableOpacity style={[styles.rolOption, formData.rol === 'werknemer' && styles.rolOptionActive]} onPress={() => setFormData({ ...formData, rol: 'werknemer' })}>
                  <Text style={[styles.rolOptionText, formData.rol === 'werknemer' && styles.rolOptionTextActive]}>Werknemer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.rolOption, formData.rol === 'ploegbaas' && styles.rolOptionActive]} onPress={() => setFormData({ ...formData, rol: 'ploegbaas' })}>
                  <Text style={[styles.rolOptionText, formData.rol === 'ploegbaas' && styles.rolOptionTextActive]}>Ploegbaas</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.rolOption, formData.rol === 'beheerder' && styles.rolOptionActive]} onPress={() => setFormData({ ...formData, rol: 'beheerder' })}>
                  <Text style={[styles.rolOptionText, formData.rol === 'beheerder' && styles.rolOptionTextActive]}>Beheerder</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerknemer} disabled={saving}>
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
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 16, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 16, color: '#1A1A2E' },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  cardInactive: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', marginBottom: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#F5A623' },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  cardEmail: { fontSize: 14, color: '#6c757d', marginTop: 2 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 6 },
  roleBadge: { backgroundColor: '#E8E9ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  adminBadge: { backgroundColor: '#F5A623' },
  roleText: { fontSize: 12, color: '#1A1A2E', fontWeight: '500' },
  inactiveBadge: { backgroundColor: '#dc354520', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  inactiveText: { fontSize: 12, color: '#dc3545' },
  credentials: { backgroundColor: '#F5F6FA', borderRadius: 8, padding: 12, marginBottom: 12 },
  credLabel: { fontSize: 12, color: '#6c757d', marginBottom: 8 },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  credValue: { fontSize: 14, color: '#1A1A2E' },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F5A623', borderRadius: 8, paddingVertical: 10, marginTop: 8 },
  copyAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  actionBtn: { padding: 8 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  rolSelector: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rolOption: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F5F6FA', alignItems: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  rolOptionActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  rolOptionText: { fontSize: 14, color: '#6c757d', fontWeight: '500' },
  rolOptionTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
