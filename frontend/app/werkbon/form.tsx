/**
 * Werkbon Form - Dynamic Form (Step 2)
 * Displays form fields based on selected werkbon type
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStore } from '../../store/appStore';
import { 
  useWerkbonFormStore, 
  WerkbonType,
  createEmptyUrenRegel,
  getCurrentWeekNumber,
} from '../../store/werkbonFormStore';

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const EENHEDEN = ['m²', 'm³', 'meter', 'stuks', 'kg', 'liter'];
const PROJECT_STATUS = [
  { value: 'gestart', label: 'Gestart' },
  { value: 'in_uitvoering', label: 'In uitvoering' },
  { value: 'afgewerkt', label: 'Afgewerkt' },
  { value: 'niet_afgewerkt', label: 'Niet afgewerkt' },
  { value: 'wacht_op_goedkeuring', label: 'Wacht op goedkeuring' },
];

export default function WerkbonForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { klanten, werven, fetchKlanten, fetchWervenByKlant } = useAppStore();
  
  const {
    type,
    klantId, klantNaam, manualKlantNaam,
    werfId, werfNaam, manualWerfNaam,
    datum, opmerkingen, gps, photos,
    urenData, opleveringData, projectData, prestatieData,
    setKlant, setManualKlant, setWerf, setManualWerf,
    setDatum, setOpmerkingen, setGPS,
    addPhoto, removePhoto,
    setUrenData, addUrenRegel, removeUrenRegel, updateUrenRegel,
    setOpleveringData, toggleOpleverpunt, addOpleverpunt,
    setProjectData, addProjectTaak, toggleProjectTaak, removeProjectTaak,
    setPrestatieData,
    validateStep, validationErrors, clearErrors,
    nextStep,
  } = useWerkbonFormStore();

  const [isLoading, setIsLoading] = useState(true);
  const [klantWerven, setKlantWerven] = useState<any[]>([]);
  const [showKlantPicker, setShowKlantPicker] = useState(false);
  const [showWerfPicker, setShowWerfPicker] = useState(false);
  const [showManualKlant, setShowManualKlant] = useState(false);
  const [showManualWerf, setShowManualWerf] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [newOpleverpunt, setNewOpleverpunt] = useState('');
  const [newTaak, setNewTaak] = useState('');
  
  const primary = theme?.primaryColor || '#F5A623';

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Load werven when klant changes
  useEffect(() => {
    if (klantId) {
      loadKlantWerven(klantId);
    }
  }, [klantId]);

  const loadData = async () => {
    setIsLoading(true);
    await fetchKlanten();
    
    // Auto-fetch GPS
    await fetchGPS();
    
    // Initialize with user name for uren
    if (type === 'uren' && urenData.urenRegels.length === 0 && user?.naam) {
      addUrenRegel(user.naam);
    }
    
    setIsLoading(false);
  };

  const loadKlantWerven = async (klantId: string) => {
    const wervenData = await fetchWervenByKlant(klantId);
    setKlantWerven(wervenData);
  };

  const fetchGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGPS({ failed: true, failureReason: 'permission_denied' });
        setGpsLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Reverse geocode
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      let addressStr = '';
      if (address) {
        const parts = [address.street, address.streetNumber, address.postalCode, address.city].filter(Boolean);
        addressStr = parts.join(' ');
      }

      setGPS({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
        address: addressStr || `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`,
        capturedAt: new Date().toISOString(),
        failed: false,
        failureReason: null,
      });
    } catch (error: any) {
      console.error('GPS error:', error);
      setGPS({ failed: true, failureReason: 'unavailable' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handlePickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        addPhoto({
          id: `photo_${Date.now()}`,
          uri: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Photo pick error:', error);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Toestemming vereist', 'Camera toegang is nodig om foto\'s te maken.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        addPhoto({
          id: `photo_${Date.now()}`,
          uri: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Camera error:', error);
    }
  };

  const handleNext = () => {
    clearErrors();
    const errors = validateStep(2);
    if (errors.length > 0) {
      Alert.alert('Fout', errors.map(e => e.message).join('\n'));
      return;
    }
    nextStep();
    router.push('/werkbon/review');
  };

  const getTypeTitle = () => {
    switch (type) {
      case 'uren': return 'Uren Werkbon';
      case 'oplevering': return 'Oplevering';
      case 'project': return 'Project';
      case 'prestatie': return 'Prestatie';
      default: return 'Werkbon';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loadingText}>Laden...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!type) {
    router.replace('/werkbon');
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{getTypeTitle()}</Text>
            <Text style={styles.headerStep}>Stap 1 van 3</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Common Fields - Klant */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Klant *</Text>
            {klantId || klantNaam ? (
              <TouchableOpacity style={styles.selectedItem} onPress={() => setShowKlantPicker(true)}>
                <Ionicons name="business-outline" size={20} color={primary} />
                <Text style={styles.selectedItemText}>{klantNaam || manualKlantNaam}</Text>
                <Ionicons name="chevron-down" size={20} color="#6C7A89" />
              </TouchableOpacity>
            ) : (
              <View style={styles.pickerButtons}>
                <TouchableOpacity 
                  style={styles.pickerButton} 
                  onPress={() => setShowKlantPicker(true)}
                >
                  <Ionicons name="list-outline" size={20} color={primary} />
                  <Text style={styles.pickerButtonText}>Selecteer klant</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.pickerButton, styles.pickerButtonSecondary]}
                  onPress={() => setShowManualKlant(true)}
                >
                  <Ionicons name="create-outline" size={20} color="#6C7A89" />
                  <Text style={[styles.pickerButtonText, { color: '#6C7A89' }]}>Handmatig</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Werf */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Werf</Text>
            {werfId || werfNaam || manualWerfNaam ? (
              <TouchableOpacity style={styles.selectedItem} onPress={() => setShowWerfPicker(true)}>
                <Ionicons name="location-outline" size={20} color={primary} />
                <Text style={styles.selectedItemText}>{werfNaam || manualWerfNaam}</Text>
                <Ionicons name="chevron-down" size={20} color="#6C7A89" />
              </TouchableOpacity>
            ) : (
              <View style={styles.pickerButtons}>
                <TouchableOpacity 
                  style={styles.pickerButton}
                  onPress={() => klantId ? setShowWerfPicker(true) : Alert.alert('', 'Selecteer eerst een klant')}
                >
                  <Ionicons name="list-outline" size={20} color={primary} />
                  <Text style={styles.pickerButtonText}>Selecteer werf</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.pickerButton, styles.pickerButtonSecondary]}
                  onPress={() => setShowManualWerf(true)}
                >
                  <Ionicons name="create-outline" size={20} color="#6C7A89" />
                  <Text style={[styles.pickerButtonText, { color: '#6C7A89' }]}>Handmatig</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Datum */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datum</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="calendar-outline" size={20} color="#6C7A89" />
              <TextInput
                style={styles.input}
                value={datum}
                onChangeText={setDatum}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          {/* Type-specific fields */}
          {type === 'uren' && renderUrenFields()}
          {type === 'oplevering' && renderOpleveringFields()}
          {type === 'project' && renderProjectFields()}
          {type === 'prestatie' && renderPrestatieFields()}

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Foto's</Text>
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                <Ionicons name="camera-outline" size={24} color={primary} />
                <Text style={styles.photoButtonText}>Maak foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto}>
                <Ionicons name="images-outline" size={24} color={primary} />
                <Text style={styles.photoButtonText}>Galerij</Text>
              </TouchableOpacity>
            </View>
            {photos.length > 0 && (
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <View key={photo.id} style={styles.photoItem}>
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="image" size={24} color="#6C7A89" />
                      <Text style={styles.photoNumber}>{index + 1}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.removePhotoButton}
                      onPress={() => removePhoto(photo.id)}
                    >
                      <Ionicons name="close-circle" size={24} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* GPS */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>GPS Locatie (optioneel)</Text>
              {gpsLoading && <ActivityIndicator size="small" color={primary} />}
            </View>
            {gps.address ? (
              <View style={styles.gpsContainer}>
                <Ionicons name="location" size={20} color="#27ae60" />
                <Text style={styles.gpsText}>{gps.address}</Text>
                <TouchableOpacity onPress={fetchGPS}>
                  <Ionicons name="refresh-outline" size={20} color={primary} />
                </TouchableOpacity>
              </View>
            ) : gps.failed ? (
              <View style={styles.gpsError}>
                <Ionicons name="location-outline" size={20} color="#e74c3c" />
                <Text style={styles.gpsErrorText}>
                  {gps.failureReason === 'permission_denied' 
                    ? 'Locatietoegang geweigerd' 
                    : 'Locatie niet beschikbaar'}
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={fetchGPS}>
                  <Text style={[styles.retryButtonText, { color: primary }]}>Opnieuw</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.gpsButton} onPress={fetchGPS}>
                <Ionicons name="navigate-outline" size={20} color={primary} />
                <Text style={[styles.gpsButtonText, { color: primary }]}>Locatie ophalen</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Opmerkingen */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Opmerkingen</Text>
            <TextInput
              style={styles.textArea}
              value={opmerkingen}
              onChangeText={setOpmerkingen}
              placeholder="Extra notities..."
              multiline
              numberOfLines={4}
            />
          </View>
        </ScrollView>

        {/* Fixed Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: primary }]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Volgende</Text>
            <Ionicons name="arrow-forward" size={20} color="#1A1A2E" />
          </TouchableOpacity>
        </View>

        {/* Klant Picker Modal */}
        <Modal visible={showKlantPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Selecteer klant</Text>
                <TouchableOpacity onPress={() => setShowKlantPicker(false)}>
                  <Ionicons name="close" size={24} color="#1A1A2E" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={klanten.filter(k => k.actief)}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setKlant(item.id, item.naam);
                      setShowKlantPicker(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.naam}</Text>
                    {klantId === item.id && <Ionicons name="checkmark" size={20} color={primary} />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Geen klanten gevonden</Text>
                }
              />
            </View>
          </View>
        </Modal>

        {/* Werf Picker Modal */}
        <Modal visible={showWerfPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Selecteer werf</Text>
                <TouchableOpacity onPress={() => setShowWerfPicker(false)}>
                  <Ionicons name="close" size={24} color="#1A1A2E" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={klantWerven.filter(w => w.actief)}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setWerf(item.id, item.naam);
                      setShowWerfPicker(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.naam}</Text>
                    {werfId === item.id && <Ionicons name="checkmark" size={20} color={primary} />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Geen werven gevonden voor deze klant</Text>
                }
              />
            </View>
          </View>
        </Modal>

        {/* Manual Klant Modal */}
        <Modal visible={showManualKlant} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: 200 }]}>
              <Text style={styles.modalTitle}>Klantnaam invoeren</Text>
              <TextInput
                style={styles.modalInput}
                value={manualKlantNaam}
                onChangeText={(text) => setManualKlant(text)}
                placeholder="Klantnaam..."
                autoFocus
              />
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: primary }]}
                onPress={() => setShowManualKlant(false)}
              >
                <Text style={styles.modalButtonText}>Opslaan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Manual Werf Modal */}
        <Modal visible={showManualWerf} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: 200 }]}>
              <Text style={styles.modalTitle}>Werfnaam invoeren</Text>
              <TextInput
                style={styles.modalInput}
                value={manualWerfNaam}
                onChangeText={(text) => setManualWerf(text)}
                placeholder="Werfnaam..."
                autoFocus
              />
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: primary }]}
                onPress={() => setShowManualWerf(false)}
              >
                <Text style={styles.modalButtonText}>Opslaan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // ==========================================
  // TYPE-SPECIFIC RENDER FUNCTIONS
  // ==========================================

  function renderUrenFields() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Urenregistratie - Week {urenData.weekNummer}</Text>
        
        {urenData.urenRegels.map((regel, index) => (
          <View key={index} style={styles.urenRegelCard}>
            <View style={styles.urenRegelHeader}>
              <TextInput
                style={styles.teamlidInput}
                value={regel.teamlidNaam}
                onChangeText={(text) => updateUrenRegel(index, { teamlidNaam: text })}
                placeholder="Naam teamlid"
              />
              {urenData.urenRegels.length > 1 && (
                <TouchableOpacity onPress={() => removeUrenRegel(index)}>
                  <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.urenDagen}>
              {DAGEN_KORT.map((dag, dagIndex) => (
                <View key={dag} style={styles.urenDagColumn}>
                  <Text style={styles.urenDagLabel}>{dag}</Text>
                  <TextInput
                    style={styles.urenInput}
                    value={String(regel[DAGEN[dagIndex] as keyof typeof regel] || 0)}
                    onChangeText={(val) => updateUrenRegel(index, { [DAGEN[dagIndex]]: parseFloat(val) || 0 })}
                    keyboardType="numeric"
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        
        <TouchableOpacity style={styles.addButton} onPress={() => addUrenRegel()}>
          <Ionicons name="add-circle-outline" size={20} color={primary} />
          <Text style={[styles.addButtonText, { color: primary }]}>Teamlid toevoegen</Text>
        </TouchableOpacity>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Uitgevoerde werken</Text>
          <TextInput
            style={styles.textArea}
            value={urenData.uitgevoerdeWerken}
            onChangeText={(text) => setUrenData({ uitgevoerdeWerken: text })}
            placeholder="Beschrijving werkzaamheden..."
            multiline
            numberOfLines={3}
          />
        </View>
      </View>
    );
  }

  function renderOpleveringFields() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Oplevering Details</Text>
        
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Omschrijving *</Text>
          <TextInput
            style={styles.textArea}
            value={opleveringData.omschrijving}
            onChangeText={(text) => setOpleveringData({ omschrijving: text })}
            placeholder="Beschrijving van de werkzaamheden..."
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Opleverpunten</Text>
          {opleveringData.opleverpunten.map((punt) => (
            <TouchableOpacity
              key={punt.id}
              style={styles.checklistItem}
              onPress={() => toggleOpleverpunt(punt.id)}
            >
              <Ionicons 
                name={punt.checked ? 'checkbox' : 'square-outline'} 
                size={24} 
                color={punt.checked ? primary : '#6C7A89'} 
              />
              <Text style={[styles.checklistText, punt.checked && styles.checklistTextChecked]}>
                {punt.text}
              </Text>
            </TouchableOpacity>
          ))}
          
          <View style={styles.addItemRow}>
            <TextInput
              style={styles.addItemInput}
              value={newOpleverpunt}
              onChangeText={setNewOpleverpunt}
              placeholder="Nieuw punt toevoegen..."
            />
            <TouchableOpacity 
              style={[styles.addItemButton, { backgroundColor: primary }]}
              onPress={() => {
                if (newOpleverpunt.trim()) {
                  addOpleverpunt(newOpleverpunt.trim());
                  setNewOpleverpunt('');
                }
              }}
            >
              <Ionicons name="add" size={20} color="#1A1A2E" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  function renderProjectFields() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Project Details</Text>
        
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Project naam *</Text>
          <TextInput
            style={styles.input}
            value={projectData.projectNaam}
            onChangeText={(text) => setProjectData({ projectNaam: text })}
            placeholder="Project / referentie..."
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Uitgevoerde werken *</Text>
          <TextInput
            style={styles.textArea}
            value={projectData.uitgevoerdeWerken}
            onChangeText={(text) => setProjectData({ uitgevoerdeWerken: text })}
            placeholder="Beschrijving..."
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusButtons}>
            {PROJECT_STATUS.map((status) => (
              <TouchableOpacity
                key={status.value}
                style={[
                  styles.statusButton,
                  projectData.status === status.value && { backgroundColor: primary + '20', borderColor: primary }
                ]}
                onPress={() => setProjectData({ status: status.value as any })}
              >
                <Text style={[
                  styles.statusButtonText,
                  projectData.status === status.value && { color: primary }
                ]}>
                  {status.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Taken</Text>
          {projectData.taken.map((taak) => (
            <View key={taak.id} style={styles.taakItem}>
              <TouchableOpacity onPress={() => toggleProjectTaak(taak.id)}>
                <Ionicons 
                  name={taak.completed ? 'checkbox' : 'square-outline'} 
                  size={24} 
                  color={taak.completed ? primary : '#6C7A89'} 
                />
              </TouchableOpacity>
              <Text style={[styles.taakText, taak.completed && styles.taakTextCompleted]}>
                {taak.text}
              </Text>
              <TouchableOpacity onPress={() => removeProjectTaak(taak.id)}>
                <Ionicons name="close-circle-outline" size={20} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addItemRow}>
            <TextInput
              style={styles.addItemInput}
              value={newTaak}
              onChangeText={setNewTaak}
              placeholder="Nieuwe taak..."
            />
            <TouchableOpacity 
              style={[styles.addItemButton, { backgroundColor: primary }]}
              onPress={() => {
                if (newTaak.trim()) {
                  addProjectTaak(newTaak.trim());
                  setNewTaak('');
                }
              }}
            >
              <Ionicons name="add" size={20} color="#1A1A2E" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Zone / Verdieping</Text>
          <TextInput
            style={styles.input}
            value={projectData.zone}
            onChangeText={(text) => setProjectData({ zone: text })}
            placeholder="Bijv. gelijkvloers, verdieping 1..."
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Vervolgwerk nodig?</Text>
          <TouchableOpacity
            style={[styles.toggle, projectData.vervolgwerkNodig && { backgroundColor: primary }]}
            onPress={() => setProjectData({ vervolgwerkNodig: !projectData.vervolgwerkNodig })}
          >
            <Text style={[styles.toggleText, projectData.vervolgwerkNodig && { color: '#1A1A2E' }]}>
              {projectData.vervolgwerkNodig ? 'Ja' : 'Nee'}
            </Text>
          </TouchableOpacity>
        </View>

        {projectData.vervolgwerkNodig && (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Wat moet nog gebeuren?</Text>
            <TextInput
              style={styles.textArea}
              value={projectData.vervolgwerkBeschrijving}
              onChangeText={(text) => setProjectData({ vervolgwerkBeschrijving: text })}
              placeholder="Beschrijving..."
              multiline
            />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Hindernissen / Problemen</Text>
          <TextInput
            style={styles.textArea}
            value={projectData.hindernissen}
            onChangeText={(text) => setProjectData({ hindernissen: text })}
            placeholder="Eventuele problemen ter plaatse..."
            multiline
          />
        </View>
      </View>
    );
  }

  function renderPrestatieFields() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prestatie / Productie Details</Text>
        
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Werk / Product naam *</Text>
          <TextInput
            style={styles.input}
            value={prestatieData.werkNaam}
            onChangeText={(text) => setPrestatieData({ werkNaam: text })}
            placeholder="Bijv. PUR, CHAP, Stukadoor..."
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 2 }]}>
            <Text style={styles.fieldLabel}>Hoeveelheid *</Text>
            <TextInput
              style={styles.input}
              value={prestatieData.hoeveelheid?.toString() || ''}
              onChangeText={(text) => setPrestatieData({ hoeveelheid: parseFloat(text) || null })}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.fieldLabel}>Eenheid</Text>
            <View style={styles.eenheidPicker}>
              {EENHEDEN.slice(0, 3).map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.eenheidButton, prestatieData.eenheid === e && { backgroundColor: primary }]}
                  onPress={() => setPrestatieData({ eenheid: e as any })}
                >
                  <Text style={[styles.eenheidText, prestatieData.eenheid === e && { color: '#1A1A2E' }]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.eenheidPicker}>
              {EENHEDEN.slice(3).map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.eenheidButton, prestatieData.eenheid === e && { backgroundColor: primary }]}
                  onPress={() => setPrestatieData({ eenheid: e as any })}
                >
                  <Text style={[styles.eenheidText, prestatieData.eenheid === e && { color: '#1A1A2E' }]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Dikte (cm)</Text>
            <TextInput
              style={styles.input}
              value={prestatieData.dikteCm?.toString() || ''}
              onChangeText={(text) => setPrestatieData({ dikteCm: parseFloat(text) || null })}
              keyboardType="numeric"
              placeholder="Optioneel"
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.fieldLabel}>Aantal lagen</Text>
            <TextInput
              style={styles.input}
              value={prestatieData.aantalLagen?.toString() || ''}
              onChangeText={(text) => setPrestatieData({ aantalLagen: parseInt(text) || null })}
              keyboardType="numeric"
              placeholder="Optioneel"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Zone / Verdieping</Text>
          <TextInput
            style={styles.input}
            value={prestatieData.zone}
            onChangeText={(text) => setPrestatieData({ zone: text })}
            placeholder="Bijv. dak, gelijkvloers..."
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Omschrijving</Text>
          <TextInput
            style={styles.textArea}
            value={prestatieData.werkOmschrijving}
            onChangeText={(text) => setPrestatieData({ werkOmschrijving: text })}
            placeholder="Extra details..."
            multiline
          />
        </View>
      </View>
    );
  }
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6C7A89' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  headerStep: { fontSize: 13, color: '#6C7A89', marginTop: 2 },
  
  content: { flex: 1, padding: 16 },
  
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: '#6C7A89', marginBottom: 8 },
  
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1A1A2E',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  textArea: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#E8E9ED',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    gap: 10,
  },
  selectedItemText: { flex: 1, fontSize: 16, color: '#1A1A2E' },
  
  pickerButtons: { flexDirection: 'row', gap: 12 },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    padding: 14,
  },
  pickerButtonSecondary: { backgroundColor: '#F5F6FA' },
  pickerButtonText: { fontSize: 15, fontWeight: '500', color: '#F5A623' },
  
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  photoButtonText: { fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoItem: { position: 'relative' },
  photoPlaceholder: {
    width: 80, height: 80,
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoNumber: { fontSize: 12, color: '#6C7A89', marginTop: 4 },
  removePhotoButton: { position: 'absolute', top: -8, right: -8 },
  
  gpsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 12,
  },
  gpsText: { flex: 1, fontSize: 14, color: '#27ae60' },
  gpsError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 12,
  },
  gpsErrorText: { flex: 1, fontSize: 14, color: '#e74c3c' },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  gpsButtonText: { fontSize: 15, fontWeight: '500' },
  retryButton: { paddingHorizontal: 12, paddingVertical: 6 },
  retryButtonText: { fontSize: 14, fontWeight: '500' },
  
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  addButtonText: { fontSize: 15, fontWeight: '500' },
  
  // Uren specific
  urenRegelCard: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  urenRegelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamlidInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    marginRight: 8,
  },
  urenDagen: { flexDirection: 'row', justifyContent: 'space-between' },
  urenDagColumn: { alignItems: 'center', flex: 1 },
  urenDagLabel: { fontSize: 12, color: '#6C7A89', marginBottom: 4 },
  urenInput: {
    width: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  
  // Checklist
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
  },
  checklistText: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  checklistTextChecked: { color: '#6C7A89', textDecorationLine: 'line-through' },
  
  addItemRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  addItemInput: {
    flex: 1,
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  addItemButton: {
    width: 44, height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Project
  statusButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  statusButtonText: { fontSize: 13, color: '#6C7A89' },
  
  taakItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
  },
  taakText: { flex: 1, fontSize: 15, color: '#1A1A2E' },
  taakTextCompleted: { color: '#6C7A89', textDecorationLine: 'line-through' },
  
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 15, color: '#1A1A2E' },
  toggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
  },
  toggleText: { fontSize: 14, fontWeight: '500', color: '#6C7A89' },
  
  // Prestatie
  row: { flexDirection: 'row' },
  eenheidPicker: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  eenheidButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F5F6FA',
    alignItems: 'center',
  },
  eenheidText: { fontSize: 12, color: '#6C7A89' },
  
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  nextButtonText: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
  },
  modalItemText: { fontSize: 16, color: '#1A1A2E' },
  modalInput: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginVertical: 16,
  },
  modalButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  emptyText: { textAlign: 'center', color: '#6C7A89', paddingVertical: 20 },
});
