/**
 * Project Werkbon - Unified System
 * Uses shared components from /components/werkbon
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStore } from '../../store/appStore';
import { SignatureCanvas } from '../../components/werkbon/SignatureCanvas';
import { GPSLocation } from '../../components/werkbon/GPSLocation';
import { PhotoUpload } from '../../components/werkbon/PhotoUpload';
import { LEGAL_TEXT } from '../../components/werkbon';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ProjectWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const signatureRef = useRef<any>(null);
  
  const primary = theme.primaryColor || '#F5A623';
  const secondary = theme.secondaryColor || '#000000';

  // Page state
  const [page, setPage] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // Form data
  const [selectedKlant, setSelectedKlant] = useState<any>(null);
  const [selectedWerf, setSelectedWerf] = useState<any>(null);
  const [projectNaam, setProjectNaam] = useState('');
  const [taken, setTaken] = useState<string[]>(['']);
  const [opmerking, setOpmerking] = useState('');
  
  // GPS
  const [gpsCoords, setGpsCoords] = useState('');
  const [gpsAddress, setGpsAddress] = useState('');
  
  // Photos
  const [photos, setPhotos] = useState<string[]>([]);
  
  // Signature
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureValue, setSignatureValue] = useState<string | null>(null);
  const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
  const [signatureName, setSignatureName] = useState('');

  // Handle signature change from canvas (works on both web and native)
  const handleSignatureChange = (sig: string | null) => {
    setSignatureValue(sig);
    if (sig) {
      setHasSignature(true);
    }
  };

  // Data from store
  const { klanten, werven, fetchKlanten, fetchWervenByKlant } = useAppStore();
  
  // Pickers
  const [showKlantPicker, setShowKlantPicker] = useState(false);
  const [showWerfPicker, setShowWerfPicker] = useState(false);

  useEffect(() => {
    fetchKlanten();
  }, []);

  useEffect(() => {
    if (selectedKlant?.id) {
      fetchWervenByKlant(selectedKlant.id);
      setSelectedWerf(null);
    }
  }, [selectedKlant]);

  // Taken management
  const addTaak = () => setTaken([...taken, '']);
  const updateTaak = (index: number, value: string) => {
    const newTaken = [...taken];
    newTaken[index] = value;
    setTaken(newTaken);
  };
  const removeTaak = (index: number) => {
    if (taken.length > 1) {
      setTaken(taken.filter((_, i) => i !== index));
    }
  };

  const validatePage1 = () => {
    if (!selectedKlant) {
      Alert.alert('Fout', 'Selecteer een klant');
      return false;
    }
    if (!projectNaam.trim()) {
      Alert.alert('Fout', 'Vul een projectnaam in');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!signatureValue) {
      Alert.alert('Fout', 'Handtekening is verplicht. Teken eerst en probeer opnieuw.');
      return;
    }
    if (!signatureName.trim()) {
      Alert.alert('Fout', 'Naam ondertekenaar is verplicht');
      return;
    }

    setSaving(true);
    try {
      const sig = signatureValue;

      const payload = {
        user_id: user?.id,
        klant_id: selectedKlant?.id,
        klant_naam: selectedKlant?.naam,
        werf_id: selectedWerf?.id || null,
        werf_naam: selectedWerf?.naam || null,
        project_naam: projectNaam,
        taken: taken.filter(t => t.trim()),
        opmerking,
        gps_locatie: gpsCoords || null,
        gps_adres: gpsAddress || null,
        fotos: photos,
        handtekening: sig,
        handtekening_naam: signatureName,
        handtekening_datum: signatureDate,
        status: 'ingediend',
      };

      const createRes = await axios.post(
        `${BACKEND_URL}/api/project-werkbonnen?user_id=${user?.id}`,
        payload
      );
      const werkbonId = createRes.data?.id;

      if (werkbonId) {
        await axios.post(
          `${BACKEND_URL}/api/project-werkbonnen/${werkbonId}/verzenden?user_id=${user?.id}`
        );
        Alert.alert('Succes', 'Werkbon opgeslagen en PDF verstuurd!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Succes', 'Werkbon opgeslagen', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      Alert.alert('Fout', error.response?.data?.detail || 'Kon werkbon niet opslaan');
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureOk = (sig: string) => {
    setSignatureValue(sig);
    setHasSignature(true);
  };

  const clearSignature = () => {
    setHasSignature(false);
    setSignatureValue(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={page === 2 ? () => setPage(1) : () => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Project Werkbon</Text>
        <View style={styles.pageIndicators}>
          <View style={[styles.pageIndicator, page === 1 && { backgroundColor: primary }]} />
          <View style={[styles.pageIndicator, page === 2 && { backgroundColor: primary }]} />
        </View>
      </View>

      <KeyboardAvoidingView 
        style={styles.flex} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {page === 1 ? (
          /* ========== PAGE 1: FORM ========== */
          <ScrollView 
            style={styles.flex} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Klant Selection */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Klantgegevens</Text>
              <Text style={styles.fieldLabel}>Klant *</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowKlantPicker(true)}
              >
                <Text style={[styles.pickerText, !selectedKlant && styles.placeholder]}>
                  {selectedKlant?.naam || 'Selecteer klant'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#8C9199" />
              </TouchableOpacity>

              {selectedKlant && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Werf (optioneel)</Text>
                  <TouchableOpacity 
                    style={styles.pickerButton}
                    onPress={() => setShowWerfPicker(true)}
                  >
                    <Text style={[styles.pickerText, !selectedWerf && styles.placeholder]}>
                      {selectedWerf?.naam || 'Selecteer werf'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#8C9199" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Project Details */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Project Details</Text>
              
              <Text style={styles.fieldLabel}>Projectnaam *</Text>
              <TextInput
                style={styles.input}
                value={projectNaam}
                onChangeText={setProjectNaam}
                placeholder="Naam van het project"
                placeholderTextColor="#8C9199"
              />
            </View>

            {/* Taken */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Uitgevoerde taken</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: primary }]}
                  onPress={addTaak}
                >
                  <Ionicons name="add" size={20} color={primary} />
                </TouchableOpacity>
              </View>
              
              {taken.map((taak, index) => (
                <View key={index} style={styles.taakRow}>
                  <TextInput
                    style={[styles.input, styles.flex]}
                    value={taak}
                    onChangeText={(value) => updateTaak(index, value)}
                    placeholder={`Taak ${index + 1}`}
                    placeholderTextColor="#8C9199"
                  />
                  {taken.length > 1 && (
                    <TouchableOpacity 
                      style={styles.removeButton}
                      onPress={() => removeTaak(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#dc3545" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            {/* GPS Location */}
            <View style={styles.card}>
              <GPSLocation
                onLocationChange={(coords, address) => {
                  setGpsCoords(coords);
                  setGpsAddress(address);
                }}
                primaryColor={primary}
              />
            </View>

            {/* Photos */}
            <View style={styles.card}>
              <PhotoUpload
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={5}
                primaryColor={primary}
              />
            </View>

            {/* Notes */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Opmerkingen</Text>
              <TextInput
                style={[styles.input, styles.inputLarge]}
                value={opmerking}
                onChangeText={setOpmerking}
                placeholder="Extra opmerkingen..."
                placeholderTextColor="#8C9199"
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>
        ) : (
          /* ========== PAGE 2: SIGNATURE (Outside ScrollView!) ========== */
          <View style={styles.signaturePage}>
            <ScrollView 
              style={styles.signatureScrollSection}
              contentContainerStyle={styles.signatureScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Datum</Text>
                <TextInput
                  style={styles.input}
                  value={signatureDate}
                  onChangeText={setSignatureDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#8C9199"
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Naam ondertekenaar *</Text>
                <TextInput
                  style={styles.input}
                  value={signatureName}
                  onChangeText={setSignatureName}
                  placeholder="Volledige naam"
                  placeholderTextColor="#8C9199"
                />
              </View>
            </ScrollView>

            {/* FIXED Signature Canvas */}
            <View style={styles.signatureFixedSection}>
              <View style={styles.card}>
                <SignatureCanvas
                  signatureRef={signatureRef}
                  onSignatureStart={() => setHasSignature(true)}
                  onSignatureClear={clearSignature}
                  onSignatureOk={handleSignatureOk}
                  onSignatureChange={handleSignatureChange}
                  primaryColor={primary}
                />
              </View>

              <View style={styles.legalBox}>
                <Ionicons name="document-text-outline" size={18} color="#6c757d" />
                <Text style={styles.legalText}>{LEGAL_TEXT}</Text>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Fixed Footer */}
      <View style={[styles.fixedFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {page === 1 ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: primary }]}
            onPress={() => { if (validatePage1()) setPage(2); }}
          >
            <Text style={[styles.primaryButtonText, { color: secondary }]}>
              Volgende — Handtekening
            </Text>
            <Ionicons name="arrow-forward" size={20} color={secondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: primary }, saving && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={secondary} />
            ) : (
              <>
                <Ionicons name="send" size={20} color={secondary} />
                <Text style={[styles.primaryButtonText, { color: secondary }]}>
                  Opslaan & PDF versturen
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Modals */}
      {showKlantPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecteer Klant</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {klanten.map((klant: any) => (
                <TouchableOpacity
                  key={klant.id}
                  style={styles.modalOption}
                  onPress={() => { setSelectedKlant(klant); setShowKlantPicker(false); }}
                >
                  <Text style={styles.modalOptionText}>{klant.naam}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowKlantPicker(false)}>
              <Text style={styles.modalCancelText}>Annuleren</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showWerfPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecteer Werf</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {werven.map((werf: any) => (
                <TouchableOpacity
                  key={werf.id}
                  style={styles.modalOption}
                  onPress={() => { setSelectedWerf(werf); setShowWerfPicker(false); }}
                >
                  <Text style={styles.modalOptionText}>{werf.naam}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowWerfPicker(false)}>
              <Text style={styles.modalCancelText}>Annuleren</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F6FA',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1A1A2E', textAlign: 'center' },
  pageIndicators: { flexDirection: 'row', gap: 6, width: 40, justifyContent: 'flex-end' },
  pageIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E9ED' },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', marginBottom: 8 },
  input: {
    backgroundColor: '#F5F6FA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED', minHeight: 52,
  },
  inputLarge: { minHeight: 100, textAlignVertical: 'top' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  removeButton: { padding: 4 },
  pickerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F5F6FA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  pickerText: { fontSize: 16, color: '#1A1A2E' },
  placeholder: { color: '#8C9199' },
  signaturePage: { flex: 1 },
  signatureScrollSection: { maxHeight: 200 },
  signatureScrollContent: { padding: 16, paddingBottom: 8 },
  signatureFixedSection: { flex: 1, padding: 16, paddingTop: 8 },
  legalBox: {
    flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#F5F6FA',
    borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', marginTop: 12,
  },
  legalText: { flex: 1, fontSize: 12, color: '#6c757d', lineHeight: 17 },
  fixedFooter: {
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8E9ED',
    paddingHorizontal: 16, paddingTop: 12,
  },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12, minHeight: 56,
  },
  primaryButtonText: { fontSize: 18, fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginBottom: 16, textAlign: 'center' },
  modalOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  modalOptionText: { fontSize: 16, color: '#1A1A2E' },
  modalCancel: { marginTop: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 16, color: '#dc3545', fontWeight: '600' },
});
