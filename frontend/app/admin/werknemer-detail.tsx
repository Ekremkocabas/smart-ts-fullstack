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

const ROLLEN = ['worker', 'onderaannemer', 'planner', 'manager', 'admin'];
const WERKBON_TYPES = [
  { key: 'uren', label: 'Uren Werkbon', icon: 'time-outline', color: '#3498db' },
  { key: 'oplevering', label: 'Oplevering Werkbon', icon: 'checkmark-done-outline', color: '#27ae60' },
  { key: 'project', label: 'Project Werkbon', icon: 'briefcase-outline', color: '#9b59b6' },
  { key: 'productie', label: 'Prestatie Werkbon', icon: 'construct-outline', color: '#e67e22' },
];

interface Werknemer {
  id: string;
  naam: string;
  email: string;
  rol: string;
  actief: boolean;
  telefoon?: string;
  team_id?: string;
  werkbon_types?: string[];
  wachtwoord_plain?: string;
  mag_wachtwoord_wijzigen?: boolean;
  created_at?: string;
}

interface Team { id: string; naam: string; }
interface Werkbon { id: string; week_nummer: number; jaar: number; klant_naam: string; werf_naam: string; status: string; }

export default function WerknemerDetail() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [werknemer, setWerknemer] = useState<Werknemer | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [werkbonnen, setWerkbonnen] = useState<Werkbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    naam: '', email: '', rol: 'werknemer', telefoon: '', password: '',
    werkbon_types: ['uren'] as string[], mag_wachtwoord_wijzigen: false,
  });
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && id) fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, teamsRes, wbRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/users`),
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/werkbonnen?user_id=admin-001&is_admin=true`),
      ]);
      const users = await usersRes.json();
      const teamsData = await teamsRes.json();
      const wbData = await wbRes.json();

      const found = users.find((w: any) => w.id === id);
      setWerknemer(found || null);
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      setWerkbonnen((Array.isArray(wbData) ? wbData : []).filter((wb: any) => wb.created_by === id || wb.user_id === id));

      if (found) {
        setFormData({
          naam: found.naam, email: found.email, rol: found.rol,
          telefoon: found.telefoon || '', password: '',
          werkbon_types: found.werkbon_types || ['uren'],
          mag_wachtwoord_wijzigen: found.mag_wachtwoord_wijzigen || false,
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleWerkbonType = (type: string) => {
    setFormData(prev => {
      const isActive = prev.werkbon_types.includes(type);
      const newTypes = isActive ? prev.werkbon_types.filter(t => t !== type) : [...prev.werkbon_types, type];
      return { ...prev, werkbon_types: newTypes.length > 0 ? newTypes : prev.werkbon_types };
    });
  };

  const saveWerknemer = async () => {
    if (!werknemer) return;
    setSaving(true);
    try {
      const body: any = {
        naam: formData.naam, rol: formData.rol,
        telefoon: formData.telefoon || null,
        werkbon_types: formData.werkbon_types,
        mag_wachtwoord_wijzigen: formData.mag_wachtwoord_wijzigen,
      };
      if (formData.password.trim()) body.wachtwoord_plain = formData.password.trim();

      await fetch(`${API_URL}/api/auth/users/${werknemer.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setShowEditModal(false);
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij opslaan'); }
    finally { setSaving(false); }
  };

  const toggleActief = async () => {
    if (!werknemer) return;
    try {
      await fetch(`${API_URL}/api/auth/users/${werknemer.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actief: !werknemer.actief }),
      });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const resendEmail = async () => {
    if (!werknemer) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/users/${werknemer.id}/resend-info`, { method: 'POST' });
      const result = await res.json();
      if (result.email_sent) {
        alert(`✅ E-mail verstuurd naar ${werknemer.email}\n\nNieuw wachtwoord: ${result.temp_password}`);
      } else {
        alert(`❌ Fout: ${result.email_error || 'Onbekend'}`);
      }
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij verzenden'); }
    finally { setSendingEmail(false); }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try { await Clipboard.setStringAsync(text); alert(`${label} gekopieerd!`); }
    catch { alert('Kopiëren mislukt'); }
  };

  const getRolColor = (rol: string) => {
    switch (rol) {
      case 'admin': case 'master_admin': return '#F5A623';
      case 'manager': return '#9b59b6';
      case 'planner': return '#3498db';
      case 'worker': return '#27ae60';
      case 'onderaannemer': return '#e67e22';
      default: return '#6c757d';
    }
  };

  if (Platform.OS !== 'web') return null;
  if (loading) return <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color="#F5A623" /></View>;
  if (!werknemer) return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#1A1A2E" /></TouchableOpacity>
      <Text style={styles.title}>Werknemer niet gevonden</Text>
    </View>
  );

  const teamNaam = teams.find(t => t.id === werknemer.team_id)?.naam || 'Geen team';
  const wachtwoord = werknemer.wachtwoord_plain || '';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.title}>Werknemer details</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: '#27ae60' }]} onPress={resendEmail} disabled={sendingEmail}>
            {sendingEmail ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="mail-outline" size={20} color="#fff" />}
            <Text style={styles.headerBtnText}>Mail versturen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: '#F5A623' }]} onPress={() => setShowEditModal(true)}>
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.headerBtnText}>Bewerken</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{werknemer.naam?.charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1, marginLeft: 20 }}>
            <Text style={styles.profileName}>{werknemer.naam}</Text>
            <Text style={styles.profileEmail}>{werknemer.email}</Text>
            {werknemer.telefoon ? <Text style={styles.profilePhone}>{werknemer.telefoon}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={[styles.badge, { backgroundColor: getRolColor(werknemer.rol) + '20' }]}>
                <Text style={[styles.badgeText, { color: getRolColor(werknemer.rol) }]}>{werknemer.rol}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: werknemer.actief ? '#28a74520' : '#dc354520' }]}>
                <TouchableOpacity onPress={toggleActief}>
                  <Text style={[styles.badgeText, { color: werknemer.actief ? '#28a745' : '#dc3545' }]}>
                    {werknemer.actief ? '● Actief' : '● Inactief'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Inloggegevens */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Inloggegevens</Text>
        <View style={styles.credRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.credLabel}>E-mail</Text>
            <Text style={styles.credValue}>{werknemer.email}</Text>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(werknemer.email, 'E-mail')}>
            <Ionicons name="copy-outline" size={18} color="#F5A623" />
          </TouchableOpacity>
        </View>
        <View style={styles.credRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.credLabel}>Wachtwoord</Text>
            <Text style={[styles.credValue, { fontFamily: 'monospace' }]}>{wachtwoord || '(niet beschikbaar - gebruik Mail versturen)'}</Text>
          </View>
          {wachtwoord ? (
            <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(wachtwoord, 'Wachtwoord')}>
              <Ionicons name="copy-outline" size={18} color="#F5A623" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.copyAllBtn} onPress={() => copyToClipboard(`E-mail: ${werknemer.email}\nWachtwoord: ${wachtwoord || '(niet beschikbaar)'}`, 'Inloggegevens')}>
          <Ionicons name="clipboard-outline" size={18} color="#fff" />
          <Text style={styles.copyAllText}>Kopieer alle inloggegevens</Text>
        </TouchableOpacity>
      </View>

      {/* Werkbon Types */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Werkbon types</Text>
        <View style={{ gap: 8 }}>
          {WERKBON_TYPES.map(type => {
            const isActive = (werknemer.werkbon_types || ['uren']).includes(type.key);
            return (
              <View key={type.key} style={[styles.werkbonTypeRow, isActive && { borderColor: type.color, backgroundColor: type.color + '08' }]}>
                <Ionicons name={type.icon as any} size={20} color={isActive ? type.color : '#ccc'} />
                <Text style={[styles.werkbonTypeText, isActive && { color: type.color, fontWeight: '600' }]}>{type.label}</Text>
                <View style={[styles.statusPill, { backgroundColor: isActive ? type.color : '#E8E9ED' }]}>
                  <Text style={{ fontSize: 11, color: isActive ? '#fff' : '#999', fontWeight: '600' }}>{isActive ? 'AAN' : 'UIT'}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Gegevens */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Gegevens</Text>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Team</Text><Text style={styles.infoValue}>{teamNaam}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Mag wachtwoord wijzigen</Text><Text style={[styles.infoValue, { color: werknemer.mag_wachtwoord_wijzigen ? '#27ae60' : '#dc3545' }]}>{werknemer.mag_wachtwoord_wijzigen ? 'Ja' : 'Nee'}</Text></View>
      </View>

      {/* Werkbonnen */}
      <View style={[styles.card, { marginBottom: 40 }]}>
        <Text style={styles.sectionTitle}>Werkbonnen ({werkbonnen.length})</Text>
        {werkbonnen.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 30 }}>
            <Ionicons name="document-text-outline" size={40} color="#E8E9ED" />
            <Text style={{ color: '#6c757d', marginTop: 10 }}>Geen werkbonnen</Text>
          </View>
        ) : werkbonnen.slice(0, 5).map(wb => (
          <TouchableOpacity key={wb.id} style={styles.werkbonRow} onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}>
            <Text style={{ fontWeight: '600', color: '#F5A623' }}>Week {wb.week_nummer}</Text>
            <Text style={{ flex: 1, marginLeft: 12, color: '#1A1A2E' }}>{wb.klant_naam} - {wb.werf_naam}</Text>
            <View style={[styles.statusPill, { backgroundColor: wb.status === 'ondertekend' ? '#28a745' : wb.status === 'verzonden' ? '#F5A623' : '#ffc107' }]}>
              <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>{wb.status}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Werknemer bewerken</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Naam</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={v => setFormData({ ...formData, naam: v })} />
              
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={[styles.input, { backgroundColor: '#eee' }]} value={formData.email} editable={false} />
              
              <Text style={styles.label}>Telefoon</Text>
              <TextInput style={styles.input} value={formData.telefoon} onChangeText={v => setFormData({ ...formData, telefoon: v })} placeholder="+32 471 23 45 67" placeholderTextColor="#6c757d" keyboardType="phone-pad" />
              
              <Text style={styles.label}>Huidig wachtwoord</Text>
              <View style={styles.pwdDisplay}>
                <Ionicons name="key-outline" size={18} color="#F5A623" />
                <Text style={styles.pwdText}>{wachtwoord || '(niet beschikbaar)'}</Text>
              </View>
              
              <Text style={styles.label}>Nieuw wachtwoord (optioneel)</Text>
              <TextInput style={styles.input} value={formData.password} onChangeText={v => setFormData({ ...formData, password: v })} placeholder="Laat leeg om niet te wijzigen" placeholderTextColor="#6c757d" />
              
              <Text style={styles.label}>Rol</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {ROLLEN.map(rol => (
                  <TouchableOpacity key={rol} style={[styles.rolOption, formData.rol === rol && { backgroundColor: getRolColor(rol), borderColor: getRolColor(rol) }]} onPress={() => setFormData({ ...formData, rol })}>
                    <Text style={[styles.rolOptionText, formData.rol === rol && { color: '#fff' }]}>{rol}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 20 }]}>Werkbon types</Text>
              <View style={{ gap: 8 }}>
                {WERKBON_TYPES.map(type => {
                  const isActive = formData.werkbon_types.includes(type.key);
                  return (
                    <TouchableOpacity key={type.key} activeOpacity={0.7} style={[styles.toggleItem, isActive && { borderColor: type.color, backgroundColor: type.color + '10' }]} onPress={() => toggleWerkbonType(type.key)}>
                      <Ionicons name={type.icon as any} size={20} color={isActive ? type.color : '#6c757d'} />
                      <Text style={[styles.toggleLabel, isActive && { color: type.color, fontWeight: '600' }]}>{type.label}</Text>
                      <View style={[styles.customToggle, isActive && { backgroundColor: type.color }]}>
                        <View style={[styles.toggleThumb, isActive && { alignSelf: 'flex-end' }]} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity activeOpacity={0.7} style={styles.pwdToggleRow} onPress={() => setFormData({ ...formData, mag_wachtwoord_wijzigen: !formData.mag_wachtwoord_wijzigen })}>
                <Ionicons name="shield-checkmark-outline" size={20} color={formData.mag_wachtwoord_wijzigen ? '#27ae60' : '#6c757d'} />
                <Text style={{ flex: 1, fontSize: 14, color: '#1A1A2E' }}>Werknemer mag zelf wachtwoord wijzigen</Text>
                <View style={[styles.customToggle, formData.mag_wachtwoord_wijzigen && { backgroundColor: '#27ae60' }]}>
                  <View style={[styles.toggleThumb, formData.mag_wachtwoord_wijzigen && { alignSelf: 'flex-end' }]} />
                </View>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerknemer} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Opslaan</Text>
                </View>
              )}
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
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  headerBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  profileName: { fontSize: 22, fontWeight: '700', color: '#1A1A2E' },
  profileEmail: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  profilePhone: { fontSize: 14, color: '#3498db', marginTop: 2 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginBottom: 14 },
  credRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F6FA' },
  credLabel: { fontSize: 12, color: '#6c757d' },
  credValue: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', marginTop: 2 },
  copyBtn: { padding: 10, borderRadius: 8, backgroundColor: '#F5A62310' },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5A623', borderRadius: 10, paddingVertical: 14, marginTop: 14 },
  copyAllText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  werkbonTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', backgroundColor: '#F5F6FA' },
  werkbonTypeText: { flex: 1, fontSize: 14, color: '#6c757d' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F6FA' },
  infoLabel: { fontSize: 14, color: '#6c757d' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  werkbonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F6FA' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 14, fontWeight: '500' },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  pwdDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8E7', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#F5A62330' },
  pwdText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', fontFamily: 'monospace' },
  rolOption: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F5F6FA', borderWidth: 1.5, borderColor: '#E8E9ED' },
  rolOptionText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E8E9ED', backgroundColor: '#F5F6FA' },
  toggleLabel: { flex: 1, fontSize: 14, color: '#6c757d' },
  customToggle: { width: 48, height: 26, borderRadius: 13, backgroundColor: '#E8E9ED', padding: 2, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: 'flex-start' },
  pwdToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F6FA', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', marginTop: 16 },
  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
