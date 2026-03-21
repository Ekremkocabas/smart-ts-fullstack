import React, { useEffect, useState, useCallback } from 'react';
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
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';

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

// Responsive breakpoints
const getScreenSize = () => {
  const { width } = Dimensions.get('window');
  if (width < 480) return 'phone';
  if (width < 768) return 'tablet';
  return 'desktop';
};

// Color presets for picker
const COLOR_PRESETS = [
  '#F5A623', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#1A1A2E', '#16213E', '#0F3460', '#E94560', '#533483',
  '#2C3E50', '#34495E', '#27AE60', '#2980B9', '#8E44AD',
];

interface AdresStructured {
  straat: string;
  huisnummer: string;
  postcode: string;
  stad: string;
  land: string;
}

interface Branding {
  logo_url?: string;
  logo_base64?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

interface PdfTexts {
  voettekst: string;
  uren_bevestiging: string;
  oplevering_bevestiging: string;
  project_bevestiging: string;
  prestatie_bevestiging: string;
}

interface Instellingen {
  id?: string;
  company_id?: string;
  bedrijfsnaam: string;
  adres: string; // legacy
  adres_structured: AdresStructured;
  btw_nummer: string;
  ondernemingsnummer: string;
  email: string;
  werkbon_email: string;
  telefoon: string;
  website: string;
  branding: Branding;
  pdf_texts: PdfTexts;
  // Legacy fields for backward compatibility
  logo_base64?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  pdf_voettekst?: string;
  uren_confirmation_text?: string;
  oplevering_confirmation_text?: string;
  project_confirmation_text?: string;
}

const defaultInstellingen: Instellingen = {
  bedrijfsnaam: 'Smart-Tech BV',
  adres: '',
  adres_structured: {
    straat: '',
    huisnummer: '',
    postcode: '',
    stad: '',
    land: 'België',
  },
  btw_nummer: '',
  ondernemingsnummer: '',
  email: '',
  werkbon_email: '',
  telefoon: '',
  website: '',
  branding: {
    primary_color: '#F5A623',
    secondary_color: '#1A1A2E',
    accent_color: '#16213E',
  },
  pdf_texts: {
    voettekst: '',
    uren_bevestiging: '',
    oplevering_bevestiging: '',
    project_bevestiging: '',
    prestatie_bevestiging: '',
  },
};

export default function InstellingenAdmin() {
  const { user } = useAuth();
  const { refreshTheme } = useTheme();
  const [instellingen, setInstellingen] = useState<Instellingen>(defaultInstellingen);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenSize, setScreenSize] = useState(getScreenSize());
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [activeColorField, setActiveColorField] = useState<'primary' | 'secondary' | 'accent'>('primary');
  const [tempColor, setTempColor] = useState('#F5A623');

  // Handle screen resize
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setScreenSize(getScreenSize());
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => { 
    if (Platform.OS === 'web' && ['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
      fetchInstellingen(); 
    }
  }, [user]);

