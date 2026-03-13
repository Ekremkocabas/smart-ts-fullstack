import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface StarRating {
  netheid: number;
  schoonheid: number;
  geen_schade: number;
}

export default function OpleveringWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [klanten, setKlanten] = useState<any[]>([]);
  const [werven, setWerven] = useState<any[]>([]);
  const [selectedKlant, setSelectedKlant] = useState<any>(null);
  const [selectedWerf, setSelectedWerf] = useState<any>(null);
  const [klantWerven, setKlantWerven] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ratings, setRatings] = useState<StarRating>({ netheid: 0, schoonheid: 0, geen_schade: 0 });
  const [allesOk, setAllesOk] = useState(false);
  const [opmerkingen, setOpmerkingen] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [kRes, wRes] = await Promise.all([
        fetch(`${API_URL}/api/klanten`),
        fetch(`${API_URL}/api/werven`),
      ]);
      const k = await kRes.json();
      const w = await wRes.json();
      setKlanten(Array.isArray(k) ? k.filter((x: any) => x.actief) : []);
      setWerven(Array.isArray(w) ? w.filter((x: any) => x.actief) : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectKlant = (k: any) => {
    setSelectedKlant(k);
    setSelectedWerf(null);
    setKlantWerven(werven.filter(w => w.klant_id === k.id));
  };

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsMultipleSelection: true,
      });
      if (!result.canceled && result.assets) {
        const newPhotos = result.assets
          .filter(a => a.base64)
          .map(a => `data:image/jpeg;base64,${a.base64}`);
        setFotos(prev => [...prev, ...newPhotos]);
      }
    } catch (e) { console.error(e); }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Camera toegang nodig'); return; }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setFotos(prev => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
      }
    } catch (e) { console.error(e); }
  };

  const removePhoto = (index: number) => {
    setFotos(prev => prev.filter((_, i) => i !== index));
  };

  const renderStars = (value: number, onChange: (v: number) => void, label: string) => (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map(star => (
          <TouchableOpacity key={star} onPress={() => onChange(star)} style={styles.starBtn}>
            <Ionicons name={star <= value ? 'star' : 'star-outline'} size={32} color={star <= value ? '#F5A623' : '#E8E9ED'} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const saveOplevering = async () => {
    if (!selectedKlant || !selectedWerf) {
      Alert.alert('Fout', 'Selecteer klant en werf');
      return;
    }
    if (ratings.netheid === 0 || ratings.schoonheid === 0 || ratings.geen_schade === 0) {
      Alert.alert('Fout', 'Vul alle beoordelingen in');
      return;
    }
    setSaving(true);
    try {
      const body = {
        user_id: user?.id,
        user_naam: user?.naam,
        klant_id: selectedKlant.id,
        klant_naam: selectedKlant.naam,
        werf_id: selectedWerf.id,
        werf_naam: selectedWerf.naam,
        tevredenheid: {
          netheid: ratings.netheid,
          schoonheid: ratings.schoonheid,
          geen_schade: ratings.geen_schade,
        },
        alles_ok: allesOk,
        opmerkingen,
        fotos,
      };
      const res = await fetch(`${API_URL}/api/oplevering-werkbonnen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        Alert.alert('Opgeslagen', 'Oplevering werkbon is aangemaakt');
        router.back();
      } else {
        Alert.alert('Fout', 'Kon niet opslaan');
      }
    } catch (e) { console.error(e); Alert.alert('Fout', 'Netwerkfout'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#F5A623" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Oplevering Werkbon</Text>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Klant Selection */}
          <Text style={styles.sectionTitle}>Klant</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {klanten.map(k => (
                <TouchableOpacity key={k.id}
                  style={[styles.chip, selectedKlant?.id === k.id && styles.chipActive]}
                  onPress={() => selectKlant(k)}>
                  <Text style={[styles.chipText, selectedKlant?.id === k.id && styles.chipTextActive]}>{k.naam}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Werf Selection */}
          {selectedKlant && (
            <>
              <Text style={styles.sectionTitle}>Werf</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {klantWerven.map(w => (
                    <TouchableOpacity key={w.id}
                      style={[styles.chip, selectedWerf?.id === w.id && styles.chipActive]}
                      onPress={() => setSelectedWerf(w)}>
                      <Text style={[styles.chipText, selectedWerf?.id === w.id && styles.chipTextActive]}>{w.naam}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* Star Ratings */}
          <Text style={styles.sectionTitle}>Beoordeling</Text>
          <View style={styles.ratingsCard}>
            {renderStars(ratings.netheid, v => setRatings({...ratings, netheid: v}), 'Netheid / Ordelijkheid')}
            {renderStars(ratings.schoonheid, v => setRatings({...ratings, schoonheid: v}), 'Schoonheid')}
            {renderStars(ratings.geen_schade, v => setRatings({...ratings, geen_schade: v}), 'Geen schade')}
          </View>

          {/* Everything OK */}
          <TouchableOpacity style={[styles.okToggle, allesOk && styles.okToggleActive]}
            onPress={() => setAllesOk(!allesOk)}>
            <Ionicons name={allesOk ? 'checkmark-circle' : 'ellipse-outline'} size={28}
              color={allesOk ? '#28a745' : '#6c757d'} />
            <Text style={[styles.okText, allesOk && { color: '#28a745', fontWeight: '700' }]}>
              Alles OK & Werkend
            </Text>
          </TouchableOpacity>

          {/* Photos */}
          <Text style={styles.sectionTitle}>Foto's ({fotos.length})</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoAddBtn} onPress={takePhoto}>
              <Ionicons name="camera" size={28} color="#F5A623" />
              <Text style={styles.photoAddText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoAddBtn} onPress={pickPhoto}>
              <Ionicons name="images" size={28} color="#3498db" />
              <Text style={styles.photoAddText}>Galerij</Text>
            </TouchableOpacity>
          </View>
          {fotos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {fotos.map((foto, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: foto }} style={styles.photoImage} />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)}>
                    <Ionicons name="close-circle" size={24} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Opmerkingen */}
          <Text style={styles.sectionTitle}>Opmerkingen</Text>
          <TextInput style={[styles.input, { minHeight: 100 }]} value={opmerkingen}
            onChangeText={setOpmerkingen} placeholder="Eventuele opmerkingen..."
            placeholderTextColor="#999" multiline textAlignVertical="top" />

          {/* Save Button */}
          <TouchableOpacity style={styles.saveBtn} onPress={saveOplevering} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.saveBtnText}>Oplevering Opslaan</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  scrollView: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginTop: 20, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E8E9ED' },
  chipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  chipText: { fontSize: 14, color: '#6c757d', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  ratingsCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  ratingRow: { gap: 6 },
  ratingLabel: { fontSize: 14, color: '#1A1A2E', fontWeight: '500' },
  starsRow: { flexDirection: 'row', gap: 4 },
  starBtn: { padding: 2 },
  okToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 16, borderRadius: 12, marginTop: 16, borderWidth: 2, borderColor: '#E8E9ED' },
  okToggleActive: { borderColor: '#28a745', backgroundColor: '#28a74510' },
  okText: { fontSize: 16, color: '#6c757d' },
  photoRow: { flexDirection: 'row', gap: 12 },
  photoAddBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 20, borderWidth: 1.5, borderColor: '#E8E9ED', borderStyle: 'dashed', gap: 6 },
  photoAddText: { fontSize: 13, color: '#6c757d' },
  photoThumb: { width: 100, height: 100, borderRadius: 8, marginRight: 10, position: 'relative' },
  photoImage: { width: 100, height: 100, borderRadius: 8 },
  photoRemove: { position: 'absolute', top: -6, right: -6 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
