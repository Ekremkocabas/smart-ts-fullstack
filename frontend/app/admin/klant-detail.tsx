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

interface Klant {
  id: string;
  naam: string;
  email?: string;
  telefoon?: string;
  adres?: string;
  contactpersoon?: string;
  actief: boolean;
  created_at?: string;
}

interface Werf {
  id: string;
  naam: string;
  adres?: string;
}

export default function KlantDetail() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [klant, setKlant] = useState<Klant | null>(null);
  const [werven, setWerven] = useState<Werf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ naam: '', email: '', telefoon: '', adres: '', contactpersoon: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && id && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchData();
    }
  }, [user, id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [klantenRes, wervenRes] = await Promise.all([
        apiClient.get('/api/klanten'),
        apiClient.get('/api/werven'),
      ]);
      
      const klanten = klantenRes.data;
      const wervenData = wervenRes.data;
      
      const foundKlant = klanten.find((k: Klant) => k.id === id);
      setKlant(foundKlant || null);
      
      // Filter werven for this klant
      const klantWerven = (Array.isArray(wervenData) ? wervenData : [])
        .filter((w: any) => w.klant_id === id);
      setWerven(klantWerven);
      
      if (foundKlant) {
        setFormData({
          naam: foundKlant.naam || '',
          email: foundKlant.email || '',
          telefoon: foundKlant.telefoon || '',
          adres: foundKlant.adres || '',
          contactpersoon: foundKlant.contactpersoon || '',
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveKlant = async () => {
    if (!klant) return;
    setSaving(true);
    try {
      await apiClient.put(`/api/klanten/${klant.id}`, {
        ...klant,
        naam: formData.naam,
        email: formData.email,
        telefoon: formData.telefoon,
        adres: formData.adres,
        contactpersoon: formData.contactpersoon,
      });
      setShowEditModal(false);
      fetchData();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSaving(false);
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

  if (!klant) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Klant niet gevonden</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Klant details</Text>
          <Text style={styles.subtitle}>{klant.naam}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={() => setShowEditModal(true)}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Klant Card */}
      <View style={styles.klantCard}>
        <View style={styles.klantIcon}>
          <Ionicons name="briefcase" size={40} color="#1abc9c" />
        </View>
        <Text style={styles.klantName}>{klant.naam}</Text>
        {klant.contactpersoon && <Text style={styles.klantContact}>Contact: {klant.contactpersoon}</Text>}
      </View>

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contactgegevens</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Contactpersoon</Text>
            <Text style={styles.detailValue}>{klant.contactpersoon || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>E-mail</Text>
            <Text style={styles.detailValue}>{klant.email || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Telefoon</Text>
            <Text style={styles.detailValue}>{klant.telefoon || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={20} color="#6c757d" />
            <Text style={styles.detailLabel}>Adres</Text>
            <Text style={styles.detailValue}>{klant.adres || '-'}</Text>
          </View>
        </View>
      </View>

      {/* Werven */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Werven ({werven.length})</Text>
        {werven.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color="#E8E9ED" />
            <Text style={styles.emptyText}>Geen werven gekoppeld</Text>
          </View>
        ) : (
          <View style={styles.wervenList}>
            {werven.map((werf) => (
              <TouchableOpacity key={werf.id} style={styles.werfCard} onPress={() => router.push(`/admin/werf-detail?id=${werf.id}` as any)}>
                <View style={styles.werfIcon}>
                  <Ionicons name="business" size={24} color="#e67e22" />
                </View>
                <View style={styles.werfInfo}>
                  <Text style={styles.werfName}>{werf.naam}</Text>
                  {werf.adres && <Text style={styles.werfAdres}>{werf.adres}</Text>}
                </View>
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
              <Text style={styles.modalTitle}>Klant bewerken</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Bedrijfsnaam</Text>
              <TextInput style={styles.input} value={formData.naam} onChangeText={(v) => setFormData({ ...formData, naam: v })} />
              <Text style={styles.label}>Contactpersoon</Text>
              <TextInput style={styles.input} value={formData.contactpersoon} onChangeText={(v) => setFormData({ ...formData, contactpersoon: v })} />
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={styles.input} value={formData.email} onChangeText={(v) => setFormData({ ...formData, email: v })} keyboardType="email-address" />
              <Text style={styles.label}>Telefoon</Text>
              <TextInput style={styles.input} value={formData.telefoon} onChangeText={(v) => setFormData({ ...formData, telefoon: v })} keyboardType="phone-pad" />
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} value={formData.adres} onChangeText={(v) => setFormData({ ...formData, adres: v })} />
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={saveKlant} disabled={saving}>
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
  editBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1abc9c', alignItems: 'center', justifyContent: 'center' },
  klantCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#E8E9ED' },
  klantIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#1abc9c20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  klantName: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  klantContact: { fontSize: 15, color: '#6c757d', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  detailRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED', gap: 12 },
  detailLabel: { flex: 1, fontSize: 14, color: '#6c757d' },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  wervenList: { gap: 8 },
  werfCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E8E9ED' },
  werfIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#e67e2220', alignItems: 'center', justifyContent: 'center' },
  werfInfo: { flex: 1, marginLeft: 12 },
  werfName: { fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  werfAdres: { fontSize: 13, color: '#6c757d', marginTop: 2 },
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
  saveBtn: { backgroundColor: '#1abc9c', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