  const fetchInstellingen = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/instellingen');
      const data = res.data;
      if (data && data.bedrijfsnaam) {
        // Merge with defaults to ensure all fields exist
        const merged: Instellingen = {
          ...defaultInstellingen,
          ...data,
          adres_structured: {
            ...defaultInstellingen.adres_structured,
            ...(data.adres_structured || {}),
          },
          branding: {
            ...defaultInstellingen.branding,
            ...(data.branding || {}),
            // Legacy fallback
            logo_base64: data.branding?.logo_base64 || data.logo_base64,
            primary_color: data.branding?.primary_color || data.primary_color || '#F5A623',
            secondary_color: data.branding?.secondary_color || data.secondary_color || '#1A1A2E',
            accent_color: data.branding?.accent_color || data.accent_color || '#16213E',
          },
          pdf_texts: {
            ...defaultInstellingen.pdf_texts,
            ...(data.pdf_texts || {}),
            // Legacy fallback
            voettekst: data.pdf_texts?.voettekst || data.pdf_voettekst || '',
            uren_bevestiging: data.pdf_texts?.uren_bevestiging || data.uren_confirmation_text || '',
            oplevering_bevestiging: data.pdf_texts?.oplevering_bevestiging || data.oplevering_confirmation_text || '',
            project_bevestiging: data.pdf_texts?.project_bevestiging || data.project_confirmation_text || '',
          },
        };
        setInstellingen(merged);
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
      setInstellingen({ 
        ...instellingen, 
        branding: { ...instellingen.branding, logo_base64: result.assets[0].base64 } 
      });
    }
  };

  const openColorPicker = (field: 'primary' | 'secondary' | 'accent') => {
    setActiveColorField(field);
    const currentColor = field === 'primary' 
      ? instellingen.branding.primary_color 
      : field === 'secondary' 
        ? instellingen.branding.secondary_color 
        : instellingen.branding.accent_color;
    setTempColor(currentColor);
    setColorPickerVisible(true);
  };

  const applyColor = () => {
    setInstellingen({
      ...instellingen,
      branding: {
        ...instellingen.branding,
        [activeColorField === 'primary' ? 'primary_color' : activeColorField === 'secondary' ? 'secondary_color' : 'accent_color']: tempColor,
      },
    });
    setColorPickerVisible(false);
  };

  const saveInstellingen = async () => {
    setSaving(true);
    try {
      // Build payload with both new and legacy fields for compatibility
      const payload = {
        ...instellingen,
        // Legacy fields for backward compatibility
        logo_base64: instellingen.branding.logo_base64,
        primary_color: instellingen.branding.primary_color,
        secondary_color: instellingen.branding.secondary_color,
        accent_color: instellingen.branding.accent_color,
        pdf_voettekst: instellingen.pdf_texts.voettekst,
        uren_confirmation_text: instellingen.pdf_texts.uren_bevestiging,
        oplevering_confirmation_text: instellingen.pdf_texts.oplevering_bevestiging,
        project_confirmation_text: instellingen.pdf_texts.project_bevestiging,
      };
      
      await apiClient.put('/api/instellingen', payload);
      await refreshTheme();
      alert('Instellingen opgeslagen!');
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  const updateAdres = (field: keyof AdresStructured, value: string) => {
    setInstellingen({
      ...instellingen,
      adres_structured: { ...instellingen.adres_structured, [field]: value },
    });
  };

  const updatePdfText = (field: keyof PdfTexts, value: string) => {
    setInstellingen({
      ...instellingen,
      pdf_texts: { ...instellingen.pdf_texts, [field]: value },
    });
  };

  // CONDITIONAL RETURNS AFTER ALL HOOKS
  if (Platform.OS !== 'web') return null;
  
  if (!['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
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

  const isCompact = screenSize === 'phone';
  const isTablet = screenSize === 'tablet';

  return (
    <View style={styles.container}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Bedrijfsinstellingen</Text>
          {!isCompact && <Text style={styles.subtitle}>Beheer uw bedrijfsgegevens en branding</Text>}
        </View>
        <TouchableOpacity style={styles.saveHeaderBtn} onPress={saveInstellingen} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="save-outline" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={[styles.contentInner, isCompact && styles.contentCompact]}>
        {/* Logo Section */}
        <View style={[styles.section, isCompact && styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Logo</Text>
          <TouchableOpacity style={styles.logoUpload} onPress={pickLogo}>
            {instellingen.branding.logo_base64 ? (
              <Image source={{ uri: `data:image/png;base64,${instellingen.branding.logo_base64}` }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="image-outline" size={40} color="#6c757d" />
                <Text style={styles.logoPlaceholderText}>Klik om logo te uploaden</Text>
              </View>
            )}
          </TouchableOpacity>
          {instellingen.branding.logo_base64 && (
            <TouchableOpacity style={styles.removeLogo} onPress={() => setInstellingen({ ...instellingen, branding: { ...instellingen.branding, logo_base64: undefined } })}>
              <Text style={styles.removeLogoText}>Logo verwijderen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Company Details Section */}
        <View style={[styles.section, isCompact && styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Bedrijfsgegevens</Text>
          
          <Text style={styles.label}>Bedrijfsnaam *</Text>
          <TextInput style={styles.input} value={instellingen.bedrijfsnaam} onChangeText={(v) => setInstellingen({ ...instellingen, bedrijfsnaam: v })} placeholder="Bedrijfsnaam" placeholderTextColor="#6c757d" />
          
          <Text style={styles.label}>BTW-nummer</Text>
          <TextInput style={styles.input} value={instellingen.btw_nummer} onChangeText={(v) => setInstellingen({ ...instellingen, btw_nummer: v })} placeholder="BE0123456789" placeholderTextColor="#6c757d" />
          
          <Text style={styles.label}>Ondernemingsnummer</Text>
          <TextInput style={styles.input} value={instellingen.ondernemingsnummer} onChangeText={(v) => setInstellingen({ ...instellingen, ondernemingsnummer: v })} placeholder="0123.456.789" placeholderTextColor="#6c757d" />
        </View>

        {/* Address Section - Structured */}
        <View style={[styles.section, isCompact && styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Adres</Text>
          
          <View style={[styles.rowFields, isCompact && styles.rowFieldsCompact]}>
            <View style={[styles.fieldLarge, isCompact && styles.fieldFull]}>
              <Text style={styles.label}>Straat</Text>
              <TextInput style={styles.input} value={instellingen.adres_structured.straat} onChangeText={(v) => updateAdres('straat', v)} placeholder="Straatnaam" placeholderTextColor="#6c757d" />
            </View>
            <View style={[styles.fieldSmall, isCompact && styles.fieldHalf]}>
              <Text style={styles.label}>Nr.</Text>
              <TextInput style={styles.input} value={instellingen.adres_structured.huisnummer} onChangeText={(v) => updateAdres('huisnummer', v)} placeholder="123" placeholderTextColor="#6c757d" />
            </View>
          </View>
          
          <View style={[styles.rowFields, isCompact && styles.rowFieldsCompact]}>
            <View style={[styles.fieldSmall, isCompact && styles.fieldHalf]}>
              <Text style={styles.label}>Postcode</Text>
              <TextInput style={styles.input} value={instellingen.adres_structured.postcode} onChangeText={(v) => updateAdres('postcode', v)} placeholder="1000" placeholderTextColor="#6c757d" />
            </View>
            <View style={[styles.fieldLarge, isCompact && styles.fieldFull]}>
              <Text style={styles.label}>Stad</Text>
              <TextInput style={styles.input} value={instellingen.adres_structured.stad} onChangeText={(v) => updateAdres('stad', v)} placeholder="Brussel" placeholderTextColor="#6c757d" />
            </View>
          </View>
          
          <Text style={styles.label}>Land</Text>
          <TextInput style={styles.input} value={instellingen.adres_structured.land} onChangeText={(v) => updateAdres('land', v)} placeholder="België" placeholderTextColor="#6c757d" />
        </View>

        {/* Contact Section */}
        <View style={[styles.section, isCompact && styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Contact</Text>
          
          <Text style={styles.label}>Telefoon</Text>
          <TextInput style={styles.input} value={instellingen.telefoon} onChangeText={(v) => setInstellingen({ ...instellingen, telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
          
          <Text style={styles.label}>Uitgaand e-mailadres</Text>
          <TextInput style={styles.input} value={instellingen.email} onChangeText={(v) => setInstellingen({ ...instellingen, email: v })} placeholder="info@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
          
          <Text style={styles.label}>Inkomend werkbon e-mailadres</Text>
          <TextInput style={styles.input} value={instellingen.werkbon_email} onChangeText={(v) => setInstellingen({ ...instellingen, werkbon_email: v })} placeholder="werkbonnen@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
          
          <Text style={styles.label}>Website</Text>
          <TextInput style={styles.input} value={instellingen.website} onChangeText={(v) => setInstellingen({ ...instellingen, website: v })} placeholder="https://www.bedrijf.be" placeholderTextColor="#6c757d" />
        </View>

        {/* Branding Colors Section */}
        <View style={[styles.section, isCompact && styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Branding Kleuren</Text>
          <Text style={styles.sectionSubtitle}>Klik op een kleur om te wijzigen</Text>
          
          <View style={[styles.colorGrid, isCompact && styles.colorGridCompact]}>
            <TouchableOpacity style={styles.colorCard} onPress={() => openColorPicker('primary')}>
              <View style={[styles.colorSwatch, { backgroundColor: instellingen.branding.primary_color }]} />
              <Text style={styles.colorLabel}>Primair</Text>
              <Text style={styles.colorValue}>{instellingen.branding.primary_color}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.colorCard} onPress={() => openColorPicker('secondary')}>
              <View style={[styles.colorSwatch, { backgroundColor: instellingen.branding.secondary_color }]} />
              <Text style={styles.colorLabel}>Secundair</Text>
              <Text style={styles.colorValue}>{instellingen.branding.secondary_color}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.colorCard} onPress={() => openColorPicker('accent')}>
              <View style={[styles.colorSwatch, { backgroundColor: instellingen.branding.accent_color }]} />
              <Text style={styles.colorLabel}>Accent</Text>
              <Text style={styles.colorValue}>{instellingen.branding.accent_color}</Text>
            </TouchableOpacity>
          </View>
          
          {/* Live Preview */}
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Live Preview</Text>
            <View style={[styles.previewBar, { backgroundColor: instellingen.branding.primary_color }]}>
              <Text style={styles.previewBarText}>{instellingen.bedrijfsnaam || 'Bedrijfsnaam'}</Text>
            </View>
            <View style={[styles.previewContent, { backgroundColor: instellingen.branding.secondary_color }]}>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: instellingen.branding.accent_color }]}>
                <Text style={styles.previewButtonText}>Voorbeeld Knop</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* PDF Texts Section */}
        <View style={[styles.section, isCompact && styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>PDF Teksten</Text>
          
          <Text style={styles.label}>Algemene voettekst</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_texts.voettekst} onChangeText={(v) => updatePdfText('voettekst', v)} placeholder="Tekst onderaan elke PDF" placeholderTextColor="#6c757d" multiline />
          
          <Text style={styles.label}>Uren werkbon bevestiging</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_texts.uren_bevestiging} onChangeText={(v) => updatePdfText('uren_bevestiging', v)} placeholder="Bevestigingstekst voor uren werkbon" placeholderTextColor="#6c757d" multiline />
          
          <Text style={styles.label}>Oplevering bevestiging</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_texts.oplevering_bevestiging} onChangeText={(v) => updatePdfText('oplevering_bevestiging', v)} placeholder="Bevestigingstekst voor oplevering werkbon" placeholderTextColor="#6c757d" multiline />
          
          <Text style={styles.label}>Project werkbon bevestiging</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_texts.project_bevestiging} onChangeText={(v) => updatePdfText('project_bevestiging', v)} placeholder="Bevestigingstekst voor project werkbon" placeholderTextColor="#6c757d" multiline />
          
          <Text style={styles.label}>Prestatie werkbon bevestiging</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instellingen.pdf_texts.prestatie_bevestiging} onChangeText={(v) => updatePdfText('prestatie_bevestiging', v)} placeholder="Bevestigingstekst voor prestatie werkbon" placeholderTextColor="#6c757d" multiline />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={saveInstellingen} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Instellingen opslaan</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Color Picker Modal */}
      <Modal visible={colorPickerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isCompact && styles.modalContentCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kies een kleur</Text>
              <TouchableOpacity onPress={() => setColorPickerVisible(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            
            {/* Current color preview */}
            <View style={styles.currentColorRow}>
              <View style={[styles.currentColorPreview, { backgroundColor: tempColor }]} />
              <TextInput 
                style={styles.hexInput} 
                value={tempColor} 
                onChangeText={setTempColor} 
                placeholder="#F5A623"
                placeholderTextColor="#6c757d"
                maxLength={7}
              />
            </View>
            
            {/* Color presets grid */}
            <View style={styles.presetsGrid}>
              {COLOR_PRESETS.map((color) => (
                <TouchableOpacity 
                  key={color} 
                  style={[styles.presetColor, { backgroundColor: color }, tempColor === color && styles.presetColorActive]}
                  onPress={() => setTempColor(color)}
                />
              ))}
            </View>
            
            <TouchableOpacity style={styles.applyColorBtn} onPress={applyColor}>
              <Text style={styles.applyColorBtnText}>Kleur toepassen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  headerCompact: { padding: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, marginLeft: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' },
  titleCompact: { fontSize: 18 },
  subtitle: { fontSize: 13, color: '#6c757d' },
  saveHeaderBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#28a745', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  contentInner: { padding: 16, maxWidth: 900, alignSelf: 'center', width: '100%' },
  contentCompact: { padding: 12 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  sectionCompact: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#6c757d', marginBottom: 16 },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  
  // Row fields for address
  rowFields: { flexDirection: 'row', gap: 12 },
  rowFieldsCompact: { flexDirection: 'column', gap: 0 },
  fieldLarge: { flex: 2 },
  fieldSmall: { flex: 1 },
  fieldFull: { flex: 1, width: '100%' },
  fieldHalf: { flex: 1, width: '100%' },
  
  // Logo
  logoUpload: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#E8E9ED', borderRadius: 12, padding: 20, alignItems: 'center' },
  logoPreview: { width: 200, height: 100 },
  logoPlaceholder: { alignItems: 'center', gap: 8 },
  logoPlaceholderText: { color: '#6c757d', fontSize: 14 },
  removeLogo: { alignItems: 'center', marginTop: 12 },
  removeLogoText: { color: '#dc3545', fontSize: 14 },
  
  // Color grid
  colorGrid: { flexDirection: 'row', gap: 16, marginTop: 12 },
  colorGridCompact: { flexDirection: 'column', gap: 12 },
  colorCard: { flex: 1, backgroundColor: '#F5F6FA', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  colorSwatch: { width: 60, height: 60, borderRadius: 30, marginBottom: 8, borderWidth: 2, borderColor: '#E8E9ED' },
  colorLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  colorValue: { fontSize: 12, color: '#6c757d', marginTop: 4 },
  
  // Preview
  previewSection: { marginTop: 20, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E8E9ED' },
  previewTitle: { fontSize: 14, color: '#6c757d', marginBottom: 8, paddingHorizontal: 4 },
  previewBar: { padding: 16 },
  previewBarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  previewContent: { padding: 20, alignItems: 'center' },
  previewButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  previewButtonText: { color: '#fff', fontWeight: '600' },
  
  // Save button
  saveBtn: { backgroundColor: '#28a745', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 40 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  
  // No access
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 },
  modalContentCompact: { width: '95%', padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  currentColorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  currentColorPreview: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderColor: '#E8E9ED' },
  hexInput: { flex: 1, backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  presetColor: { width: 40, height: 40, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  presetColorActive: { borderColor: '#1A1A2E' },
  applyColorBtn: { backgroundColor: '#28a745', padding: 16, borderRadius: 12, alignItems: 'center' },
  applyColorBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
