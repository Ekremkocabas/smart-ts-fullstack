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
import { useAuth, apiClient } from '../../context/AuthContext';
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

interface Werf {
  id: string;
  naam: string;
  adres?: string;
  klant_id?: string;
  klant_naam?: string;
  werfleider?: string;
  werfleider_email?: string;
  actief: boolean;
  created_at?: string;
}

interface Klant {
  id: string;
  naam: string;
}

interface Werkbon {
  id: string;
  week_nummer: number;
  klant_naam: string;
  created_by_naam: string;
  status: string;
}

export default function WerfDetail() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [werf, setWerf] = useState<Werf | null>(null);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [werkbonnen, setWerkbonnen] = useState<Werkbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ naam: '', adres: '', klant_id: '', werfleider: '', werfleider_email: '', actief: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && id && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchData();
    }
  }, [user, id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wervenRes, klantenRes, werkbonnenRes] = await Promise.all([
        fetch(`${API_URL}/api/werven`),
        fetch(`${API_URL}/api/klanten`),
        fetch(`${API_URL}/api/werkbonnen?user_id=admin-001&is_admin=true`),
      ]);
      
      const werven = await wervenRes.json();
      const klantenData = await klantenRes.json();
      const werkbonnenData = await werkbonnenRes.json();
      
      const foundWerf = werven.find((w: Werf) => w.id === id);
      setWerf(foundWerf || null);
      setKlanten(Array.isArray(klantenData) ? klantenData : []);
      
      // Filter werkbonnen for this werf
      const werfWerkbonnen = (Array.isArray(werkbonnenData) ? werkbonnenData : [])
        .filter((wb: any) => wb.werf_id === id || wb.werf_naam === foundWerf?.naam);
      setWerkbonnen(werfWerkbonnen);
      
      if (foundWerf) {
        setFormData({
          naam: foundWerf.naam || '',
          adres: foundWerf.adres || '',
          klant_id: foundWerf.klant_id || '',
          werfleider: foundWerf.werfleider || '',
          werfleider_email: foundWerf.werfleider_email || '',
          actief: foundWerf.actief !== false,
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveWerf = async () => {
    if (!werf) return;
    setSaving(true);
    const klant = klanten.find(k => k.id === formData.klant_id);
    try {
      await fetch(`${API_URL}/api/werven/${werf.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...werf,
          naam: formData.naam,
          adres: formData.adres,
          klant_id: formData.klant_id,
          klant_naam: klant?.naam,
          werfleider: formData.werfleider,
          werfleider_email: formData.werfleider_email,
          actief: formData.actief,
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
    if (!werf) return;
    try {
      await fetch(`${API_URL}/api/werven/${werf.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...werf, actief: !werf.actief }),
      });
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!werf) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Werf niet gevonden</Text>
        </View>
      </View>
    );
  }

  const klantNaam = klanten.find(k => k.id === werf.klant_id)?.naam || werf.klant_naam || '-';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Werf details</Text>
          <Text style={styles.subtitle}>{werf.naam}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={() => setShowEditModal(true)}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Werf Card */}
      <View style={styles.werfCard}>
        <View style={styles.werfIcon}>
          <Ionicons name="business" size={40} color="#e67e22" />
        </View>
        <Text style={styles.werfName}>{werf.naam}</Text>
        <View style={[styles.statusBadge, { backgroundColor: werf.actief ? '#28a74520' : '#dc354520' }]}>
          <View style={[styles.statusDot, { backgroundColor: werf.actief ? '#28a745' : '#dc3545' }]} />
          <Text style={[styles.statusText, { color: werf.actief ? '#28a745' : '#dc3545' }]}>{werf.actief ? 'Actief' : 'Inactief'}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gegevens</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Ionicons name="briefcase-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Klant</Text>
            <TouchableOpacity onPress={() => werf.klant_id && router.push(`/admin/klant-detail?id=${werf.klant_id}` as any)}>
              <Text style={[styles.detailValue, { color: '#1abc9c' }]}>{klantNaam}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Adres</Text>
            <Text style={styles.detailValue}>{werf.adres || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Werfleider</Text>
            <Text style={styles.detailValue}>{werf.werfleider || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Werfleider e-mail</Text>
            <Text style={styles.detailValue}>{werf.werfleider_email || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Status</Text>
            <TouchableOpacity onPress={toggleActief}>
              <Text style={[styles.detailValue, { color: werf.actief ? '#28a745' : '#dc3545' }]}>
                {werf.actief ? 'Actief' : 'Inactief'} (klik om te wijzigen)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Werkbonnen */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Werkbonnen ({werkbonnen.length})</Text>
        {werkbonnen.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#E8E9ED" />
            <Text style={styles.emptyText}>Geen werkbonnen voor deze werf</Text>
          </View>
        ) : (
          <View style={styles.werkbonnenList}>
            {werkbonnen.slice(0, 5).map((wb) => (
              <TouchableOpacity key={wb.id} style={styles.werkbonCard} onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}>
                <View style={styles.werkbonLeft}>
                  <Text style={styles.werkbonWeek}>Week {wb.week_nummer}</Text>
                  <Text style={styles.werkbonKlant}>{wb.klant_naam}</Text>
                  <Text style={styles.werkbonMeta}>{wb.created_by_naam}</Text>
                </View>
                <View style={[styles.wbStatusBadge, { backgroundColor: wb.status === 'verzonden' ? '#F5A623' : wb.status === 'ondertekend' ? '#28a745' : '#ffc107' }]}>
                  <Text style={styles.wbStatusText}>{wb.status}</Text>
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
              <Text style={styles.modalTitle}>Werf bewerken</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Werfnaam</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} />
              <Text style={styles.label}>Klant</Text>
              <ScrollView horizontal style={styles.klantSelector}>
                {klanten.map((k) => (
                  <TouchableOpacity key={k.id} style={[styles.klantOption, formData.klant_id === k.id && styles.klantOptionActive]} onPress={() => setFormData({ ...formData, klant_id: k.id })}>
                    <Text style={[styles.klantOptionText, formData.klant_id === k.id && styles.klantOptionTextActive]}>{k.naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} value={formData.adres} onChangeText={(v) => setFormData({ ...formData, adres: v })} />
              <Text style={styles.label}>Werfleider naam</Text>
              <TextInput style={styles.input} value={formData.werfleider} onChangeText={(v) => setFormData({ ...formData, werfleider: v })} />
              <Text style={styles.label}>Werfleider e-mail</Text>
              <TextInput style={styles.input} value={formData.werfleider_email} onChangeText={(v) => setFormData({ ...formData, werfleider_email: v })} keyboardType="email-address" />
              <View style={styles.activeToggle}>
                <Text style={styles.label}>Status</Text>
                <TouchableOpacity style={[styles.toggleBtn, formData.actief && styles.toggleBtnActive]} onPress={() => setFormData({ ...formData, actief: !formData.actief })}>
                  <Text style={[styles.toggleBtnText, formData.actief && styles.toggleBtnTextActive]}>{formData.actief ? 'Actief' : 'Inactief'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveWerf} disabled={saving}>
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
  editBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e67e22', alignItems: 'center', justifyContent: 'center' },
  werfCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#E8E9ED' },
  werfIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#e67e2220', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  werfName: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  detailRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED', gap: 12 },
  detailLabel: { flex: 1, fontSize: 14, color: '#6c757d' },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  werkbonnenList: { gap: 8 },
  werkbonCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E8E9ED' },
  werkbonLeft: { flex: 1 },
  werkbonWeek: { fontSize: 13, fontWeight: '600', color: '#F5A623' },
  werkbonKlant: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', marginTop: 2 },
  werkbonMeta: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  wbStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  wbStatusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
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
  klantSelector: { marginTop: 8 },
  klantOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F6FA', marginRight: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  klantOptionActive: { backgroundColor: '#1abc9c', borderColor: '#1abc9c' },
  klantOptionText: { fontSize: 14, color: '#6c757d' },
  klantOptionTextActive: { color: '#fff' },
  activeToggle: { marginTop: 8 },
  toggleBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#dc354520', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#28a74520' },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: '#dc3545' },
  toggleBtnTextActive: { color: '#28a745' },
  saveBtn: { backgroundColor: '#e67e22', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
