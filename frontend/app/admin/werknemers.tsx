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
}

interface Team {
  id: string;
  naam: string;
}

const ROLLEN = ['werknemer', 'ploegbaas', 'onderaannemer', 'beheerder'];
const WERKBON_TYPES = [
  { key: 'uren', label: 'Uren Werkbon', icon: 'time-outline', color: '#3498db' },
  { key: 'oplevering', label: 'Oplevering Werkbon', icon: 'checkmark-done-outline', color: '#27ae60' },
  { key: 'project', label: 'Project Werkbon', icon: 'briefcase-outline', color: '#9b59b6' },
];

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
  const [formData, setFormData] = useState({ naam: '', email: '', rol: 'werknemer', password: '', telefoon: '', werkbon_types: ['uren'] as string[], mag_wachtwoord_wijzigen: false });
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

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
    setFormData({ naam: '', email: '', rol: 'werknemer', password: '', telefoon: '', werkbon_types: ['uren'], mag_wachtwoord_wijzigen: false });
    setShowModal(true);
  };

  const openEditModal = (w: Werknemer) => {
    setEditingWerknemer(w);
    setFormData({ 
      naam: w.naam, 
      email: w.email, 
      rol: w.rol, 
      password: '', 
      telefoon: w.telefoon || '',
      werkbon_types: w.werkbon_types || ['uren'],
      mag_wachtwoord_wijzigen: w.mag_wachtwoord_wijzigen || false,
    });
    setShowModal(true);
  };

  const toggleWerkbonType = (type: string) => {
    setFormData(prev => {
      const types = prev.werkbon_types.includes(type) 
        ? prev.werkbon_types.filter(t => t !== type)
        : [...prev.werkbon_types, type];
      return { ...prev, werkbon_types: types.length > 0 ? types : prev.werkbon_types };
    });
  };

  const saveWerknemer = async () => {
    if (!formData.naam.trim() || !formData.email.trim()) {
      alert('Naam en e-mail zijn verplicht');
      return;
    }
    setSaving(true);
    try {
      if (editingWerknemer) {
        // Update existing worker
        const updateBody: any = {
          naam: formData.naam,
          rol: formData.rol,
          telefoon: formData.telefoon || null,
          werkbon_types: formData.werkbon_types,
          actief: editingWerknemer.actief,
          mag_wachtwoord_wijzigen: formData.mag_wachtwoord_wijzigen,
        };
        // If password changed by admin
        if (formData.password && formData.password.trim()) {
          updateBody.wachtwoord_plain = formData.password.trim();
        }
        await fetch(`${API_URL}/api/auth/users/${editingWerknemer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        });
      } else {
        // Create new worker with ALL parameters including rol
        const password = formData.password || `Smart${Math.floor(1000 + Math.random() * 9000)}`;
        const params = new URLSearchParams({
          email: formData.email,
          naam: formData.naam,
          password: password,
          rol: formData.rol,
        });
        if (formData.telefoon) params.append('telefoon', formData.telefoon);
        if (formData.werkbon_types.length > 0) params.append('werkbon_types', formData.werkbon_types.join(','));
        
        const res = await fetch(`${API_URL}/api/auth/register-worker?${params.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.detail || 'Fout bij aanmaken');
          setSaving(false);
          return;
        }
        const result = await res.json();
        
        if (result.email_sent) {
          alert(`✅ Werknemer aangemaakt als ${formData.rol}!\n\nInloggegevens zijn per e-mail verstuurd naar:\n${formData.email}\n\nWachtwoord: ${password}`);
        } else {
          alert(`⚠️ Werknemer aangemaakt als ${formData.rol}, maar e-mail kon niet worden verzonden.\n\nWachtwoord: ${password}\n\nGebruik de mail-knop om later opnieuw te versturen.`);
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

  const resendEmail = async (w: Werknemer) => {
    setSendingEmail(w.id);
    try {
      const res = await fetch(`${API_URL}/api/auth/users/${w.id}/resend-info`, { method: 'POST' });
      const result = await res.json();
      if (result.email_sent) {
        alert(`✅ E-mail verstuurd naar ${w.email}\n\nNieuw wachtwoord: ${result.temp_password}`);
      } else {
        alert(`❌ E-mail kon niet worden verzonden: ${result.email_error || 'Onbekende fout'}`);
      }
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij verzenden e-mail');
    } finally {
      setSendingEmail(null);
    }
  };

  const toggleActief = async (w: Werknemer) => {
    try {
      await fetch(`${API_URL}/api/auth/users/${w.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actief: !w.actief }),
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

  const getRolColor = (rol: string) => {
    switch (rol) {
      case 'beheerder': case 'admin': return '#F5A623';
      case 'ploegbaas': return '#3498db';
      case 'onderaannemer': return '#e67e22';
      default: return '#6c757d';
    }
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
          {ROLLEN.map((rol) => (
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
            <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'center' }]}>Acties</Text>
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
                  <View>
                    <Text style={styles.cellName}>{w.naam}</Text>
                    {w.telefoon ? <Text style={styles.cellPhone}>{w.telefoon}</Text> : null}
                  </View>
                </View>
                <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{w.email}</Text>
                <View style={styles.tableCell}>
                  <View style={[styles.rolBadge, { backgroundColor: getRolColor(w.rol) + '20' }]}>
                    <Text style={[styles.rolText, { color: getRolColor(w.rol) }]}>{w.rol}</Text>
                  </View>
                </View>
                <Text style={styles.tableCell}>{getTeamNaam(w.team_id)}</Text>
                <View style={styles.tableCell}>
                  <TouchableOpacity style={[styles.statusBadge, { backgroundColor: w.actief ? '#28a74520' : '#dc354520' }]} onPress={(e: any) => { e.stopPropagation(); toggleActief(w); }}>
                    <View style={[styles.statusDot, { backgroundColor: w.actief ? '#28a745' : '#dc3545' }]} />
                    <Text style={[styles.statusText, { color: w.actief ? '#28a745' : '#dc3545' }]}>{w.actief ? 'Actief' : 'Inactief'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.tableCell, { flex: 1.2, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  {/* Resend Email Button */}
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: '#27ae6015' }]} 
                    onPress={(e: any) => { e.stopPropagation(); resendEmail(w); }}
                    disabled={sendingEmail === w.id}
                  >
                    {sendingEmail === w.id ? (
                      <ActivityIndicator size="small" color="#27ae60" />
                    ) : (
                      <Ionicons name="mail-outline" size={16} color="#27ae60" />
                    )}
                    <Text style={[styles.actionBtnText, { color: '#27ae60' }]}>Mail</Text>
                  </TouchableOpacity>
                  {/* Edit Button */}
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#3498db15' }]} onPress={(e: any) => { e.stopPropagation(); openEditModal(w); }}>
                    <Ionicons name="create-outline" size={16} color="#3498db" />
                  </TouchableOpacity>
                  {/* Delete Button */}
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#dc354515' }]} onPress={(e: any) => { e.stopPropagation(); deleteWerknemer(w.id); }}>
                    <Ionicons name="trash-outline" size={16} color="#dc3545" />
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
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Naam *</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} placeholder="Volledige naam" placeholderTextColor="#6c757d" />
              
              <Text style={styles.label}>E-mail *</Text>
              <TextInput style={styles.input} value={formData.email} onChangeText={(v) => setFormData({ ...formData, email: v })} placeholder="email@voorbeeld.be" placeholderTextColor="#6c757d" keyboardType="email-address" autoCapitalize="none" editable={!editingWerknemer} />
              
              <Text style={styles.label}>Telefoon (optioneel)</Text>
              <TextInput style={styles.input} value={formData.telefoon} onChangeText={(v) => setFormData({ ...formData, telefoon: v })} placeholder="+32 471 23 45 67" placeholderTextColor="#6c757d" keyboardType="phone-pad" />
              
              {!editingWerknemer && (
                <>
                  <Text style={styles.label}>Wachtwoord (leeg = auto-gegenereerd)</Text>
                  <TextInput style={styles.input} value={formData.password} onChangeText={(v) => setFormData({ ...formData, password: v })} placeholder="Wordt automatisch gegenereerd" placeholderTextColor="#6c757d" />
                </>
              )}
              
              {editingWerknemer && (
                <>
                  <Text style={styles.label}>Huidig wachtwoord</Text>
                  <View style={styles.passwordDisplay}>
                    <Ionicons name="key-outline" size={18} color="#F5A623" />
                    <Text style={styles.passwordText}>{editingWerknemer.wachtwoord_plain || '(niet beschikbaar)'}</Text>
                  </View>
                  <Text style={styles.label}>Nieuw wachtwoord instellen (optioneel)</Text>
                  <TextInput style={styles.input} value={formData.password} onChangeText={(v) => setFormData({ ...formData, password: v })} placeholder="Laat leeg om niet te wijzigen" placeholderTextColor="#6c757d" />
                  
                  <TouchableOpacity 
                    style={[styles.toggleRow]}
                    activeOpacity={0.7}
                    onPress={() => setFormData({ ...formData, mag_wachtwoord_wijzigen: !formData.mag_wachtwoord_wijzigen })}
                  >
                    <View style={styles.toggleLeft}>
                      <Ionicons name="shield-checkmark-outline" size={20} color={formData.mag_wachtwoord_wijzigen ? '#27ae60' : '#6c757d'} />
                      <Text style={styles.toggleLabel}>Werknemer mag zelf wachtwoord wijzigen</Text>
                    </View>
                    <View style={[styles.customToggle, formData.mag_wachtwoord_wijzigen && { backgroundColor: '#27ae60' }]}>
                      <View style={[styles.customToggleThumb, formData.mag_wachtwoord_wijzigen && styles.customToggleThumbActive]} />
                    </View>
                  </TouchableOpacity>
                </>
              )}
              
              <Text style={styles.label}>Rol</Text>
              <View style={styles.rolSelector}>
                {ROLLEN.map((rol) => (
                  <TouchableOpacity key={rol} style={[styles.rolOption, formData.rol === rol && { backgroundColor: getRolColor(rol), borderColor: getRolColor(rol) }]} onPress={() => setFormData({ ...formData, rol })}>
                    <Text style={[styles.rolOptionText, formData.rol === rol && styles.rolOptionTextActive]}>{rol}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 20 }]}>Werkbon types</Text>
              <Text style={styles.sublabel}>Selecteer welke werkbonnen deze werknemer mag gebruiken</Text>
              <View style={styles.werkbonTypesList}>
                {WERKBON_TYPES.map((type) => {
                  const isActive = formData.werkbon_types.includes(type.key);
                  return (
                    <TouchableOpacity
                      key={type.key}
                      activeOpacity={0.7}
                      style={[
                        styles.werkbonTypeItem, 
                        isActive && { borderColor: type.color, backgroundColor: type.color + '10' }
                      ]}
                      onPress={() => {
                        setFormData(prev => {
                          const newTypes = isActive 
                            ? prev.werkbon_types.filter(t => t !== type.key)
                            : [...prev.werkbon_types, type.key];
                          return { ...prev, werkbon_types: newTypes.length > 0 ? newTypes : prev.werkbon_types };
                        });
                      }}
                    >
                      <View style={styles.werkbonTypeLeft}>
                        <Ionicons name={type.icon as any} size={20} color={isActive ? type.color : '#6c757d'} />
                        <Text style={[styles.werkbonTypeLabel, isActive && { color: type.color, fontWeight: '600' }]}>{type.label}</Text>
                      </View>
                      <View style={[styles.customToggle, isActive && { backgroundColor: type.color }]}>
                        <View style={[styles.customToggleThumb, isActive && styles.customToggleThumbActive]} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!editingWerknemer && (
                <View style={styles.emailNotice}>
                  <Ionicons name="mail" size={18} color="#27ae60" />
                  <Text style={styles.emailNoticeText}>Inloggegevens worden automatisch per e-mail verstuurd naar de werknemer.</Text>
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerknemer} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={editingWerknemer ? "checkmark" : "person-add"} size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>{editingWerknemer ? 'Opslaan' : 'Aanmaken & Mail versturen'}</Text>
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
  cellPhone: { fontSize: 11, color: '#6c757d', marginTop: 2 },
  rolBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  rolText: { fontSize: 12, fontWeight: '500' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 },
  actionBtnText: { fontSize: 11, fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#6c757d', marginTop: 12 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 16, fontWeight: '500' },
  sublabel: { fontSize: 12, color: '#999', marginBottom: 10 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  rolSelector: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rolOption: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F5F6FA', alignItems: 'center', borderWidth: 1.5, borderColor: '#E8E9ED' },
  rolOptionText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
  rolOptionTextActive: { color: '#fff' },
  werkbonTypesList: { gap: 10 },
  werkbonTypeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F6FA', padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E8E9ED' },
  werkbonTypeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  werkbonTypeLabel: { fontSize: 14, color: '#6c757d' },
  customToggle: { width: 48, height: 26, borderRadius: 13, backgroundColor: '#E8E9ED', padding: 2, justifyContent: 'center' },
  customToggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: 'flex-start' },
  customToggleThumbActive: { alignSelf: 'flex-end' },
  emailNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#27ae6010', padding: 14, borderRadius: 10, marginTop: 20, borderWidth: 1, borderColor: '#27ae6030' },
  emailNoticeText: { flex: 1, fontSize: 13, color: '#27ae60' },
  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  passwordDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8E7', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#F5A62330' },
  passwordText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', fontFamily: 'monospace' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F6FA', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', marginTop: 16 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  toggleLabel: { fontSize: 14, color: '#1A1A2E' },
});
