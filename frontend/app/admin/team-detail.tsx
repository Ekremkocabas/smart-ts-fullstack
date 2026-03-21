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
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
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
  email: string;
  rol: string;
}

export default function TeamDetail() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ naam: '', leden: [] as string[], ploegbaas: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && id && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchData();
    }
  }, [user, id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [teamsRes, werknemersRes] = await Promise.all([
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/auth/users`),
      ]);
      
      const teams = await teamsRes.json();
      const werknemersData = await werknemersRes.json();
      
      const foundTeam = teams.find((t: Team) => t.id === id);
      setTeam(foundTeam || null);
      setWerknemers(Array.isArray(werknemersData) ? werknemersData : []);
      
      if (foundTeam) {
        setFormData({
          naam: foundTeam.naam,
          leden: foundTeam.leden || [],
          ploegbaas: foundTeam.ploegbaas || '',
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveTeam = async () => {
    if (!team) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/teams/${team.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naam: formData.naam,
          leden: formData.leden,
          ploegbaas: formData.ploegbaas || null,
        }),
      });
      setShowEditModal(false);
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleLid = (naam: string) => {
    if (formData.leden.includes(naam)) {
      setFormData({ ...formData, leden: formData.leden.filter(l => l !== naam) });
    } else {
      setFormData({ ...formData, leden: [...formData.leden, naam] });
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!team) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Team niet gevonden</Text>
        </View>
      </View>
    );
  }

  const teamLeden = werknemers.filter(w => team.leden?.includes(w.naam));
  const ploegbaasInfo = werknemers.find(w => w.naam === team.ploegbaas);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Team details</Text>
          <Text style={styles.subtitle}>{team.naam}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={() => setShowEditModal(true)}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Team Card */}
      <View style={styles.teamCard}>
        <View style={styles.teamIcon}>
          <Ionicons name="people" size={40} color="#9b59b6" />
        </View>
        <Text style={styles.teamName}>{team.naam}</Text>
        <Text style={styles.teamMeta}>{team.leden?.length || 0} leden</Text>
      </View>

      {/* Ploegbaas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ploegbaas</Text>
        {ploegbaasInfo ? (
          <TouchableOpacity style={styles.ploegbaasCard} onPress={() => router.push(`/admin/werknemer-detail?id=${ploegbaasInfo.id}` as any)}>
            <View style={styles.ploegbaasAvatar}>
              <Text style={styles.ploegbaasAvatarText}>{ploegbaasInfo.naam.charAt(0)}</Text>
            </View>
            <View style={styles.ploegbaasInfo}>
              <Text style={styles.ploegbaasName}>{ploegbaasInfo.naam}</Text>
              <Text style={styles.ploegbaasEmail}>{ploegbaasInfo.email}</Text>
            </View>
            <View style={styles.ploegbaasBadge}>
              <Ionicons name="star" size={16} color="#F5A623" />
              <Text style={styles.ploegbaasBadgeText}>Ploegbaas</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyPloegbaas}>
            <Ionicons name="person-outline" size={32} color="#E8E9ED" />
            <Text style={styles.emptyText}>Geen ploegbaas aangewezen</Text>
          </View>
        )}
      </View>

      {/* Team Leden */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Teamleden ({teamLeden.length})</Text>
        {teamLeden.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#E8E9ED" />
            <Text style={styles.emptyText}>Geen teamleden</Text>
          </View>
        ) : (
          <View style={styles.ledenList}>
            {teamLeden.map((lid) => (
              <TouchableOpacity key={lid.id} style={styles.lidCard} onPress={() => router.push(`/admin/werknemer-detail?id=${lid.id}` as any)}>
                <View style={styles.lidAvatar}>
                  <Text style={styles.lidAvatarText}>{lid.naam.charAt(0)}</Text>
                </View>
                <View style={styles.lidInfo}>
                  <Text style={styles.lidName}>{lid.naam}</Text>
                  <Text style={styles.lidEmail}>{lid.email}</Text>
                </View>
                {lid.naam === team.ploegbaas && (
                  <View style={styles.starBadge}>
                    <Ionicons name="star" size={14} color="#F5A623" />
                  </View>
                )}
                <Ionicons name="chevron-forward" size={20} color="#6c757d" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Team bewerken</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Teamnaam</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} />
              
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  headerCenter: { flex: 1, marginLeft: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d' },
  editBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#9b59b6', alignItems: 'center', justifyContent: 'center' },
  teamCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#E8E9ED' },
  teamIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#9b59b620', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  teamName: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  teamMeta: { fontSize: 15, color: '#6c757d', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  ploegbaasCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  ploegbaasAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  ploegbaasAvatarText: { fontSize: 20, fontWeight: '600', color: '#fff' },
  ploegbaasInfo: { flex: 1, marginLeft: 12 },
  ploegbaasName: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  ploegbaasEmail: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  ploegbaasBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5A62320', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  ploegbaasBadgeText: { fontSize: 12, fontWeight: '600', color: '#F5A623' },
  emptyPloegbaas: { alignItems: 'center', padding: 32, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  ledenList: { gap: 8 },
  lidCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E8E9ED' },
  lidAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#9b59b620', alignItems: 'center', justifyContent: 'center' },
  lidAvatarText: { fontSize: 16, fontWeight: '600', color: '#9b59b6' },
  lidInfo: { flex: 1, marginLeft: 12 },
  lidName: { fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  lidEmail: { fontSize: 13, color: '#6c757d' },
  starBadge: { marginRight: 8 },
  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  emptyText: { fontSize: 14, color: '#6c757d', marginTop: 12 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
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
