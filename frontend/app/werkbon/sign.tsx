/**
 * Werkbon Sign - Signature Page (Step 4)
 * Final step: Sign the werkbon and submit
 * 
 * CRITICAL: The signature canvas is OUTSIDE the ScrollView
 * to prevent scrolling issues on the signature pad.
 * 
 * Features:
 * - Signer name input
 * - Signature canvas (web & native)
 * - Selfie camera capture
 * - GPS verification
 * - SMS verification button (DISABLED for now)
 * - Confirmation checkbox
 * - Submit to backend
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useWerkbonFormStore } from '../../store/werkbonFormStore';
import SignatureModal from '../../components/werkbon/SignatureModal';

// Legal text
const LEGAL_TEXT = `Door ondertekening van deze werkbon bevestigt de klant dat de hierboven beschreven werkzaamheden naar tevredenheid zijn uitgevoerd en dat de gegevens correct zijn. Deze werkbon dient als bewijs van uitgevoerde werkzaamheden en kan worden gebruikt voor facturatie.`;

// Dynamic import for native signature canvas
const getSignatureScreen = () => {
  if (Platform.OS === 'web') return null;
  try {
    return require('react-native-signature-canvas').default;
  } catch (e) {
    console.warn('react-native-signature-canvas not available');
    return null;
  }
};

// Native signature style
const nativeSignatureStyle = `.m-signature-pad { box-shadow: none; border: none; background-color: #FFFFFF; }
.m-signature-pad--body { border: none; background-color: #FFFFFF; }
.m-signature-pad--footer { display: none; margin: 0; }
canvas { background-color: #FFFFFF !important; }`;

// Web signature canvas
const WebSignatureCanvas = ({ onEnd, onClear, signatureRef }: any) => {
  const canvasRef = useRef(null) as any;
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const getPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: any) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    }
  };

  const draw = (e: any) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDrawing = (e: any) => {
    if (isDrawing.current) {
      e?.preventDefault?.();
      isDrawing.current = false;
      onEnd?.();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1A1A2E';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    onClear?.();
  };

  const readSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1A1A2E';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (!signatureRef) return;
    signatureRef.current = {
      clearSignature: clearCanvas,
      readSignature,
    };
  }, [signatureRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing, { passive: false });
    
    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={200}
      style={{
        width: '100%',
        height: 200,
        borderRadius: 12,
        border: '2px solid #E8E9ED',
        touchAction: 'none',
        backgroundColor: '#FFFFFF',
      }}
    />
  );
};

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function WerkbonSign() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const signatureRef = useRef<any>(null);
  
  const primary = theme?.primaryColor || '#F5A623';
  
  // Get all data from Zustand store
  const {
    type,
    klantId, klantNaam, manualKlantNaam,
    werfId, werfNaam, manualWerfNaam,
    datum, opmerkingen, gps, photos,
    urenData, opleveringData, projectData, prestatieData,
    signerName, signature, selfie, sendToCustomer, confirmationChecked,
    setSignerName, setSignature, setSelfie, setSendToCustomer, setConfirmationChecked,
    setGPS,
    validateStep, validationErrors, clearErrors,
    setSubmitting, setSubmitError, isSubmitting,
    clearDraft,
    getTypeData,
  } = useWerkbonFormStore();

  // Local state
  const [hasSignature, setHasSignature] = useState(false);
  const [nativeSignatureData, setNativeSignatureData] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [capturedSignature, setCapturedSignature] = useState<string | null>(null);

  // Redirect if no type selected
  useEffect(() => {
    if (!type) {
      router.replace('/werkbon');
    }
  }, [type]);

  // Auto-fetch GPS on mount if not already captured
  useEffect(() => {
    if (!gps.address && !gps.failed) {
      fetchGPS();
    }
  }, []);

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
      try {
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
      } catch (geoError) {
        // Geocoding failed but we have coords
        setGPS({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy,
          address: `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`,
          capturedAt: new Date().toISOString(),
          failed: false,
          failureReason: null,
        });
      }
    } catch (error: any) {
      console.error('GPS error:', error);
      setGPS({ failed: true, failureReason: 'unavailable' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSignatureOk = (sig: string) => {
    console.log('Signature OK received, length:', sig?.length);
    setNativeSignatureData(sig);
    setHasSignature(true);
    setSignature(sig);
  };

  const handleSignatureStart = () => {
    setHasSignature(true);
  };

  const handleSignatureEnd = () => {
    // When user finishes drawing, read the signature data
    if (Platform.OS !== 'web' && signatureRef.current?.readSignature) {
      signatureRef.current.readSignature();
    }
  };

  const handleSignatureClear = () => {
    setHasSignature(false);
    setNativeSignatureData(null);
    setSignature(null);
  };

  const clearSignatureCanvas = () => {
    if (signatureRef.current?.clearSignature) {
      signatureRef.current.clearSignature();
    }
    handleSignatureClear();
  };

  const handleTakeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Toestemming vereist', 'Camera toegang is nodig voor selfie.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.5,  // Reduced from 0.7 for smaller file size
        base64: true,
        allowsEditing: false,
        // Limit resolution to reduce file size significantly
        exif: false,  // Don't include EXIF data
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const selfieData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        
        // Log size for debugging
        if (asset.base64) {
          const sizeKB = Math.round(asset.base64.length / 1024);
          console.log(`Selfie captured: ${sizeKB} KB`);
        }
        
        setSelfie(selfieData);
      }
    } catch (error) {
      console.error('Selfie error:', error);
      Alert.alert('Fout', 'Kon selfie niet maken. Probeer opnieuw.');
    }
  };

  const removeSelfie = () => {
    setSelfie(null);
  };

  const handleSubmit = async () => {
    // Validate
    clearErrors();
    
    if (!signerName.trim()) {
      Alert.alert('Fout', 'Vul de naam van de ondertekenaar in');
      return;
    }
    
    if (!hasSignature) {
      Alert.alert('Fout', 'Handtekening is vereist');
      return;
    }
    
    if (!confirmationChecked) {
      Alert.alert('Fout', 'Bevestig de gegevens door het vakje aan te vinken');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Get signature data - now from modal
      let signatureData: string | null = capturedSignature || nativeSignatureData;

      if (!signatureData) {
        Alert.alert('Fout', 'Kon handtekening niet ophalen. Teken opnieuw.');
        setSubmitting(false);
        return;
      }

      // Build werkbon data
      const werkbonData = buildWerkbonData(signatureData);
      
      // Submit to API
      const endpoint = getEndpointForType(type || 'uren');
      const response = await axios.post(`${API_URL}${endpoint}`, werkbonData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data) {
        // Success - clear draft
        clearDraft();
        
        // Track email sending result
        let emailSent = false;
        let emailError = '';
        
        // Always send to ts@smart-techbv.be; optionally also to client if toggle is on
        if (response.data.id) {
          try {
            const verzendBase = getVerzendBaseForType(type || 'uren');
            const verzendUrl = `${API_URL}${verzendBase}/${response.data.id}/verzenden?force=true`;
            await axios.post(verzendUrl, {}, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            emailSent = true;
          } catch (emailErr: any) {
            console.warn('Email sending failed:', emailErr);
            emailSent = false;
            emailError = emailErr?.response?.data?.detail || 'Email kon niet worden verstuurd';
          }
        }

        // Show appropriate success message
        let successMessage = '';
        if (emailSent) {
          successMessage = 'Werkbon is succesvol opgeslagen en verstuurd naar de administratie!';
        } else {
          successMessage = `Werkbon is opgeslagen maar email kon niet worden verstuurd. ${emailError}`;
        }

        Alert.alert(
          'Succes',
          successMessage,
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      const errorMessage = error.response?.data?.detail || 'Er ging iets mis bij het opslaan. Probeer opnieuw.';
      setSubmitError(errorMessage);
      Alert.alert('Fout', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const buildWerkbonData = (signatureData: string) => {
    const displayKlant = klantNaam || manualKlantNaam;
    const displayWerf = werfNaam || manualWerfNaam;
    
    const baseData = {
      type,
      klant_id: klantId || null,
      klant_naam: displayKlant,
      werf_id: werfId || null,
      werf_naam: displayWerf,
      datum,
      opmerkingen,
      gps_locatie: gps.address || (gps.lat && gps.lng ? `${gps.lat}, ${gps.lng}` : null),
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      gps_accuracy: gps.accuracy,
      handtekening: signatureData,
      handtekening_naam: signerName,
      selfie: selfie || null,
      werknemer_id: user?.id || null,
      werknemer_naam: user?.naam || null,
      fotos: photos.map(p => ({
        data: p.uri,
        timestamp: p.timestamp,
      })),
      verstuur_naar_klant: sendToCustomer,
      timestamp: new Date().toISOString(),
    };

    // Add type-specific data
    switch (type) {
      case 'uren':
        return {
          ...baseData,
          week_nummer: urenData.weekNummer,
          jaar: urenData.jaar,
          // Backend expects 'uren' not 'uren_regels'
          uren: urenData.urenRegels.filter(r => r.teamlidNaam.trim()).map(r => ({
            naam: r.teamlidNaam,
            maandag: r.maandag || 0,
            dinsdag: r.dinsdag || 0,
            woensdag: r.woensdag || 0,
            donderdag: r.donderdag || 0,
            vrijdag: r.vrijdag || 0,
            zaterdag: r.zaterdag || 0,
            zondag: r.zondag || 0,
          })),
          km_afstand: urenData.kmAfstand ? {
            afstand: urenData.kmAfstand,
            beschrijving: '',
          } : null,
          uitgevoerde_werken: urenData.uitgevoerdeWerken || '',
          extra_materialen: urenData.extraMaterialen || '',
        };
        
      case 'oplevering':
        return {
          ...baseData,
          omschrijving: opleveringData?.omschrijving || '',
          opleverpunten: opleveringData?.opleverpunten || [],
        };
        
      case 'project':
        // Safely access project data with fallbacks
        const safeProjectData = projectData || {};
        const safeTaken = Array.isArray(safeProjectData.taken) 
          ? safeProjectData.taken.filter(t => t && typeof t === 'object')
          : [];
        const safeMaterialen = typeof safeProjectData.materialen === 'string' 
          ? safeProjectData.materialen 
          : '';
        
        return {
          ...baseData,
          project_naam: safeProjectData.projectNaam || '',
          uitgevoerde_werken: safeProjectData.uitgevoerdeWerken || '',
          taken: safeTaken.map(t => ({
            id: t.id || '',
            text: t.text || '',
            completed: Boolean(t.completed),
          })),
          materialen: safeMaterialen,
          gebruikte_machines: safeProjectData.gebruikteMachines || '',
          aantal_personen: safeProjectData.aantalPersonen || 1,
          start_time: safeProjectData.startTime || null,
          end_time: safeProjectData.endTime || null,
          status: safeProjectData.status || 'gestart',
          vervolgwerk_nodig: Boolean(safeProjectData.vervolgwerkNodig),
          vervolgwerk_beschrijving: safeProjectData.vervolgwerkBeschrijving || '',
          vervolgactie_datum: safeProjectData.vervolgactieDatum || null,
          hindernissen: safeProjectData.hindernissen || '',
          zone: safeProjectData.zone || '',
          contactpersoon: safeProjectData.contactpersoon || '',
        };
        
      case 'prestatie':
        return {
          ...baseData,
          werk_naam: prestatieData?.werkNaam || '',
          werk_omschrijving: prestatieData?.werkOmschrijving || '',
          hoeveelheid: prestatieData?.hoeveelheid || 0,
          eenheid: prestatieData?.eenheid || 'm²',
          dikte_cm: prestatieData?.dikteCm || 0,
          aantal_lagen: prestatieData?.aantalLagen || 1,
          zone: prestatieData?.zone || '',
        };
        
      default:
        return baseData;
    }
  };

  const getEndpointForType = (werkbonType: string) => {
    // Use unified endpoint for all types (new mobile app)
    return '/api/werkbonnen/unified';
  };

  // Returns the correct verzenden base path per type (matches backend route definitions)
  const getVerzendBaseForType = (werkbonType: string) => {
    switch (werkbonType) {
      case 'oplevering': return '/api/oplevering-werkbonnen';
      case 'project':    return '/api/project-werkbonnen';
      case 'prestatie':  return '/api/productie-werkbonnen';
      default:           return '/api/werkbonnen'; // uren + fallback
    }
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

  if (!type) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Ondertekenen</Text>
          <Text style={styles.headerStep}>Stap 3 van 3</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Signer Name */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Naam ondertekenaar *</Text>
          <TextInput
            style={styles.input}
            value={signerName}
            onChangeText={setSignerName}
            placeholder="Volledige naam"
            placeholderTextColor="#8C9199"
          />
        </View>

        {/* GPS Location */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.fieldLabel}>GPS Locatie</Text>
            {gpsLoading && <ActivityIndicator size="small" color={primary} />}
          </View>
          
          {gps.address ? (
            <View style={styles.gpsSuccess}>
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
              <TouchableOpacity style={styles.retryBtn} onPress={fetchGPS}>
                <Text style={[styles.retryBtnText, { color: primary }]}>Opnieuw</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.gpsButton, { borderColor: primary }]} onPress={fetchGPS}>
              <Ionicons name="navigate-outline" size={20} color={primary} />
              <Text style={[styles.gpsButtonText, { color: primary }]}>Locatie ophalen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selfie Section */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Verificatie Selfie</Text>
          <Text style={styles.fieldHint}>Maak een selfie ter verificatie van de ondertekening</Text>
          
          {selfie ? (
            <View style={styles.selfieContainer}>
              <Image source={{ uri: selfie }} style={styles.selfieImage} />
              <TouchableOpacity style={styles.removeSelfieBtn} onPress={removeSelfie}>
                <Ionicons name="close-circle" size={28} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.selfieButton, { borderColor: primary }]} onPress={handleTakeSelfie}>
              <Ionicons name="camera-outline" size={24} color={primary} />
              <Text style={[styles.selfieButtonText, { color: primary }]}>Selfie maken</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SMS Verification - DISABLED */}
        <View style={[styles.card, styles.cardDisabled]}>
          <View style={styles.cardHeader}>
            <Text style={styles.fieldLabel}>SMS Verificatie</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Binnenkort</Text>
            </View>
          </View>
          <Text style={styles.fieldHint}>SMS verificatie is nog niet beschikbaar</Text>
          <TouchableOpacity style={styles.disabledButton} disabled>
            <Ionicons name="chatbubble-outline" size={20} color="#C4C4C4" />
            <Text style={styles.disabledButtonText}>Verstuur SMS Code</Text>
          </TouchableOpacity>
        </View>

        {/* Signature Section - NEW MODAL-BASED APPROACH */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Klanthandtekening *</Text>
          <Text style={styles.fieldHint}>Tik hieronder om de handtekening te tekenen</Text>
          
          {capturedSignature ? (
            <View style={styles.signatureCapturedContainer}>
              <Image 
                source={{ uri: capturedSignature }} 
                style={styles.capturedSignatureImage}
                resizeMode="contain"
              />
              <View style={styles.signatureActions}>
                <View style={styles.signatureStatusBadge}>
                  <Ionicons name="checkmark-circle" size={18} color="#27ae60" />
                  <Text style={styles.signatureStatusText}>Handtekening vastgelegd</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.resignButton, { borderColor: primary }]}
                  onPress={() => setShowSignatureModal(true)}
                >
                  <Ionicons name="create-outline" size={18} color={primary} />
                  <Text style={[styles.resignButtonText, { color: primary }]}>Opnieuw tekenen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.signaturePromptButton, { borderColor: primary }]}
              onPress={() => setShowSignatureModal(true)}
            >
              <View style={styles.signaturePromptContent}>
                <Ionicons name="finger-print-outline" size={32} color={primary} />
                <Text style={[styles.signaturePromptText, { color: primary }]}>Tik hier om te tekenen</Text>
                <Text style={styles.signaturePromptHint}>Opent een apart scherm voor de handtekening</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Signature Modal */}
        <SignatureModal
          visible={showSignatureModal}
          onClose={() => setShowSignatureModal(false)}
          onSave={(signatureData: string) => {
            console.log('[Sign] Signature received from modal, length:', signatureData?.length);
            setCapturedSignature(signatureData);
            setHasSignature(true);
            setNativeSignatureData(signatureData);
            setSignature(signatureData);
          }}
          primaryColor={primary}
        />

        {/* Send to Customer Toggle */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleContent}>
            <Ionicons name="mail-outline" size={20} color={primary} />
            <Text style={styles.toggleText}>Ook versturen naar klant</Text>
          </View>
          <Switch
            value={sendToCustomer}
            onValueChange={setSendToCustomer}
            trackColor={{ false: '#E8E9ED', true: primary + '50' }}
            thumbColor={sendToCustomer ? primary : '#FFFFFF'}
          />
        </View>

        {/* Confirmation Checkbox */}
        <TouchableOpacity 
          style={styles.confirmationCard} 
          onPress={() => setConfirmationChecked(!confirmationChecked)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.checkbox,
            confirmationChecked && { backgroundColor: primary, borderColor: primary }
          ]}>
            {confirmationChecked && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
          <Text style={styles.confirmationText}>
            Ik bevestig dat alle ingevulde gegevens correct zijn en dat de werkzaamheden zoals beschreven zijn uitgevoerd.
          </Text>
        </TouchableOpacity>

        {/* Legal Text */}
        <View style={styles.legalBox}>
          <Ionicons name="document-text-outline" size={16} color="#6c757d" />
          <Text style={styles.legalText}>{LEGAL_TEXT}</Text>
        </View>
      </ScrollView>

      {/* Fixed Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!hasSignature || !confirmationChecked || isSubmitting) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!hasSignature || !confirmationChecked || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#1A1A2E" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={20} color="#1A1A2E" />
              <Text style={styles.submitButtonText}>Opslaan & Versturen</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  headerStep: { fontSize: 13, color: '#6C7A89', marginTop: 2 },
  
  content: {
    flex: 1,
    padding: 16,
  },
  
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 13,
    color: '#6C7A89',
    marginBottom: 12,
  },
  
  input: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  
  // GPS
  gpsSuccess: {
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  gpsButtonText: { fontSize: 15, fontWeight: '500' },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  retryBtnText: { fontSize: 14, fontWeight: '500' },
  
  // Selfie
  selfieContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  selfieImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#27ae60',
  },
  removeSelfieBtn: {
    position: 'absolute',
    top: -4,
    right: '30%',
  },
  selfieButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  selfieButtonText: { fontSize: 15, fontWeight: '500' },
  
  // Coming Soon Badge
  comingSoonBadge: {
    backgroundColor: '#F5A62320',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F5A623',
  },
  
  // Disabled Button
  disabledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F5F6FA',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  disabledButtonText: { fontSize: 15, color: '#C4C4C4' },
  
  // Signature - NEW Modal-based styles
  signatureCapturedContainer: {
    alignItems: 'center',
    gap: 12,
  },
  capturedSignatureImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#27ae60',
  },
  signatureActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  signatureStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  signatureStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#27ae60',
  },
  resignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  resignButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  signaturePromptButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
  },
  signaturePromptContent: {
    alignItems: 'center',
    gap: 8,
  },
  signaturePromptText: {
    fontSize: 16,
    fontWeight: '600',
  },
  signaturePromptHint: {
    fontSize: 12,
    color: '#8C9199',
    textAlign: 'center',
  },
  
  // OLD Signature styles - kept for reference but unused
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearButtonText: { fontSize: 13, fontWeight: '500' },
  signatureWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E8E9ED',
    height: 200,
  },
  fallbackSignature: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
  },
  fallbackText: { color: '#8C9199', fontSize: 14 },
  
  // Toggle
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  toggleContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleText: { fontSize: 15, color: '#1A1A2E', fontWeight: '500' },
  
  // Confirmation
  confirmationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#E8E9ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  confirmationText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A2E',
    lineHeight: 20,
  },
  
  // Legal
  legalBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    marginBottom: 20,
  },
  legalText: {
    flex: 1,
    fontSize: 11,
    color: '#6c757d',
    lineHeight: 16,
  },
  
  // Footer
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 56,
    backgroundColor: '#FFD966', // Light yellow for better visibility
  },
  submitButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#E8E9ED',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
});
