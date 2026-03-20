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

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

interface Team {
  id: string;
  naam: string;
  leden: string[];
  ploegbaas?: string;
  actief: boolean;
}

interface Werknemer {
  id: string;
  naam: string;
  rol: string;
}

export default function TeamsAdmin() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({ naam: '', leden: [] as string[], ploegbaas: '' });
  const [saving, setSaving] = useState(false);

  const getAuthConfig = () => ({
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  useEffect(() => { 
    if (Platform.OS === 'web' && !authLoading && token && ['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
      fetchData(); 
    }
  }, [user, token, authLoading]);

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [teamsRes, werknemersRes] = await Promise.all([
        apiClient.get('/api/teams', getAuthConfig()),
        apiClient.get('/api/auth/users', getAuthConfig()),
      ]);
      setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
      setWerknemers(Array.isArray(werknemersRes.data) ? werknemersRes.data : []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingTeam(null);
    setFormData({ naam: '', leden: [], ploegbaas: '' });
    setShowModal(true);
  };

  const openEditModal = (t: Team) => {
    setEditingTeam(t);
    setFormData({ naam: t.naam, leden: t.leden || [], ploegbaas: t.ploegbaas || '' });
    setShowModal(true);
  };

  const toggleLid = (naam: string) => {
    if (formData.leden.includes(naam)) {
      setFormData({ ...formData, leden: formData.leden.filter(l => l !== naam), ploegbaas: formData.ploegbaas === naam ? '' : formData.ploegbaas });
    } else {
      setFormData({ ...formData, leden: [...formData.leden, naam] });
    }
  };

  const saveTeam = async () => {
    if (!formData.naam.trim()) { alert('Naam is verplicht'); return; }
    if (!token) { alert('Sessie verlopen, log opnieuw in'); return; }
    setSaving(true);
    try {
      const body = { naam: formData.naam, leden: formData.leden, ploegbaas: formData.ploegbaas || null };
      if (editingTeam) {
        await apiClient.put(`/api/teams/${editingTeam.id}`, body, getAuthConfig());
      } else {
        await apiClient.post('/api/teams', body, getAuthConfig());
      }
      setShowModal(false);
      fetchData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.response?.data?.detail || 'Fout bij opslaan');
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

  if (Platform.OS !== 'web') return null;
  
  // Show loading while auth state is being resolved
  if (authLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.loadingText}>Laden...</Text>
        </View>
      </View>
    );
  }
  
  if (!['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Teams</Text>
          <Text style={styles.subtitle}>{teams.length} teams</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Nieuw team</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Team</Text>
            <Text style={styles.tableHeaderCell}>Ploegbaas</Text>
            <Text style={styles.tableHeaderCell}>Leden</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'center' }]}>Acties</Text>
          </View>

          {teams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen teams gevonden</Text>
              <Text style={styles.emptySubtext}>Klik op "Nieuw team" om te beginnen</Text>
            </View>
          ) : (
            teams.map((t, index) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
                onPress={() => router.push(`/admin/team-detail?id=${t.id}` as any)}
              >
                <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                  <View style={styles.teamIcon}>
                    <Ionicons name="people" size={20} color="#9b59b6" />
                  </View>
                  <Text style={styles.teamName}>{t.naam}</Text>
                </View>
                <View style={styles.tableCell}>
                  {t.ploegbaas ? (
                    <View style={styles.ploegbaasBadge}>
                      <Ionicons name="star" size={12} color="#F5A623" />
                      <Text style={styles.ploegbaasText}>{t.ploegbaas}</Text>
                    </View>
                  ) : (
                    <Text style={styles.emptyValue}>-</Text>
                  )}
                </View>
                <View style={styles.tableCell}>
                  <View style={styles.ledenBadge}>
                    <Text style={styles.ledenCount}>{t.leden?.length || 0}</Text>
                    <Text style={styles.ledenLabel}>leden</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, { flex: 0.5, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); openEditModal(t); }}>
                    <Ionicons name="create-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); deleteTeam(t.id); }}>
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
              <Text style={styles.modalTitle}>{editingTeam ? 'Team bewerken' : 'Nieuw team'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Teamnaam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Team A" placeholderTextColor="#6c757d" />
              
              <Text style={styles.label}>Ploegbaas</Text>
              <ScrollView horizontal style={styles.ploegbaasSelector}>
                <TouchableOpacity style={[styles.selectOption, !formData.ploegbaas && styles.selectOptionActive]} onPress={() => setFormData({ ...formData, ploegbaas: '' })}>
                  <Text style={[styles.selectOptionText, !formData.ploegbaas && styles.selectOptionTextActive]}>Geen</Text>
                </TouchableOpacity>
                {formData.leden.map((naam) => (
                  <TouchableOpacity key={naam} style={[styles.selectOption, formData.ploegbaas === naam && styles.selectOptionActive]} onPress={() => setFormData({ ...formData, ploegbaas: naam })}>
                    <Text style={[styles.selectOptionText, formData.ploegbaas === naam && styles.selectOptionTextActive]}>{naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Teamleden ({formData.leden.length})</Text>
              <View style={styles.werknemersList}>
                {werknemers.filter(w => w.rol === 'worker' || w.rol === 'werknemer' || w.rol === 'onderaannemer' || w.rol === 'ploegbaas').map((w) => {
                  const isSelected = formData.leden.includes(w.naam);
                  return (
                    <TouchableOpacity key={w.id} style={styles.werknemerRow} onPress={() => toggleLid(w.naam)}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                        {isSelected && <Ionicons name="checkmark" size={18} color="#fff" />}
                      </View>
                      <Text style={styles.werknemerNaam}>{w.naam}</Text>
                      <View style={[styles.rolBadge, { backgroundColor: w.rol === 'onderaannemer' ? '#e67e2220' : '#27ae6020' }]}>
                        <Text style={[styles.werknemerRol, { color: w.rol === 'onderaannemer' ? '#e67e22' : '#27ae60' }]}>{w.rol}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {werknemers.filter(w => w.rol === 'worker' || w.rol === 'werknemer' || w.rol === 'onderaannemer' || w.rol === 'ploegbaas').length === 0 && (
                  <Text style={styles.noWerknemers}>Geen werknemers beschikbaar</Text>
                )}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveTeam} disabled={saving}>
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#9b59b6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tableContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden', marginBottom: 40 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableHeaderCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#6c757d', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1 },
  teamIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#9b59b620', alignItems: 'center', justifyContent: 'center' },
  teamName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  ploegbaasBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5A62320', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, alignSelf: 'flex-start' },
  ploegbaasText: { fontSize: 13, color: '#F5A623', fontWeight: '500' },
  emptyValue: { color: '#adb5bd', fontSize: 13 },
  ledenBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  ledenCount: { fontSize: 18, fontWeight: '700', color: '#9b59b6' },
  ledenLabel: { fontSize: 12, color: '#6c757d' },
  actionIcon: { padding: 6 },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtext: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6c757d' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  ploegbaasSelector: { marginBottom: 8 },
  selectOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F6FA', marginRight: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  selectOptionActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  selectOptionText: { fontSize: 14, color: '#6c757d' },
  selectOptionTextActive: { color: '#fff' },
  werknemersList: { maxHeight: 250, borderWidth: 1, borderColor: '#E8E9ED', borderRadius: 10, marginTop: 8 },
  werknemerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  checkbox: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#E8E9ED', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkboxActive: { backgroundColor: '#9b59b6' },
  werknemerNaam: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  werknemerRol: { fontSize: 12, color: '#6c757d', backgroundColor: '#F5F6FA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  saveBtn: { backgroundColor: '#9b59b6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
