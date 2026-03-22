/**
 * Prestatie / Productie Werkbon - Enhanced Version
 * 
 * Features:
 * - Dynamically add products (PUR, Chap, etc.)
 * - Each product has multiple floor entries (Verdieping, m², Dikte)
 * - Each product has extra work items (Stofzuiger, Schuren)
 * - Save locally or send immediately
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
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStore } from '../../store/appStore';
import SignatureModal from '../../components/werkbon/SignatureModal';
import { GPSLocation } from '../../components/werkbon/GPSLocation';
import { PhotoUpload } from '../../components/werkbon/PhotoUpload';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Product types available
const PRODUCT_TYPES = ['PUR', 'Chap', 'Cellenbeton', 'Glaswol', 'Rotswol', 'Anders'];

// Floor types
const FLOOR_TYPES = ['Gelijkvloers', '1ste Verdieping', '2de Verdieping', 'Zolder', 'Kelder', 'Anders'];

// Extra work types
const EXTRA_WORK_TYPES = ['Stofzuiger', 'Schuren', 'Afdekken', 'Opkuisen', 'Anders'];

// Interfaces
interface VerdiepingItem {
  id: string;
  naam: string;
  m2: string;
  dikteCm: string;
}

interface ExtraWerkItem {
  id: string;
  naam: string;
  m2: string;
}

interface ProductItem {
  id: string;
  productNaam: string;
  customProductNaam: string;
  verdiepingen: VerdiepingItem[];
  extraWerken: ExtraWerkItem[];
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const createEmptyVerdieping = (): VerdiepingItem => ({
  id: generateId(),
  naam: '',
  m2: '',
  dikteCm: '',
});

const createEmptyExtraWerk = (): ExtraWerkItem => ({
  id: generateId(),
  naam: '',
  m2: '',
});

const createEmptyProduct = (): ProductItem => ({
  id: generateId(),
  productNaam: '',
  customProductNaam: '',
  verdiepingen: [createEmptyVerdieping()],
  extraWerken: [],
});

export default function ProductieWerkbonScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const primary = theme.primaryColor || '#F5A623';

  // Page state
  const [page, setPage] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // Form data
  const [selectedKlant, setSelectedKlant] = useState<any>(null);
  const [selectedWerf, setSelectedWerf] = useState<any>(null);
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);
  const [opmerking, setOpmerking] = useState('');
  
  // Products (main data)
  const [producten, setProducten] = useState<ProductItem[]>([createEmptyProduct()]);
  
  // GPS
  const [gpsCoords, setGpsCoords] = useState('');
  const [gpsAddress, setGpsAddress] = useState('');
  
  // Photos
  const [photos, setPhotos] = useState<string[]>([]);
  
  // Signature
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureValue, setSignatureValue] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [confirmationChecked, setConfirmationChecked] = useState(false);

  // Data from store
  const { klanten, werven, fetchKlanten, fetchWervenByKlant } = useAppStore();
  
  // Pickers
  const [showKlantPicker, setShowKlantPicker] = useState(false);
  const [showWerfPicker, setShowWerfPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState<string | null>(null);
  const [showFloorPicker, setShowFloorPicker] = useState<{productId: string, verdiepingId: string} | null>(null);
  const [showExtraWorkPicker, setShowExtraWorkPicker] = useState<{productId: string, extraWerkId: string} | null>(null);

  useEffect(() => {
    fetchKlanten();
  }, []);

  useEffect(() => {
    if (selectedKlant?.id) {
      fetchWervenByKlant(selectedKlant.id);
      setSelectedWerf(null);
    }
  }, [selectedKlant]);

  // Product management
  const addProduct = () => {
    setProducten([...producten, createEmptyProduct()]);
  };

  const removeProduct = (productId: string) => {
    if (producten.length <= 1) {
      Alert.alert('Info', 'Minimaal één product vereist');
      return;
    }
    setProducten(producten.filter(p => p.id !== productId));
  };

  const updateProduct = (productId: string, field: keyof ProductItem, value: any) => {
    setProducten(producten.map(p => 
      p.id === productId ? { ...p, [field]: value } : p
    ));
  };

  // Verdieping management
  const addVerdieping = (productId: string) => {
    setProducten(producten.map(p => 
      p.id === productId 
        ? { ...p, verdiepingen: [...p.verdiepingen, createEmptyVerdieping()] }
        : p
    ));
  };

  const removeVerdieping = (productId: string, verdiepingId: string) => {
    setProducten(producten.map(p => {
      if (p.id !== productId) return p;
      if (p.verdiepingen.length <= 1) return p;
      return { ...p, verdiepingen: p.verdiepingen.filter(v => v.id !== verdiepingId) };
    }));
  };

  const updateVerdieping = (productId: string, verdiepingId: string, field: keyof VerdiepingItem, value: string) => {
    setProducten(producten.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        verdiepingen: p.verdiepingen.map(v => 
          v.id === verdiepingId ? { ...v, [field]: value } : v
        )
      };
    }));
  };

  // Extra werk management
  const addExtraWerk = (productId: string) => {
    setProducten(producten.map(p => 
      p.id === productId 
        ? { ...p, extraWerken: [...p.extraWerken, createEmptyExtraWerk()] }
        : p
    ));
  };

  const removeExtraWerk = (productId: string, extraWerkId: string) => {
    setProducten(producten.map(p => {
      if (p.id !== productId) return p;
      return { ...p, extraWerken: p.extraWerken.filter(e => e.id !== extraWerkId) };
    }));
  };

  const updateExtraWerk = (productId: string, extraWerkId: string, field: keyof ExtraWerkItem, value: string) => {
    setProducten(producten.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        extraWerken: p.extraWerken.map(e => 
          e.id === extraWerkId ? { ...e, [field]: value } : e
        )
      };
    }));
  };

  // Calculate totals
  const calculateTotals = () => {
    let totalM2 = 0;
    producten.forEach(p => {
      p.verdiepingen.forEach(v => {
        totalM2 += parseFloat(v.m2) || 0;
      });
    });
    return { totalM2: totalM2.toFixed(1) };
  };

  const validatePage1 = () => {
    if (!selectedKlant) {
      Alert.alert('Fout', 'Selecteer een klant');
      return false;
    }
    
    // Check at least one product with data
    const hasValidProduct = producten.some(p => {
      const productName = p.productNaam === 'Anders' ? p.customProductNaam : p.productNaam;
      return productName && p.verdiepingen.some(v => v.naam && v.m2);
    });
    
    if (!hasValidProduct) {
      Alert.alert('Fout', 'Voeg minimaal één product toe met verdieping en m²');
      return false;
    }
    
    return true;
  };

  const handleSave = async (sendEmail: boolean) => {
    if (!signatureValue) {
      Alert.alert('Fout', 'Handtekening is verplicht');
      return;
    }
    if (!signatureName.trim()) {
      Alert.alert('Fout', 'Naam ondertekenaar is verplicht');
      return;
    }
    if (!confirmationChecked) {
      Alert.alert('Fout', 'Bevestig de gegevens door het vakje aan te vinken');
      return;
    }

    setSaving(true);
    try {
      // Build payload
      const totals = calculateTotals();
      const payload = {
        datum,
        werknemer_id: user?.id,
        werknemer_naam: user?.naam,
        klant_id: selectedKlant?.id,
        klant_naam: selectedKlant?.naam || selectedKlant?.bedrijfsnaam,
        werf_id: selectedWerf?.id || null,
        werf_naam: selectedWerf?.naam || null,
        werf_adres: selectedWerf?.adres || null,
        
        // New structure: Products with floors and extra work
        producten: producten.map(p => ({
          product_naam: p.productNaam === 'Anders' ? p.customProductNaam : p.productNaam,
          verdiepingen: p.verdiepingen
            .filter(v => v.naam && v.m2)
            .map(v => ({
              naam: v.naam,
              m2: parseFloat(v.m2) || 0,
              dikte_cm: parseFloat(v.dikteCm) || 0,
            })),
          extra_werken: p.extraWerken
            .filter(e => e.naam && e.m2)
            .map(e => ({
              naam: e.naam,
              m2: parseFloat(e.m2) || 0,
            })),
        })),
        
        totaal_m2: parseFloat(totals.totalM2) || 0,
        opmerking,
        gps_locatie: gpsCoords || null,
        fotos: photos.map(p => ({ base64: p, timestamp: new Date().toISOString() })),
        handtekening: signatureValue,
        handtekening_naam: signatureName,
        handtekening_datum: new Date().toISOString(),
        ingevuld_door_id: user?.id,
        ingevuld_door_naam: user?.naam,
        status: sendEmail ? 'ondertekend' : 'concept',
        verstuur_naar_klant: sendEmail,
      };

      const response = await axios.post(
        `${BACKEND_URL}/api/productie-werkbonnen`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const werkbonId = response.data?.id;

      if (sendEmail && werkbonId) {
        try {
          await axios.post(
            `${BACKEND_URL}/api/productie-werkbonnen/${werkbonId}/verzenden`,
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          Alert.alert('Succes', 'Werkbon opgeslagen en verzonden!', [
            { text: 'OK', onPress: () => router.replace('/(tabs)') }
          ]);
        } catch (emailError) {
          console.warn('Email failed:', emailError);
          Alert.alert('Succes', 'Werkbon opgeslagen. E-mail verzenden is mislukt.', [
            { text: 'OK', onPress: () => router.replace('/(tabs)') }
          ]);
        }
      } else {
        Alert.alert('Succes', 'Werkbon opgeslagen!', [
          { text: 'OK', onPress: () => router.replace('/(tabs)') }
        ]);
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      Alert.alert('Fout', error.response?.data?.detail || 'Kon werkbon niet opslaan');
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureCapture = (sig: string) => {
    setSignatureValue(sig);
    setShowSignatureModal(false);
  };

  const { totalM2 } = calculateTotals();

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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Prestatie Werkbon</Text>
          <Text style={styles.headerSubtitle}>Stap {page} van 2</Text>
        </View>
        <View style={styles.pageIndicators}>
          <View style={[styles.pageIndicator, page >= 1 && { backgroundColor: primary }]} />
          <View style={[styles.pageIndicator, page >= 2 && { backgroundColor: primary }]} />
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
              <View style={styles.cardHeader}>
                <Ionicons name="business-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Klantgegevens</Text>
              </View>
              
              <Text style={styles.fieldLabel}>Klant *</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowKlantPicker(true)}
              >
                <Text style={[styles.pickerText, !selectedKlant && styles.placeholder]}>
                  {selectedKlant?.naam || selectedKlant?.bedrijfsnaam || 'Selecteer klant'}
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

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Datum</Text>
              <TextInput
                style={styles.input}
                value={datum}
                onChangeText={setDatum}
                placeholder="DD-MM-YYYY"
                placeholderTextColor="#8C9199"
              />
            </View>

            {/* Products Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="cube-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Producten</Text>
                <TouchableOpacity style={styles.addButton} onPress={addProduct}>
                  <Ionicons name="add-circle" size={24} color={primary} />
                </TouchableOpacity>
              </View>

              {producten.map((product, productIndex) => (
                <View key={product.id} style={styles.productCard}>
                  <View style={styles.productHeader}>
                    <Text style={styles.productNumber}>Product {productIndex + 1}</Text>
                    {producten.length > 1 && (
                      <TouchableOpacity onPress={() => removeProduct(product.id)}>
                        <Ionicons name="trash-outline" size={20} color="#dc3545" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Product Type */}
                  <Text style={styles.fieldLabel}>Product Type *</Text>
                  <TouchableOpacity 
                    style={styles.pickerButton}
                    onPress={() => setShowProductPicker(product.id)}
                  >
                    <Text style={[styles.pickerText, !product.productNaam && styles.placeholder]}>
                      {product.productNaam || 'Selecteer product'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#8C9199" />
                  </TouchableOpacity>

                  {product.productNaam === 'Anders' && (
                    <TextInput
                      style={[styles.input, { marginTop: 8 }]}
                      value={product.customProductNaam}
                      onChangeText={(v) => updateProduct(product.id, 'customProductNaam', v)}
                      placeholder="Voer product naam in"
                      placeholderTextColor="#8C9199"
                    />
                  )}

                  {/* Verdiepingen */}
                  <View style={styles.subSection}>
                    <View style={styles.subSectionHeader}>
                      <Text style={styles.subSectionTitle}>📐 Verdiepingen</Text>
                      <TouchableOpacity 
                        style={styles.smallAddButton}
                        onPress={() => addVerdieping(product.id)}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {product.verdiepingen.map((verdieping, vIndex) => (
                      <View key={verdieping.id} style={styles.verdiepingRow}>
                        <TouchableOpacity 
                          style={[styles.pickerButtonSmall, { flex: 2 }]}
                          onPress={() => setShowFloorPicker({ productId: product.id, verdiepingId: verdieping.id })}
                        >
                          <Text style={[styles.pickerTextSmall, !verdieping.naam && styles.placeholder]}>
                            {verdieping.naam || 'Verdieping'}
                          </Text>
                        </TouchableOpacity>
                        
                        <TextInput
                          style={[styles.inputSmall, { flex: 1 }]}
                          value={verdieping.m2}
                          onChangeText={(v) => updateVerdieping(product.id, verdieping.id, 'm2', v)}
                          placeholder="m²"
                          keyboardType="decimal-pad"
                          placeholderTextColor="#8C9199"
                        />
                        
                        <TextInput
                          style={[styles.inputSmall, { flex: 1 }]}
                          value={verdieping.dikteCm}
                          onChangeText={(v) => updateVerdieping(product.id, verdieping.id, 'dikteCm', v)}
                          placeholder="cm"
                          keyboardType="decimal-pad"
                          placeholderTextColor="#8C9199"
                        />

                        {product.verdiepingen.length > 1 && (
                          <TouchableOpacity 
                            style={styles.removeSmallButton}
                            onPress={() => removeVerdieping(product.id, verdieping.id)}
                          >
                            <Ionicons name="close-circle" size={20} color="#dc3545" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>

                  {/* Extra Werken */}
                  <View style={styles.subSection}>
                    <View style={styles.subSectionHeader}>
                      <Text style={styles.subSectionTitle}>🔧 Extra Werken</Text>
                      <TouchableOpacity 
                        style={styles.smallAddButton}
                        onPress={() => addExtraWerk(product.id)}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {product.extraWerken.length === 0 ? (
                      <Text style={styles.emptyText}>Geen extra werken toegevoegd</Text>
                    ) : (
                      product.extraWerken.map((extraWerk) => (
                        <View key={extraWerk.id} style={styles.extraWerkRow}>
                          <TouchableOpacity 
                            style={[styles.pickerButtonSmall, { flex: 2 }]}
                            onPress={() => setShowExtraWorkPicker({ productId: product.id, extraWerkId: extraWerk.id })}
                          >
                            <Text style={[styles.pickerTextSmall, !extraWerk.naam && styles.placeholder]}>
                              {extraWerk.naam || 'Extra werk'}
                            </Text>
                          </TouchableOpacity>
                          
                          <TextInput
                            style={[styles.inputSmall, { flex: 1 }]}
                            value={extraWerk.m2}
                            onChangeText={(v) => updateExtraWerk(product.id, extraWerk.id, 'm2', v)}
                            placeholder="m²"
                            keyboardType="decimal-pad"
                            placeholderTextColor="#8C9199"
                          />

                          <TouchableOpacity 
                            style={styles.removeSmallButton}
                            onPress={() => removeExtraWerk(product.id, extraWerk.id)}
                          >
                            <Ionicons name="close-circle" size={20} color="#dc3545" />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              ))}

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Totaal m²:</Text>
                <Text style={styles.totalValue}>{totalM2} m²</Text>
              </View>
            </View>

            {/* Remarks */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="chatbox-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Opmerkingen</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={opmerking}
                onChangeText={setOpmerking}
                placeholder="Eventuele opmerkingen..."
                placeholderTextColor="#8C9199"
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Photos */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="camera-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Foto's</Text>
              </View>
              <PhotoUpload
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={10}
              />
            </View>

            {/* GPS */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="location-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Locatie</Text>
              </View>
              <GPSLocation
                onLocationChange={(coords: string, address: string) => {
                  setGpsCoords(coords);
                  setGpsAddress(address);
                }}
              />
            </View>

            {/* Next Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: primary }]}
              onPress={() => {
                if (validatePage1()) setPage(2);
              }}
            >
              <Text style={styles.primaryButtonText}>Volgende: Ondertekenen</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={{ height: insets.bottom + 20 }} />
          </ScrollView>
        ) : (
          /* ========== PAGE 2: SIGNATURE ========== */
          <ScrollView 
            style={styles.flex} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Summary */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Samenvatting</Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Klant:</Text>
                <Text style={styles.summaryValue}>{selectedKlant?.naam || selectedKlant?.bedrijfsnaam}</Text>
              </View>
              {selectedWerf && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Werf:</Text>
                  <Text style={styles.summaryValue}>{selectedWerf.naam}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Datum:</Text>
                <Text style={styles.summaryValue}>{datum}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Totaal m²:</Text>
                <Text style={[styles.summaryValue, { color: primary, fontWeight: '700' }]}>{totalM2} m²</Text>
              </View>
              
              {producten.map((p, i) => (
                <View key={p.id} style={styles.productSummary}>
                  <Text style={styles.productSummaryTitle}>
                    {p.productNaam === 'Anders' ? p.customProductNaam : p.productNaam}
                  </Text>
                  {p.verdiepingen.filter(v => v.naam && v.m2).map(v => (
                    <Text key={v.id} style={styles.productSummaryItem}>
                      • {v.naam}: {v.m2} m² {v.dikteCm ? `(${v.dikteCm} cm)` : ''}
                    </Text>
                  ))}
                  {p.extraWerken.filter(e => e.naam && e.m2).map(e => (
                    <Text key={e.id} style={[styles.productSummaryItem, { color: '#3498db' }]}>
                      + {e.naam}: {e.m2} m²
                    </Text>
                  ))}
                </View>
              ))}
            </View>

            {/* Signature */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="finger-print-outline" size={20} color={primary} />
                <Text style={styles.sectionTitle}>Handtekening</Text>
              </View>

              <Text style={styles.fieldLabel}>Naam ondertekenaar *</Text>
              <TextInput
                style={styles.input}
                value={signatureName}
                onChangeText={setSignatureName}
                placeholder="Volledige naam"
                placeholderTextColor="#8C9199"
              />

              <TouchableOpacity
                style={[styles.signatureButton, signatureValue && styles.signatureButtonDone]}
                onPress={() => setShowSignatureModal(true)}
              >
                {signatureValue ? (
                  <View style={styles.signatureDone}>
                    <Ionicons name="checkmark-circle" size={24} color="#28a745" />
                    <Text style={styles.signatureDoneText}>Handtekening vastgelegd</Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="create-outline" size={24} color={primary} />
                    <Text style={[styles.signatureButtonText, { color: primary }]}>Teken hier</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Confirmation */}
              <TouchableOpacity
                style={styles.confirmationRow}
                onPress={() => setConfirmationChecked(!confirmationChecked)}
              >
                <View style={[styles.checkbox, confirmationChecked && { backgroundColor: primary, borderColor: primary }]}>
                  {confirmationChecked && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={styles.confirmationText}>
                  Ik bevestig dat bovenstaande gegevens correct zijn en dat de werkzaamheden naar tevredenheid zijn uitgevoerd.
                </Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.secondaryButton]}
                onPress={() => handleSave(false)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={primary} />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color={primary} />
                    <Text style={[styles.secondaryButtonText, { color: primary }]}>Opslaan</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: primary, flex: 2 }]}
                onPress={() => handleSave(true)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>Versturen</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ height: insets.bottom + 20 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Signature Modal */}
      <SignatureModal
        visible={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSignatureCapture}
        primaryColor={primary}
      />

      {/* Klant Picker Modal */}
      <Modal visible={showKlantPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecteer Klant</Text>
              <TouchableOpacity onPress={() => setShowKlantPicker(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {klanten.filter(k => k.actief !== false).map(klant => (
                <TouchableOpacity
                  key={klant.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setSelectedKlant(klant);
                    setShowKlantPicker(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{klant.naam || klant.bedrijfsnaam}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Werf Picker Modal */}
      <Modal visible={showWerfPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecteer Werf</Text>
              <TouchableOpacity onPress={() => setShowWerfPicker(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {werven.filter(w => w.klant_id === selectedKlant?.id && w.actief !== false).map(werf => (
                <TouchableOpacity
                  key={werf.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setSelectedWerf(werf);
                    setShowWerfPicker(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{werf.naam}</Text>
                  {werf.adres && <Text style={styles.modalOptionSubtext}>{werf.adres}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Product Type Picker Modal */}
      <Modal visible={!!showProductPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecteer Product</Text>
              <TouchableOpacity onPress={() => setShowProductPicker(null)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {PRODUCT_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={styles.modalOption}
                  onPress={() => {
                    if (showProductPicker) {
                      updateProduct(showProductPicker, 'productNaam', type);
                    }
                    setShowProductPicker(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Floor Picker Modal */}
      <Modal visible={!!showFloorPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecteer Verdieping</Text>
              <TouchableOpacity onPress={() => setShowFloorPicker(null)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {FLOOR_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={styles.modalOption}
                  onPress={() => {
                    if (showFloorPicker) {
                      updateVerdieping(showFloorPicker.productId, showFloorPicker.verdiepingId, 'naam', type);
                    }
                    setShowFloorPicker(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Extra Work Picker Modal */}
      <Modal visible={!!showExtraWorkPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecteer Extra Werk</Text>
              <TouchableOpacity onPress={() => setShowExtraWorkPicker(null)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {EXTRA_WORK_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={styles.modalOption}
                  onPress={() => {
                    if (showExtraWorkPicker) {
                      updateExtraWerk(showExtraWorkPicker.productId, showExtraWorkPicker.extraWerkId, 'naam', type);
                    }
                    setShowExtraWorkPicker(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  flex: { flex: 1 },
  scrollContent: { padding: 16 },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#E8E9ED' 
  },
  backButton: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#F5F6FA', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  headerSubtitle: { fontSize: 12, color: '#8C9199', marginTop: 2 },
  pageIndicators: { flexDirection: 'row', gap: 6 },
  pageIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E9ED' },
  
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: '#E8E9ED' 
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', flex: 1 },
  addButton: { padding: 4 },
  
  fieldLabel: { fontSize: 14, fontWeight: '500', color: '#4D5560', marginBottom: 8 },
  input: { 
    backgroundColor: '#F5F6FA', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 15, 
    color: '#1A1A2E', 
    borderWidth: 1, 
    borderColor: '#E8E9ED' 
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  
  pickerButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#F5F6FA', 
    borderRadius: 12, 
    padding: 14, 
    borderWidth: 1, 
    borderColor: '#E8E9ED' 
  },
  pickerText: { fontSize: 15, color: '#1A1A2E' },
  placeholder: { color: '#8C9199' },
  
  productCard: { 
    backgroundColor: '#FAFBFC', 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E8E9ED' 
  },
  productHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 12 
  },
  productNumber: { fontSize: 14, fontWeight: '600', color: '#F5A623' },
  
  subSection: { marginTop: 16 },
  subSectionHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 8 
  },
  subSectionTitle: { fontSize: 13, fontWeight: '600', color: '#4D5560' },
  smallAddButton: { 
    backgroundColor: '#3498db', 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  
  verdiepingRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginBottom: 8 
  },
  extraWerkRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginBottom: 8 
  },
  
  pickerButtonSmall: { 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    padding: 10, 
    borderWidth: 1, 
    borderColor: '#E8E9ED' 
  },
  pickerTextSmall: { fontSize: 13, color: '#1A1A2E' },
  inputSmall: { 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    padding: 10, 
    fontSize: 14, 
    color: '#1A1A2E', 
    borderWidth: 1, 
    borderColor: '#E8E9ED',
    textAlign: 'center'
  },
  removeSmallButton: { padding: 4 },
  
  emptyText: { fontSize: 13, color: '#8C9199', fontStyle: 'italic', padding: 8 },
  
  totalRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#F5A62310', 
    borderRadius: 10, 
    padding: 12, 
    marginTop: 12 
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#F5A623' },
  
  summaryRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F5F6FA' 
  },
  summaryLabel: { fontSize: 14, color: '#8C9199' },
  summaryValue: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  
  productSummary: { 
    backgroundColor: '#F5F6FA', 
    borderRadius: 8, 
    padding: 10, 
    marginTop: 12 
  },
  productSummaryTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  productSummaryItem: { fontSize: 13, color: '#4D5560', marginLeft: 8 },
  
  signatureButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    backgroundColor: '#F5F6FA', 
    borderRadius: 12, 
    padding: 20, 
    marginTop: 12, 
    borderWidth: 2, 
    borderColor: '#E8E9ED', 
    borderStyle: 'dashed' 
  },
  signatureButtonDone: { 
    borderColor: '#28a745', 
    backgroundColor: '#28a74510', 
    borderStyle: 'solid' 
  },
  signatureButtonText: { fontSize: 16, fontWeight: '600' },
  signatureDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signatureDoneText: { fontSize: 15, fontWeight: '600', color: '#28a745' },
  
  confirmationRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 12, 
    marginTop: 20, 
    padding: 12, 
    backgroundColor: '#FFF8E1', 
    borderRadius: 12 
  },
  checkbox: { 
    width: 24, 
    height: 24, 
    borderRadius: 6, 
    borderWidth: 2, 
    borderColor: '#E8E9ED', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  confirmationText: { flex: 1, fontSize: 13, color: '#4D5560', lineHeight: 18 },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  primaryButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    padding: 16, 
    borderRadius: 12, 
    flex: 1 
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  secondaryButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    padding: 16, 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: '#F5A623', 
    flex: 1 
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600' },
  
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 20, 
    maxHeight: '70%' 
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16, 
    paddingBottom: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#E8E9ED' 
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  modalOption: { 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F5F6FA' 
  },
  modalOptionText: { fontSize: 16, color: '#1A1A2E' },
  modalOptionSubtext: { fontSize: 13, color: '#8C9199', marginTop: 2 },
});
