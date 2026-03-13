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

interface Team {
  id: string;
  naam: string;
}

export default function WerknemersAdmin() {
  const { user } = useAuth();
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRol, setFilterRol] = useState<string | null>(null);
  const [filterActief, setFilterActief] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingWerknemer, setEditingWerknemer] = useState<Werknemer | null>(null);
  const [formData, setFormData] = useState({ naam: '', email: '', rol: 'werknemer', password: '', team_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    if (Platform.OS === 'web' && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchData(); 
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [werknemersRes, teamsRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/users`),
        fetch(`${API_URL}/api/teams`),
      ]);
      const werknemersData = await werknemersRes.json();
      const teamsData = await teamsRes.json();
      setWerknemers(Array.isArray(werknemersData) ? werknemersData : []);
      setTeams(Array.isArray(teamsData) ? teamsData : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingWerknemer(null);
    setFormData({ naam: '', email: '', rol: 'werknemer', password: '', team_id: '' });
    setShowModal(true);
  };

  const openEditModal = (w: Werknemer) => {
    setEditingWerknemer(w);
    setFormData({ naam: w.naam, email: w.email, rol: w.rol, password: '', team_id: w.team_id || '' });
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
            team_id: formData.team_id || null,
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
      fetchData();
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
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const deleteWerknemer = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze werknemer wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/auth/users/${id}`, { method: 'DELETE' });
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

  let filtered = werknemers;
  if (search) {
    filtered = filtered.filter(w =>
      w.naam?.toLowerCase().includes(search.toLowerCase()) ||
      w.email?.toLowerCase().includes(search.toLowerCase())
    );
  }
  if (filterRol) {
    filtered = filtered.filter(w => w.rol === filterRol);
  }
  if (filterActief !== null) {
    filtered = filtered.filter(w => w.actief === filterActief);
  }

  const getTeamNaam = (teamId?: string) => {
    return teams.find(t => t.id === teamId)?.naam || '-';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Werknemers</Text>
          <Text style={styles.subtitle}>{werknemers.length} totaal, {werknemers.filter(w => w.actief).length} actief</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Toevoegen</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6c757d" />
          <TextInput
            style={styles.searchInput}
            placeholder="Zoek op naam of e-mail..."
            placeholderTextColor="#6c757d"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
        <View style={styles.filters}>
          <TouchableOpacity style={[styles.filterChip, !filterRol && styles.filterChipActive]} onPress={() => setFilterRol(null)}>
            <Text style={[styles.filterText, !filterRol && styles.filterTextActive]}>Alle rollen</Text>
          </TouchableOpacity>
          {['werknemer', 'ploegbaas', 'beheerder'].map((rol) => (
            <TouchableOpacity key={rol} style={[styles.filterChip, filterRol === rol && styles.filterChipActive]} onPress={() => setFilterRol(filterRol === rol ? null : rol)}>
              <Text style={[styles.filterText, filterRol === rol && styles.filterTextActive]}>{rol}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
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
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Naam</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>E-mail</Text>
            <Text style={styles.tableHeaderCell}>Rol</Text>
            <Text style={styles.tableHeaderCell}>Team</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'center' }]}>Acties</Text>
          </View>

          {/* Table Rows */}
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen werknemers gevonden</Text>
            </View>
          ) : (
            filtered.map((w, index) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
                onPress={() => router.push(`/admin/werknemer-detail?id=${w.id}` as any)}
              >
                <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{w.naam?.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.cellName}>{w.naam}</Text>
                </View>
                <Text style={[styles.tableCell, { flex: 2 }]}>{w.email}</Text>
                <View style={styles.tableCell}>
                  <View style={[styles.rolBadge, (w.rol === 'beheerder' || w.rol === 'admin') && styles.rolBadgeAdmin]}>
                    <Text style={styles.rolText}>{w.rol}</Text>
                  </View>
                </View>
                <Text style={styles.tableCell}>{getTeamNaam(w.team_id)}</Text>
                <View style={styles.tableCell}>
                  <TouchableOpacity style={[styles.statusBadge, { backgroundColor: w.actief ? '#28a74520' : '#dc354520' }]} onPress={(e) => { e.stopPropagation(); toggleActief(w); }}>
                    <View style={[styles.statusDot, { backgroundColor: w.actief ? '#28a745' : '#dc3545' }]} />
                    <Text style={[styles.statusText, { color: w.actief ? '#28a745' : '#dc3545' }]}>{w.actief ? 'Actief' : 'Inactief'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.tableCell, { flex: 0.5, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); copyAllCredentials(w); }}>
                    <Ionicons name="copy-outline" size={18} color="#F5A623" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); openEditModal(w); }}>
                    <Ionicons name="create-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); deleteWerknemer(w.id); }}>
                    <Ionicons name="trash-outline" size={18} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Add/Edit Modal */}
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
                {['werknemer', 'ploegbaas', 'beheerder'].map((rol) => (
                  <TouchableOpacity key={rol} style={[styles.rolOption, formData.rol === rol && styles.rolOptionActive]} onPress={() => setFormData({ ...formData, rol })}>
                    <Text style={[styles.rolOptionText, formData.rol === rol && styles.rolOptionTextActive]}>{rol}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Team</Text>
              <ScrollView horizontal style={styles.teamSelector}>
                <TouchableOpacity style={[styles.teamOption, !formData.team_id && styles.teamOptionActive]} onPress={() => setFormData({ ...formData, team_id: '' })}>
                  <Text style={[styles.teamOptionText, !formData.team_id && styles.teamOptionTextActive]}>Geen team</Text>
                </TouchableOpacity>
                {teams.map((team) => (
                  <TouchableOpacity key={team.id} style={[styles.teamOption, formData.team_id === team.id && styles.teamOptionActive]} onPress={() => setFormData({ ...formData, team_id: team.id })}>
                    <Text style={[styles.teamOptionText, formData.team_id === team.id && styles.teamOptionTextActive]}>{team.naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerknemer} disabled={saving}>
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5A623', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  filterBar: { marginBottom: 16 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 15, color: '#1A1A2E' },
  filtersScroll: { marginBottom: 16 },
  filters: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  filterChipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  filterText: { fontSize: 13, color: '#6c757d' },
  filterTextActive: { color: '#fff' },
  filterDivider: { width: 1, height: 24, backgroundColor: '#E8E9ED', marginHorizontal: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  tableContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden', marginBottom: 40 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableHeaderCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#6c757d', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5A62320', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '600', color: '#F5A623' },
  cellName: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  rolBadge: { alignSelf: 'flex-start', backgroundColor: '#E8E9ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  rolBadgeAdmin: { backgroundColor: '#F5A62320' },
  rolText: { fontSize: 12, color: '#1A1A2E', fontWeight: '500' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  actionIcon: { padding: 6 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#6c757d', marginTop: 12 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  rolSelector: { flexDirection: 'row', gap: 8 },
  rolOption: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F5F6FA', alignItems: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  rolOptionActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  rolOptionText: { fontSize: 14, color: '#6c757d', fontWeight: '500' },
  rolOptionTextActive: { color: '#fff' },
  teamSelector: { marginTop: 8 },
  teamOption: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F5F6FA', marginRight: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  teamOptionActive: { backgroundColor: '#9b59b6', borderColor: '#9b59b6' },
  teamOptionText: { fontSize: 14, color: '#6c757d' },
  teamOptionTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
