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
  created_at?: string;
}

interface Team {
  id: string;
  naam: string;
}

interface Werkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  klant_naam: string;
  werf_naam: string;
  status: string;
}

export default function WerknemerDetail() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [werknemer, setWerknemer] = useState<Werknemer | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [werkbonnen, setWerkbonnen] = useState<Werkbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ naam: '', email: '', rol: 'werknemer', team_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && id && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchData();
    }
  }, [user, id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [werknemersRes, teamsRes, werkbonnenRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/users`),
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/werkbonnen?user_id=admin-001&is_admin=true`),
      ]);
      
      const werknemers = await werknemersRes.json();
      const teamsData = await teamsRes.json();
      const werkbonnenData = await werkbonnenRes.json();
      
      const foundWerknemer = werknemers.find((w: Werknemer) => w.id === id);
      setWerknemer(foundWerknemer || null);
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      
      // Filter werkbonnen for this employee
      const employeeWerkbonnen = (Array.isArray(werkbonnenData) ? werkbonnenData : [])
        .filter((wb: any) => wb.created_by === id || wb.user_id === id);
      setWerkbonnen(employeeWerkbonnen);
      
      if (foundWerknemer) {
        setFormData({
          naam: foundWerknemer.naam,
          email: foundWerknemer.email,
          rol: foundWerknemer.rol,
          team_id: foundWerknemer.team_id || '',
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveWerknemer = async () => {
    if (!werknemer) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/auth/users/${werknemer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...werknemer,
          naam: formData.naam,
          email: formData.email,
          rol: formData.rol,
          team_id: formData.team_id || null,
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

  const toggleActief = async () => {
    if (!werknemer) return;
    try {
      await fetch(`${API_URL}/api/auth/users/${werknemer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...werknemer, actief: !werknemer.actief }),
      });
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    alert(`${label} gekopieerd!`);
  };

  const copyAllCredentials = async () => {
    if (!werknemer) return;
    const text = `E-mail: ${werknemer.email}\nWachtwoord: ${werknemer.tijdelijk_wachtwoord || 'Niet beschikbaar'}`;
    await Clipboard.setStringAsync(text);
    alert('Alle inloggegevens gekopieerd!');
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

  if (!werknemer) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Werknemer niet gevonden</Text>
        </View>
      </View>
    );
  }

  const teamNaam = teams.find(t => t.id === werknemer.team_id)?.naam || 'Geen team';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Werknemer details</Text>
          <Text style={styles.subtitle}>{werknemer.naam}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={() => setShowEditModal(true)}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{werknemer.naam?.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{werknemer.naam}</Text>
            <Text style={styles.profileEmail}>{werknemer.email}</Text>
            <View style={styles.badges}>
              <View style={[styles.badge, werknemer.rol === 'beheerder' && styles.badgeAdmin]}>
                <Text style={styles.badgeText}>{werknemer.rol}</Text>
              </View>
              <View style={[styles.badge, werknemer.actief ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={styles.badgeText}>{werknemer.actief ? 'Actief' : 'Inactief'}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gegevens</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Naam</Text>
            <Text style={styles.detailValue}>{werknemer.naam}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>E-mail</Text>
            <Text style={styles.detailValue}>{werknemer.email}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="shield-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Rol</Text>
            <Text style={styles.detailValue}>{werknemer.rol}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="people-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Team</Text>
            <Text style={styles.detailValue}>{teamNaam}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Status</Text>
            <TouchableOpacity onPress={toggleActief}>
              <Text style={[styles.detailValue, { color: werknemer.actief ? '#28a745' : '#dc3545' }]}>
                {werknemer.actief ? 'Actief' : 'Inactief'} (klik om te wijzigen)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Login Credentials */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inloggegevens</Text>
        <View style={styles.credentialsCard}>
          <View style={styles.credRow}>
            <View>
              <Text style={styles.credLabel}>E-mail</Text>
              <Text style={styles.credValue}>{werknemer.email}</Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(werknemer.email, 'E-mail')}>
              <Ionicons name="copy-outline" size={20} color="#F5A623" />
            </TouchableOpacity>
          </View>
          <View style={styles.credRow}>
            <View>
              <Text style={styles.credLabel}>Wachtwoord</Text>
              <Text style={styles.credValue}>{werknemer.tijdelijk_wachtwoord || '••••••••'}</Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(werknemer.tijdelijk_wachtwoord || '', 'Wachtwoord')}>
              <Ionicons name="copy-outline" size={20} color="#F5A623" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.copyAllBtn} onPress={copyAllCredentials}>
            <Ionicons name="clipboard-outline" size={20} color="#fff" />
            <Text style={styles.copyAllText}>Kopieer alle inloggegevens</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Werkbonnen */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Werkbonnen ({werkbonnen.length})</Text>
        {werkbonnen.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#E8E9ED" />
            <Text style={styles.emptyText}>Geen werkbonnen gevonden</Text>
          </View>
        ) : (
          <View style={styles.werkbonnenList}>
            {werkbonnen.slice(0, 5).map((wb) => (
              <TouchableOpacity key={wb.id} style={styles.werkbonCard} onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}>
                <View style={styles.werkbonLeft}>
                  <Text style={styles.werkbonWeek}>Week {wb.week_nummer}</Text>
                  <Text style={styles.werkbonKlant}>{wb.klant_naam}</Text>
                  <Text style={styles.werkbonWerf}>{wb.werf_naam}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: wb.status === 'verzonden' ? '#F5A623' : wb.status === 'ondertekend' ? '#28a745' : '#ffc107' }]}>
                  <Text style={styles.statusText}>{wb.status}</Text>
                </View>
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
              <Text style={styles.modalTitle}>Werknemer bewerken</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Naam</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} />
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={styles.input} value={formData.email} onChangeText={(v) => setFormData({ ...formData, email: v })} keyboardType="email-address" />
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  headerCenter: { flex: 1, marginLeft: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d' },
  editBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#E8E9ED' },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1, marginLeft: 20 },
  profileName: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  profileEmail: { fontSize: 15, color: '#6c757d', marginTop: 4 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#E8E9ED' },
  badgeAdmin: { backgroundColor: '#F5A623' },
  badgeActive: { backgroundColor: '#28a74520' },
  badgeInactive: { backgroundColor: '#dc354520' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#1A1A2E' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  detailRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED', gap: 12 },
  detailLabel: { flex: 1, fontSize: 14, color: '#6c757d' },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  credentialsCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  credLabel: { fontSize: 12, color: '#6c757d' },
  credValue: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', marginTop: 4 },
  copyBtn: { padding: 8 },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5A623', borderRadius: 10, paddingVertical: 14, marginTop: 16 },
  copyAllText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  werkbonnenList: { gap: 10 },
  werkbonCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  werkbonLeft: { flex: 1 },
  werkbonWeek: { fontSize: 13, fontWeight: '600', color: '#F5A623' },
  werkbonKlant: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', marginTop: 4 },
  werkbonWerf: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
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
