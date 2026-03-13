import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface TimeEntry {
  start_tijd: string;
  eind_tijd: string;
  pauze_minuten: number;
  locatie_start?: { lat: number; lng: number };
  locatie_eind?: { lat: number; lng: number };
}

export default function ProjectWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [klanten, setKlanten] = useState<any[]>([]);
  const [werven, setWerven] = useState<any[]>([]);
  const [selectedKlant, setSelectedKlant] = useState<any>(null);
  const [selectedWerf, setSelectedWerf] = useState<any>(null);
  const [klantWerven, setKlantWerven] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);
  const [startTijd, setStartTijd] = useState('');
  const [eindTijd, setEindTijd] = useState('');
  const [pauzeMin, setPauzeMin] = useState('0');
  const [omschrijving, setOmschrijving] = useState('');
  const [locatie, setLocatie] = useState<{lat: number; lng: number} | null>(null);
  const [locatieLoading, setLocatieLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [kRes, wRes] = await Promise.all([
        fetch(`${API_URL}/api/klanten`), fetch(`${API_URL}/api/werven`),
      ]);
      setKlanten((await kRes.json()).filter((x: any) => x.actief));
      setWerven((await wRes.json()).filter((x: any) => x.actief));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectKlant = (k: any) => {
    setSelectedKlant(k); setSelectedWerf(null);
    setKlantWerven(werven.filter(w => w.klant_id === k.id));
  };

  const getLocatie = async () => {
    setLocatieLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Locatie toegang nodig'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocatie({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) { console.error(e); Alert.alert('Fout', 'Kon locatie niet ophalen'); }
    finally { setLocatieLoading(false); }
  };

  const saveProject = async () => {
    if (!selectedKlant || !selectedWerf) { Alert.alert('Fout', 'Selecteer klant en werf'); return; }
    if (!startTijd || !eindTijd) { Alert.alert('Fout', 'Vul start- en eindtijd in'); return; }
    setSaving(true);
    try {
      const body = {
        user_id: user?.id, user_naam: user?.naam,
        klant_id: selectedKlant.id, klant_naam: selectedKlant.naam,
        werf_id: selectedWerf.id, werf_naam: selectedWerf.naam,
        datum, start_tijd: startTijd, eind_tijd: eindTijd,
        pauze_minuten: parseInt(pauzeMin) || 0,
        omschrijving,
        locatie: locatie || null,
      };
      const res = await fetch(`${API_URL}/api/project-werkbonnen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { Alert.alert('Opgeslagen', 'Project werkbon aangemaakt'); router.back(); }
      else { Alert.alert('Fout', 'Kon niet opslaan'); }
    } catch (e) { console.error(e); Alert.alert('Fout', 'Netwerkfout'); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color="#F5A623" style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Project Werkbon</Text>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Klant */}
          <Text style={styles.sectionTitle}>Klant</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {klanten.map(k => (
                <TouchableOpacity key={k.id} style={[styles.chip, selectedKlant?.id === k.id && styles.chipActive]}
                  onPress={() => selectKlant(k)}>
                  <Text style={[styles.chipText, selectedKlant?.id === k.id && styles.chipTextActive]}>{k.naam}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Werf */}
          {selectedKlant && (
            <>
              <Text style={styles.sectionTitle}>Werf</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {klantWerven.map(w => (
                    <TouchableOpacity key={w.id} style={[styles.chip, selectedWerf?.id === w.id && styles.chipActive]}
                      onPress={() => setSelectedWerf(w)}>
                      <Text style={[styles.chipText, selectedWerf?.id === w.id && styles.chipTextActive]}>{w.naam}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* Datum */}
          <Text style={styles.sectionTitle}>Datum</Text>
          <TextInput style={styles.input} value={datum} onChangeText={setDatum} placeholder="YYYY-MM-DD" placeholderTextColor="#999" />

          {/* Tijd */}
          <Text style={styles.sectionTitle}>Werktijden</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.timeLabel}>Start</Text>
              <TextInput style={styles.timeInput} value={startTijd} onChangeText={setStartTijd}
                placeholder="07:00" placeholderTextColor="#999" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.timeSep}><Ionicons name="arrow-forward" size={20} color="#6c757d" /></View>
            <View style={styles.timeField}>
              <Text style={styles.timeLabel}>Einde</Text>
              <TextInput style={styles.timeInput} value={eindTijd} onChangeText={setEindTijd}
                placeholder="16:00" placeholderTextColor="#999" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.timeField}>
              <Text style={styles.timeLabel}>Pauze (min)</Text>
              <TextInput style={styles.timeInput} value={pauzeMin} onChangeText={setPauzeMin}
                placeholder="30" placeholderTextColor="#999" keyboardType="number-pad" />
            </View>
          </View>

          {/* Locatie */}
          <Text style={styles.sectionTitle}>Locatie</Text>
          <TouchableOpacity style={styles.locatieBtn} onPress={getLocatie} disabled={locatieLoading}>
            {locatieLoading ? <ActivityIndicator color="#3498db" /> : (
              <>
                <Ionicons name={locatie ? 'location' : 'location-outline'} size={22} color={locatie ? '#28a745' : '#3498db'} />
                <Text style={[styles.locatieBtnText, locatie && { color: '#28a745' }]}>
                  {locatie ? `${locatie.lat.toFixed(5)}, ${locatie.lng.toFixed(5)}` : 'Locatie ophalen'}
                </Text>
                {locatie && <Ionicons name="checkmark-circle" size={20} color="#28a745" />}
              </>
            )}
          </TouchableOpacity>

          {/* Omschrijving */}
          <Text style={styles.sectionTitle}>Omschrijving</Text>
          <TextInput style={[styles.input, { minHeight: 100 }]} value={omschrijving}
            onChangeText={setOmschrijving} placeholder="Wat is er gedaan..."
            placeholderTextColor="#999" multiline textAlignVertical="top" />

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={saveProject} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time" size={22} color="#fff" />
                <Text style={styles.saveBtnText}>Project Werkbon Opslaan</Text>
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
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  timeField: { flex: 1 },
  timeLabel: { fontSize: 12, color: '#6c757d', marginBottom: 4 },
  timeInput: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 18, fontWeight: '600', color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED', textAlign: 'center' },
  timeSep: { paddingBottom: 14 },
  locatieBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E9ED' },
  locatieBtnText: { flex: 1, fontSize: 15, color: '#3498db', fontWeight: '500' },
  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
