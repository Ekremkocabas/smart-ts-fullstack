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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

interface Instellingen {
  id?: string;
  bedrijfsnaam: string;
  adres: string;
  btw_nummer: string;
  email: string;
  telefoon: string;
  logo_base64?: string;
  primaire_kleur: string;
  secundaire_kleur: string;
  pdf_header?: string;
  pdf_footer?: string;
}

const defaultInstellingen: Instellingen = {
  bedrijfsnaam: 'Smart-Tech BV',
  adres: '',
  btw_nummer: '',
  email: '',
  telefoon: '',
  primaire_kleur: '#F5A623',
  secundaire_kleur: '#1A1A2E',
};

export default function InstellingenAdmin() {
  const { user } = useAuth();
  const [instellingen, setInstellingen] = useState<Instellingen>(defaultInstellingen);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
  useEffect(() => { 
    if (Platform.OS === 'web' && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchInstellingen(); 
    }
  }, [user]);

  const fetchInstellingen = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/instellingen`);
      const data = await res.json();
      if (data && data.bedrijfsnaam) {
        setInstellingen(data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 2],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setInstellingen({ ...instellingen, logo_base64: result.assets[0].base64 });
    }
  };

  const saveInstellingen = async () => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/instellingen`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instellingen),
      });
      alert('Instellingen opgeslagen!');
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij opslaan');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
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
          <Text style={styles.title}>Bedrijfsinstellingen</Text>
          <Text style={styles.subtitle}>Beheer uw bedrijfsgegevens</Text>
        </View>
        <TouchableOpacity style={styles.saveHeaderBtn} onPress={saveInstellingen} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="save-outline" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Logo</Text>
          <TouchableOpacity style={styles.logoUpload} onPress={pickLogo}>
            {instellingen.logo_base64 ? (
              <Image source={{ uri: `data:image/png;base64,${instellingen.logo_base64}` }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="image-outline" size={40} color="#6c757d" />
                <Text style={styles.logoPlaceholderText}>Klik om logo te uploaden</Text>
              </View>
            )}
          </TouchableOpacity>
          {instellingen.logo_base64 && (
            <TouchableOpacity style={styles.removeLogo} onPress={() => setInstellingen({ ...instellingen, logo_base64: undefined })}>
              <Text style={styles.removeLogoText}>Logo verwijderen</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bedrijfsgegevens</Text>
          <Text style={styles.label}>Bedrijfsnaam</Text>
          <TextInput style={styles.input} value={instellingen.bedrijfsnaam} onChangeText={(v) => setInstellingen({ ...instellingen, bedrijfsnaam: v })} placeholder="Bedrijfsnaam" placeholderTextColor="#6c757d" />
          <Text style={styles.label}>Adres</Text>
          <TextInput style={styles.input} value={instellingen.adres} onChangeText={(v) => setInstellingen({ ...instellingen, adres: v })} placeholder="Straat, nr, postcode, stad" placeholderTextColor="#6c757d" />
          <Text style={styles.label}>BTW-nummer</Text>
          <TextInput style={styles.input} value={instellingen.btw_nummer} onChangeText={(v) => setInstellingen({ ...instellingen, btw_nummer: v })} placeholder="BE0123456789" placeholderTextColor="#6c757d" />
          <Text style={styles.label}>E-mail</Text>
          <TextInput style={styles.input} value={instellingen.email} onChangeText={(v) => setInstellingen({ ...instellingen, email: v })} placeholder="info@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
          <Text style={styles.label}>Telefoon</Text>
          <TextInput style={styles.input} value={instellingen.telefoon} onChangeText={(v) => setInstellingen({ ...instellingen, telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kleuren</Text>
          <View style={styles.colorRow}>
            <View style={styles.colorItem}>
              <Text style={styles.label}>Primaire kleur</Text>
              <View style={styles.colorInput}>
                <View style={[styles.colorPreview, { backgroundColor: instellingen.primaire_kleur }]} />
                <TextInput style={styles.colorText} value={instellingen.primaire_kleur} onChangeText={(v) => setInstellingen({ ...instellingen, primaire_kleur: v })} placeholder="#F5A623" placeholderTextColor="#6c757d" />
              </View>
            </View>
            <View style={styles.colorItem}>
              <Text style={styles.label}>Secundaire kleur</Text>
              <View style={styles.colorInput}>
                <View style={[styles.colorPreview, { backgroundColor: instellingen.secundaire_kleur }]} />
                <TextInput style={styles.colorText} value={instellingen.secundaire_kleur} onChangeText={(v) => setInstellingen({ ...instellingen, secundaire_kleur: v })} placeholder="#1A1A2E" placeholderTextColor="#6c757d" />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PDF instellingen</Text>
          <Text style={styles.label}>PDF Header tekst</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_header} onChangeText={(v) => setInstellingen({ ...instellingen, pdf_header: v })} placeholder="Tekst bovenaan de PDF" placeholderTextColor="#6c757d" multiline />
          <Text style={styles.label}>PDF Footer tekst</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_footer} onChangeText={(v) => setInstellingen({ ...instellingen, pdf_footer: v })} placeholder="Tekst onderaan de PDF" placeholderTextColor="#6c757d" multiline />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={saveInstellingen} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Instellingen opslaan</Text>}
        </TouchableOpacity>
      </ScrollView>
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
  saveHeaderBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#28a745', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: 16 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 16 },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  logoUpload: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#E8E9ED', borderRadius: 12, padding: 20, alignItems: 'center' },
  logoPreview: { width: 200, height: 100 },
  logoPlaceholder: { alignItems: 'center', gap: 8 },
  logoPlaceholderText: { color: '#6c757d', fontSize: 14 },
  removeLogo: { alignItems: 'center', marginTop: 12 },
  removeLogoText: { color: '#dc3545', fontSize: 14 },
  colorRow: { flexDirection: 'row', gap: 16 },
  colorItem: { flex: 1 },
  colorInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F6FA', borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden' },
  colorPreview: { width: 44, height: 44 },
  colorText: { flex: 1, padding: 12, fontSize: 14, color: '#1A1A2E' },
  saveBtn: { backgroundColor: '#28a745', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 40 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
});
