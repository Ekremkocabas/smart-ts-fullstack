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

interface Team {
  id: string;
  naam: string;
  leden: string[];
  actief: boolean;
}

interface Werknemer {
  id: string;
  naam: string;
  rol: string;
}

export default function TeamsAdmin() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({ naam: '', leden: [] as string[] });
  const [saving, setSaving] = useState(false);

  // ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
  useEffect(() => { 
    if (Platform.OS === 'web' && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchData(); 
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [teamsRes, werknemersRes] = await Promise.all([
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/auth/users`),
      ]);
      const teamsData = await teamsRes.json();
      const werknemersData = await werknemersRes.json();
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      setWerknemers(Array.isArray(werknemersData) ? werknemersData : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingTeam(null);
    setFormData({ naam: '', leden: [] });
    setShowModal(true);
  };

  const openEditModal = (t: Team) => {
    setEditingTeam(t);
    setFormData({ naam: t.naam, leden: t.leden || [] });
    setShowModal(true);
  };

  const toggleLid = (naam: string) => {
    if (formData.leden.includes(naam)) {
      setFormData({ ...formData, leden: formData.leden.filter(l => l !== naam) });
    } else {
      setFormData({ ...formData, leden: [...formData.leden, naam] });
    }
  };

  const saveTeam = async () => {
    if (!formData.naam.trim()) { alert('Naam is verplicht'); return; }
    setSaving(true);
    try {
      const body = {
        naam: formData.naam,
        leden: formData.leden,
      };
      
      if (editingTeam) {
        await fetch(`${API_URL}/api/teams/${editingTeam.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        const res = await fetch(`${API_URL}/api/teams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          console.error('Error response:', err);
          alert('Fout bij aanmaken: ' + JSON.stringify(err));
          setSaving(false);
          return;
        }
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  const deleteTeam = async (id: string) => {
    if (!confirm('Weet u zeker dat u dit team wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/teams/${id}`, { method: 'DELETE' });
      fetchData();
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Teams</Text>
          <Text style={styles.subtitle}>{teams.length} teams</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list}>
          {teams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen teams gevonden</Text>
              <Text style={styles.emptySubtext}>Klik op + om een team toe te voegen</Text>
            </View>
          ) : (
            teams.map((t) => (
              <TouchableOpacity key={t.id} style={styles.card} onPress={() => openEditModal(t)}>
                <View style={styles.cardHeader}>
                  <View style={[styles.avatar, { backgroundColor: '#9b59b620' }]}>
                    <Ionicons name="people" size={24} color="#9b59b6" />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{t.naam}</Text>
                    <Text style={styles.cardSub}>{t.leden?.length || 0} leden</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteTeam(t.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={22} color="#dc3545" />
                  </TouchableOpacity>
                </View>
                <View style={styles.ledenList}>
                  {t.leden?.map((l, idx) => (
                    <View key={idx} style={styles.lidChip}>
                      <Text style={styles.lidText}>{l}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTeam ? 'Team bewerken' : 'Nieuw team'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Teamnaam *</Text>
            <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Team A" placeholderTextColor="#6c757d" />
            <Text style={styles.label}>Teamleden ({formData.leden.length} geselecteerd)</Text>
            <ScrollView style={styles.werknemersList}>
              {werknemers.filter(w => w.rol === 'werknemer' || w.rol === 'ploegbaas').map((w) => {
                const isSelected = formData.leden.includes(w.naam);
                return (
                  <TouchableOpacity key={w.id} style={styles.werknemerRow} onPress={() => toggleLid(w.naam)}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && <Ionicons name="checkmark" size={18} color="#fff" />}
                    </View>
                    <Text style={styles.werknemerNaam}>{w.naam}</Text>
                    <Text style={styles.werknemerRol}>{w.rol}</Text>
                  </TouchableOpacity>
                );
              })}
              {werknemers.filter(w => w.rol === 'werknemer' || w.rol === 'ploegbaas').length === 0 && (
                <Text style={styles.noWerknemers}>Geen werknemers beschikbaar</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveTeam} disabled={saving}>
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
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#9b59b6', alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  cardSub: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  deleteBtn: { padding: 8 },
  ledenList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lidChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F6FA', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  lidText: { fontSize: 13, color: '#1A1A2E' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  werknemersList: { maxHeight: 250, marginTop: 8, borderWidth: 1, borderColor: '#E8E9ED', borderRadius: 10 },
  werknemerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  checkbox: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#E8E9ED', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkboxActive: { backgroundColor: '#9b59b6' },
  werknemerNaam: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  werknemerRol: { fontSize: 12, color: '#6c757d', backgroundColor: '#F5F6FA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  noWerknemers: { textAlign: 'center', color: '#6c757d', padding: 20 },
  saveBtn: { backgroundColor: '#9b59b6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
