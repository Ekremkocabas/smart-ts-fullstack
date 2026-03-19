import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import SignatureScreen from 'react-native-signature-canvas';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { showAlert } from '../../utils/alerts';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Legal text for signature
const LEGAL_TEXT = 
  'De ondertekenaar bevestigt met zijn handtekening dat de ingevulde gegevens correct zijn en dat de werkzaamheden naar tevredenheid zijn uitgevoerd. ' +
  'Deze werkbon mag worden gebruikt voor administratieve verwerking en facturatie. ' +
  'De ondertekenaar geeft toestemming voor het maken en gebruiken van foto\'s indien deze nodig zijn voor werkrapportage of technische documentatie.';

// Max photo size: 5MB, max dimensions: 1920px
const MAX_PHOTO_SIZE_MB = 5;
const MAX_PHOTO_DIMENSION = 1920;

// Compress and resize photo to max 5MB
const compressPhoto = async (uri: string): Promise<string | null> => {
  try {
    // First resize to max dimensions
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_PHOTO_DIMENSION } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    
    // Check size (base64 is ~33% larger than binary)
    const estimatedSizeMB = (resized.base64?.length || 0) * 0.75 / (1024 * 1024);
    
    if (estimatedSizeMB > MAX_PHOTO_SIZE_MB) {
      // Further compress if still too large
      const moreCompressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return moreCompressed.base64 || null;
    }
    
    return resized.base64 || null;
  } catch (error) {
    console.error('Photo compression failed:', error);
    return null;
  }
};

const WebSignatureCanvas = ({ onEnd, onClear, signatureRef }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasDrawnRef = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1A1A2E';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    // Account for scaling between canvas internal size and displayed size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (cx - rect.left) * scaleX,
      y: (cy - rect.top) * scaleY,
    };
  };

  const startDraw = (e: any) => {
    e.preventDefault();
    hasDrawnRef.current = true;
    setIsDrawing(true);
    setLastPos(getPos(e));
  };
  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cur = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    setLastPos(cur);
  };
  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    onEnd?.();
  };

  useEffect(() => {
    if (!signatureRef) return;
    signatureRef.current = {
      clearSignature: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        hasDrawnRef.current = false;
        if (canvas && ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        onClear?.();
      },
      readSignature: () => canvasRef.current?.toDataURL('image/png') || null,
      isEmpty: () => !hasDrawnRef.current,
    };
  }, [onClear, signatureRef]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={220}
      style={{ width: '100%', height: 220, borderRadius: 14, border: '2px solid #E8E9ED', backgroundColor: '#FFFFFF', touchAction: 'none' } as any}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={stopDraw}
      onMouseLeave={stopDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={stopDraw}
    />
  );
};

type Foto = { base64: string; timestamp: string; werknemer_id: string; gps: string };

export default function ProductieWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();  // For responsive bottom padding
  const signatureRef = useRef<any>(null);
  const pendingSubmitRef = useRef(false);
  const hasSignatureRef = useRef(false);
  const primary = theme.primaryColor || '#F5A623';

  // Navigation between pages
  const [page, setPage] = useState<1 | 2>(1);

  // Data
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [klanten, setKlanten] = useState<any[]>([]);
  const [werven, setWerven] = useState<any[]>([]);
  const [selectedKlant, setSelectedKlant] = useState<any | null>(null);
  const [selectedWerf, setSelectedWerf] = useState<any | null>(null);

  // Page 1 fields
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [werknemerNaam, setWerknemerNaam] = useState(user?.naam || '');
  // Auto-format hour input: "6" → "6:00", "14" → "14:00"
  const formatHourInput = (value: string, setter: (v: string) => void) => {
    // Remove non-numeric and non-colon characters
    let cleaned = value.replace(/[^\d:]/g, '');
    
    // If user types just a number (1-24), auto-add :00
    if (/^\d{1,2}$/.test(cleaned) && !cleaned.includes(':')) {
      const num = parseInt(cleaned, 10);
      if (num >= 0 && num <= 24) {
        // Don't auto-format while typing - only format when it looks complete
        if (cleaned.length === 2 || (cleaned.length === 1 && num > 2)) {
          cleaned = `${cleaned}:00`;
        }
      }
    }
    setter(cleaned);
  };

  const [startUur, setStartUur] = useState('');
  const [eindUur, setEindUur] = useState('');
  const [voorzienUur, setVoorzienUur] = useState('');
  const [uitTeVoerenWerk, setUitTeVoerenWerk] = useState('');
  const [nodigMateriaal, setNodigMateriaal] = useState('');

  // PUR production
  const [gvM2, setGvM2] = useState('');
  const [gvCm, setGvCm] = useState('');
  const [v1M2, setV1M2] = useState('');
  const [v1Cm, setV1Cm] = useState('');
  const [v2M2, setV2M2] = useState('');
  const [v2Cm, setV2Cm] = useState('');

  // Extra work
  const [schuurwerken, setSchuurwerken] = useState(false);
  const [schuurwerkenM2, setSchuurwerkenM2] = useState('');
  const [stofzuigen, setStofzuigen] = useState(false);
  const [stofzuigenM2, setStofzuigenM2] = useState('');

  // Photos
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [opmerking, setOpmerking] = useState('');

  // Page 2 fields
  const [gpsLocatie, setGpsLocatie] = useState('');
  const [gpsAdres, setGpsAdres] = useState('');  // Human-readable address
  const [gpsLoading, setGpsLoading] = useState(false);
  const [signatureValue, setSignatureValue] = useState<string | null>(null);
  const [handtekeningNaam, setHandtekeningNaam] = useState('');
  const [handtekeningDatum, setHandtekeningDatum] = useState(new Date().toISOString().slice(0, 10));
  const [selfieFoto, setSelfieFoto] = useState<string | null>(null);
  const [verstuurNaarKlant, setVerstuurNaarKlant] = useState(false);
  const [klantEmail, setKlantEmail] = useState('');

  const filteredWerven = useMemo(
    () => werven.filter((w) => w.klant_id === selectedKlant?.id),
    [selectedKlant, werven]
  );

  const totaalM2 = useMemo(() => {
    return Math.round((parseFloat(gvM2 || '0') + parseFloat(v1M2 || '0') + parseFloat(v2M2 || '0')) * 100) / 100;
  }, [gvM2, v1M2, v2M2]);

  // Auto-calc voorziene uur from start/eind
  useEffect(() => {
    if (startUur && eindUur && /^\d{2}:\d{2}$/.test(startUur) && /^\d{2}:\d{2}$/.test(eindUur)) {
      const [sh, sm] = startUur.split(':').map(Number);
      const [eh, em] = eindUur.split(':').map(Number);
      const totalMin = (eh * 60 + em) - (sh * 60 + sm);
      if (totalMin > 0) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        setVoorzienUur(`${h}u${m > 0 ? m + 'm' : ''}`);
      }
    }
  }, [startUur, eindUur]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [kr, wr] = await Promise.all([
        fetch(`${API_URL}/api/klanten`),
        fetch(`${API_URL}/api/werven`),
      ]);
      const [kd, wd] = await Promise.all([kr.json(), wr.json()]);
      setKlanten(Array.isArray(kd) ? kd.filter((k: any) => k.actief) : []);
      setWerven(Array.isArray(wd) ? wd.filter((w: any) => w.actief) : []);
    } catch (e) {
      console.error(e);
      showAlert('Fout', 'Kon gegevens niet laden');
    } finally {
      setLoading(false);
    }
  };

  const getGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Toegang nodig', 'Locatietoegang is vereist');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
      setGpsLocatie(coords);
      
      // Try to get human-readable address using reverse geocoding
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (address) {
          const parts = [];
          if (address.street) parts.push(address.street);
          if (address.streetNumber) parts[0] = `${address.street} ${address.streetNumber}`;
          if (address.postalCode) parts.push(address.postalCode);
          if (address.city) parts.push(address.city);
          const formattedAddress = parts.join(', ');
          if (formattedAddress) {
            setGpsAdres(formattedAddress);
          }
        }
      } catch (geocodeError) {
        console.log('Reverse geocoding not available:', geocodeError);
        // Keep coordinates as fallback
      }
    } catch (e) {
      console.error(e);
      showAlert('Fout', 'Locatie ophalen mislukt');
    } finally {
      setGpsLoading(false);
    }
  };

  const pickPhoto = async () => {
    if (fotos.length >= 4) {
      showAlert('Maximum bereikt', 'Maximaal 4 foto\'s toegestaan');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const compressed = await compressPhoto(result.assets[0].uri);
        if (compressed) {
          addFoto(compressed);
        } else {
          showAlert('Fout', 'Foto kon niet worden verwerkt');
        }
      }
    } catch (e) { console.error(e); }
  };

  const takePhoto = async () => {
    if (fotos.length >= 4) {
      showAlert('Maximum bereikt', 'Maximaal 4 foto\'s toegestaan');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Toegang nodig', 'Camera toegang is nodig');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const compressed = await compressPhoto(result.assets[0].uri);
        if (compressed) {
          addFoto(compressed);
        } else {
          showAlert('Fout', 'Foto kon niet worden verwerkt');
        }
      }
    } catch (e) { console.error(e); }
  };

  const addFoto = (base64: string) => {
    const foto: Foto = {
      base64: `data:image/jpeg;base64,${base64}`,
      timestamp: new Date().toISOString(),
      werknemer_id: user?.id || '',
      gps: gpsLocatie,
    };
    setFotos((prev) => [...prev, foto]);
  };

  const removeFoto = (idx: number) => setFotos((prev) => prev.filter((_, i) => i !== idx));

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Toegang nodig', 'Camera toegang is nodig voor selfie');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 1, cameraType: ImagePicker.CameraType.front });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const compressed = await compressPhoto(result.assets[0].uri);
        if (compressed) {
          setSelfieFoto(`data:image/jpeg;base64,${compressed}`);
        } else {
          showAlert('Fout', 'Selfie kon niet worden verwerkt');
        }
      }
    } catch (e) { console.error(e); }
  };

  const clearSignature = () => {
    signatureRef.current?.clearSignature?.();
    hasSignatureRef.current = false;
    setSignatureValue(null);
  };

  const markSignaturePresent = () => { hasSignatureRef.current = true; };

  const handleSignatureOk = async (sig: string) => {
    hasSignatureRef.current = true;
    setSignatureValue(sig);
    if (pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      await submit(sig);
    }
  };

  const validatePage1 = () => {
    if (!selectedKlant) { showAlert('Fout', 'Selecteer een klant'); return false; }
    if (!selectedWerf) { showAlert('Fout', 'Selecteer een werf'); return false; }
    return true;
  };

  const validatePage2 = () => {
    const hasWebSig = Platform.OS === 'web' && !signatureRef.current?.isEmpty?.();
    if (!handtekeningNaam.trim()) { showAlert('Fout', 'Vul de naam in voor de handtekening'); return false; }
    if (!hasSignatureRef.current && !signatureValue && !hasWebSig) { showAlert('Fout', 'Handtekening is verplicht'); return false; }
    if (!selfieFoto) { showAlert('Fout', 'Selfie foto is verplicht'); return false; }
    if (verstuurNaarKlant && !klantEmail.trim()) { showAlert('Fout', 'Vul het e-mailadres van de klant in'); return false; }
    return true;
  };

  const submit = async (sig: string) => {
    if (!user?.id) return;
    setSaving(true);
    
    let werkbonSaved = false;
    let werkbonId = '';
    
    try {
      const payload = {
        datum,
        werknemer_naam: werknemerNaam.trim() || user.naam,
        werknemer_id: user.id,
        klant_id: selectedKlant!.id,
        werf_id: selectedWerf!.id,
        start_uur: startUur.trim(),
        eind_uur: eindUur.trim(),
        voorziene_uur: voorzienUur.trim(),
        uit_te_voeren_werk: uitTeVoerenWerk.trim(),
        nodige_materiaal: nodigMateriaal.trim(),
        gelijkvloers_m2: parseFloat(gvM2 || '0'),
        gelijkvloers_cm: parseFloat(gvCm || '0'),
        eerste_verdiep_m2: parseFloat(v1M2 || '0'),
        eerste_verdiep_cm: parseFloat(v1Cm || '0'),
        tweede_verdiep_m2: parseFloat(v2M2 || '0'),
        tweede_verdiep_cm: parseFloat(v2Cm || '0'),
        schuurwerken,
        schuurwerken_m2: schuurwerken ? parseFloat(schuurwerkenM2 || '0') : 0,
        stofzuigen,
        stofzuigen_m2: stofzuigen ? parseFloat(stofzuigenM2 || '0') : 0,
        fotos,
        opmerking: opmerking.trim(),
        gps_locatie: gpsLocatie || null,
        gps_adres: gpsAdres || null,
        handtekening: sig,
        handtekening_naam: handtekeningNaam.trim(),
        handtekening_datum: handtekeningDatum,
        selfie_foto: selfieFoto,
        verstuur_naar_klant: verstuurNaarKlant,
        klant_email_override: verstuurNaarKlant ? klantEmail.trim() : '',
      };

      // STEP 1: Save werkbon first (axios automatically sends JWT token)
      const createRes = await axios.post(
        `${API_URL}/api/productie-werkbonnen`,
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const createData = createRes.data;
      
      // Mark werkbon as saved successfully
      werkbonSaved = true;
      werkbonId = createData.id;

      // STEP 2: Try to send email (werkbon already saved)
      const sendQuery = verstuurNaarKlant ? `?klant_email=${encodeURIComponent(klantEmail.trim())}` : '';
      const sendRes = await axios.post(`${API_URL}/api/productie-werkbonnen/${werkbonId}/verzenden${sendQuery}`);
      const sendData = sendRes.data;

      // Show appropriate success message
      if (sendData.email_sent) {
        showAlert('Gelukt', 'Productie werkbon opgeslagen en PDF verzonden naar: ' + (sendData.recipients?.join(', ') || 'ontvangers'));
      } else {
        showAlert(
          'Werkbon Opgeslagen',
          `De werkbon is opgeslagen, maar de e-mail kon niet worden verzonden${sendData.email_error ? `: ${sendData.email_error}` : '.'}`
        );
      }
      router.back();
      
    } catch (error: any) {
      console.error('Productie werkbon error:', error);
      
      if (werkbonSaved) {
        // Werkbon was saved, but something went wrong after
        showAlert(
          'Werkbon Opgeslagen',
          `De werkbon is opgeslagen, maar er ging iets mis bij het verzenden: ${error?.message || 'Onbekende fout'}`
        );
        router.back();
      } else {
        // Werkbon was NOT saved
        showAlert('Fout', `Werkbon kon niet worden opgeslagen: ${error?.message || 'Onbekende fout'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validatePage2()) return;
    if (Platform.OS === 'web') {
      const sig = signatureRef.current?.readSignature?.() || signatureValue;
      if (!sig) { showAlert('Fout', 'Handtekening is verplicht'); return; }
      await submit(sig);
      return;
    }
    if (signatureValue) { await submit(signatureValue); return; }
    pendingSubmitRef.current = true;
    signatureRef.current?.readSignature?.();
  };

  const signaturePadStyle = `.m-signature-pad{box-shadow:none;border:none;}.m-signature-pad--body{border:2px solid #E8E9ED;border-radius:14px;overflow:hidden;}.m-signature-pad--footer{display:none;}body,html{background:#FFFFFF;}`;

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <ActivityIndicator size="large" color={primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => { if (page === 2) { setPage(1); } else { router.back(); } }}
          >
            <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Productie Werkbon</Text>
            <View style={styles.pageIndicator}>
              <View style={[styles.pageDot, page === 1 && { backgroundColor: primary }]} />
              <View style={[styles.pageDot, page === 2 && { backgroundColor: primary }]} />
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {page === 1 ? (
          /* ================ PAGE 1 ================ */
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.pageBanner, { backgroundColor: primary + '18', borderColor: primary + '40' }]}>
              <Ionicons name="construct-outline" size={18} color={primary} />
              <Text style={[styles.pageBannerText, { color: primary }]}>Pagina 1 van 2 — Productiegegevens</Text>
            </View>

            {/* Planning info */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Planning info</Text>
              <Text style={styles.fieldLabel}>Datum</Text>
              <TextInput style={styles.input} value={datum} onChangeText={setDatum} placeholder="YYYY-MM-DD" placeholderTextColor="#8C9199" />
              <Text style={styles.fieldLabel}>Naam werknemer</Text>
              <TextInput style={styles.input} value={werknemerNaam} onChangeText={setWerknemerNaam} placeholder="Naam werknemer" placeholderTextColor="#8C9199" />
              <View style={styles.timeRow}>
                <View style={styles.timeCell}>
                  <Text style={styles.fieldLabel}>Start uur</Text>
                  <TextInput style={styles.input} value={startUur} onChangeText={(v) => formatHourInput(v, setStartUur)} placeholder="07:00" placeholderTextColor="#8C9199" keyboardType="numeric" />
                </View>
                <View style={styles.timeCell}>
                  <Text style={styles.fieldLabel}>Eind uur</Text>
                  <TextInput style={styles.input} value={eindUur} onChangeText={(v) => formatHourInput(v, setEindUur)} placeholder="16:00" placeholderTextColor="#8C9199" keyboardType="numeric" />
                </View>
                <View style={styles.timeCell}>
                  <Text style={styles.fieldLabel}>Voorziene uur</Text>
                  <TextInput style={styles.input} value={voorzienUur} onChangeText={(v) => formatHourInput(v, setVoorzienUur)} placeholder="8:00" placeholderTextColor="#8C9199" keyboardType="numeric" />
                </View>
              </View>
            </View>

            {/* Klant */}
            <Text style={[styles.sectionTitle, { marginTop: 16, marginLeft: 4 }]}>Klant *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {klanten.map((k) => (
                <TouchableOpacity
                  key={k.id}
                  style={[styles.chip, selectedKlant?.id === k.id && { backgroundColor: primary, borderColor: primary }]}
                  onPress={() => { setSelectedKlant(k); setSelectedWerf(null); setKlantEmail((prev) => prev || k.email || ''); }}
                >
                  <Text style={[styles.chipText, selectedKlant?.id === k.id && styles.chipTextActive]}>{k.naam}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {!!selectedKlant && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 14, marginLeft: 4 }]}>Werf *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {filteredWerven.map((w) => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.chip, selectedWerf?.id === w.id && { backgroundColor: primary, borderColor: primary }]}
                      onPress={() => setSelectedWerf(w)}
                    >
                      <Text style={[styles.chipText, selectedWerf?.id === w.id && styles.chipTextActive]}>{w.naam}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Work description */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Werk beschrijving</Text>
              <Text style={styles.fieldLabel}>Uit te voeren werk</Text>
              <TextInput
                style={[styles.input, styles.largeInput]}
                value={uitTeVoerenWerk}
                onChangeText={setUitTeVoerenWerk}
                placeholder="Beschrijf de uit te voeren werkzaamheden..."
                placeholderTextColor="#8C9199"
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.fieldLabel}>Nodige materiaal</Text>
              <TextInput
                style={[styles.input, styles.mediumInput]}
                value={nodigMateriaal}
                onChangeText={setNodigMateriaal}
                placeholder="Materialen die nodig zijn..."
                placeholderTextColor="#8C9199"
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* PUR Production */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>PUR Productie</Text>
              {[
                { label: 'Gelijkvloers', m2: gvM2, setM2: setGvM2, cm: gvCm, setCm: setGvCm },
                { label: '1ste Verdiep', m2: v1M2, setM2: setV1M2, cm: v1Cm, setCm: setV1Cm },
                { label: '2de Verdiep', m2: v2M2, setM2: setV2M2, cm: v2Cm, setCm: setV2Cm },
              ].map((floor) => (
                <View key={floor.label} style={styles.floorRow}>
                  <Text style={styles.floorLabel}>{floor.label}</Text>
                  <View style={styles.floorInputs}>
                    <View style={styles.floorInput}>
                      <Text style={styles.floorInputLabel}>M²</Text>
                      <TextInput
                        style={[styles.input, styles.smallInput]}
                        value={floor.m2}
                        onChangeText={floor.setM2}
                        placeholder="0"
                        placeholderTextColor="#8C9199"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.floorInput}>
                      <Text style={styles.floorInputLabel}>CM dikte</Text>
                      <TextInput
                        style={[styles.input, styles.smallInput]}
                        value={floor.cm}
                        onChangeText={floor.setCm}
                        placeholder="0"
                        placeholderTextColor="#8C9199"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                </View>
              ))}
              <View style={[styles.totaalRow, { backgroundColor: primary + '15', borderColor: primary + '40' }]}>
                <Text style={styles.totaalLabel}>Totaal M²</Text>
                <Text style={[styles.totaalValue, { color: primary }]}>{totaalM2} m²</Text>
              </View>
            </View>

            {/* Schuurwerken */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Extra werkzaamheden</Text>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Schuurwerken</Text>
                <View style={styles.toggleButtons}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, schuurwerken && { backgroundColor: '#28a745', borderColor: '#28a745' }]}
                    onPress={() => setSchuurwerken(true)}
                  >
                    <Text style={[styles.toggleBtnText, schuurwerken && { color: '#fff' }]}>JA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !schuurwerken && { backgroundColor: '#dc3545', borderColor: '#dc3545' }]}
                    onPress={() => setSchuurwerken(false)}
                  >
                    <Text style={[styles.toggleBtnText, !schuurwerken && { color: '#fff' }]}>NEE</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {schuurwerken && (
                <View style={styles.conditionalField}>
                  <Text style={styles.fieldLabel}>Aantal M²</Text>
                  <TextInput
                    style={[styles.input, styles.smallInput]}
                    value={schuurwerkenM2}
                    onChangeText={setSchuurwerkenM2}
                    placeholder="0"
                    placeholderTextColor="#8C9199"
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              <View style={[styles.toggleRow, { marginTop: 12 }]}>
                <Text style={styles.toggleLabel}>Stofzuigen</Text>
                <View style={styles.toggleButtons}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, stofzuigen && { backgroundColor: '#28a745', borderColor: '#28a745' }]}
                    onPress={() => setStofzuigen(true)}
                  >
                    <Text style={[styles.toggleBtnText, stofzuigen && { color: '#fff' }]}>JA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !stofzuigen && { backgroundColor: '#dc3545', borderColor: '#dc3545' }]}
                    onPress={() => setStofzuigen(false)}
                  >
                    <Text style={[styles.toggleBtnText, !stofzuigen && { color: '#fff' }]}>NEE</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {stofzuigen && (
                <View style={styles.conditionalField}>
                  <Text style={styles.fieldLabel}>Aantal M²</Text>
                  <TextInput
                    style={[styles.input, styles.smallInput]}
                    value={stofzuigenM2}
                    onChangeText={setStofzuigenM2}
                    placeholder="0"
                    placeholderTextColor="#8C9199"
                    keyboardType="decimal-pad"
                  />
                </View>
              )}
            </View>

            {/* Photos */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.sectionTitle}>Werkfoto's</Text>
                <Text style={styles.photoCounter}>{fotos.length}/4</Text>
              </View>
              <Text style={styles.helperText}>Maximaal 4 foto's. GPS locatie wordt automatisch toegevoegd.</Text>
              <View style={styles.photoActionRow}>
                <TouchableOpacity style={styles.photoActionButton} onPress={takePhoto} disabled={fotos.length >= 4}>
                  <Ionicons name="camera-outline" size={20} color={primary} />
                  <Text style={styles.photoActionText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoActionButton} onPress={pickPhoto} disabled={fotos.length >= 4}>
                  <Ionicons name="images-outline" size={20} color="#3498db" />
                  <Text style={styles.photoActionText}>Galerij</Text>
                </TouchableOpacity>
              </View>
              {fotos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoPreviewScroll}>
                  {fotos.map((foto, idx) => (
                    <View key={idx} style={styles.photoPreview}>
                      <Image source={{ uri: foto.base64 }} style={styles.photoImage} />
                      <TouchableOpacity style={styles.removePhotoButton} onPress={() => removeFoto(idx)}>
                        <Ionicons name="close-circle" size={22} color="#dc3545" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Opmerking */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Opmerking</Text>
              <TextInput
                style={[styles.input, styles.mediumInput]}
                value={opmerking}
                onChangeText={setOpmerking}
                placeholder="Extra opmerkingen..."
                placeholderTextColor="#8C9199"
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        ) : (
          /* ================ PAGE 2 ================ */
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.pageBanner, { backgroundColor: '#28a74518', borderColor: '#28a74540' }]}>
              <Ionicons name="pencil-outline" size={18} color="#28a745" />
              <Text style={[styles.pageBannerText, { color: '#28a745' }]}>Pagina 2 van 2 — Handtekening & Bevestiging</Text>
            </View>

            {/* GPS */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Locatie</Text>
              <TouchableOpacity
                style={[styles.gpsButton, gpsLocatie ? { borderColor: '#28a745' } : { borderColor: primary }]}
                onPress={getGPS}
                disabled={gpsLoading}
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color={primary} />
                ) : (
                  <Ionicons name="navigate" size={20} color={gpsLocatie ? '#28a745' : primary} />
                )}
                <Text style={[styles.gpsButtonText, { color: gpsLocatie ? '#28a745' : primary }]}>
                  {gpsAdres ? gpsAdres : (gpsLocatie ? `GPS: ${gpsLocatie}` : 'Locatie openen (GPS vastleggen)')}
                </Text>
              </TouchableOpacity>
              {gpsAdres && gpsLocatie && (
                <Text style={{ fontSize: 12, color: '#6c757d', marginTop: 4 }}>Coördinaten: {gpsLocatie}</Text>
              )}
            </View>

            {/* Signature */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Klanthandtekening *</Text>
              <Text style={styles.fieldLabel}>Naam (verplicht — niet automatisch ingevuld)</Text>
              <TextInput
                style={styles.input}
                value={handtekeningNaam}
                onChangeText={setHandtekeningNaam}
                placeholder="Volledige naam"
                placeholderTextColor="#8C9199"
                autoCapitalize="words"
              />
              <Text style={styles.fieldLabel}>Datum</Text>
              <TextInput
                style={styles.input}
                value={handtekeningDatum}
                onChangeText={setHandtekeningDatum}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8C9199"
              />
              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Handtekening</Text>
              <View style={styles.signatureWrapper}>
                {Platform.OS === 'web' ? (
                  <WebSignatureCanvas signatureRef={signatureRef} onEnd={markSignaturePresent} onClear={clearSignature} />
                ) : (
                  <SignatureScreen
                    ref={signatureRef}
                    onBegin={markSignaturePresent}
                    onOK={handleSignatureOk}
                    onEmpty={() => { hasSignatureRef.current = false; setSignatureValue(null); }}
                    webStyle={signaturePadStyle}
                    descriptionText=""
                    backgroundColor="#FFFFFF"
                    penColor="#1A1A2E"
                    imageType="image/png"
                  />
                )}
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={clearSignature}>
                <Ionicons name="refresh" size={18} color="#1A1A2E" />
                <Text style={styles.secondaryButtonText}>Handtekening wissen</Text>
              </TouchableOpacity>
            </View>

            {/* Selfie */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Selfie foto *</Text>
              <Text style={styles.helperText}>Neem een selfie ter bevestiging van uw aanwezigheid.</Text>
              {selfieFoto ? (
                <View style={styles.selfiePreviewWrapper}>
                  <Image source={{ uri: selfieFoto }} style={styles.selfiePreview} />
                  <TouchableOpacity style={styles.retakeSelfieBtn} onPress={takeSelfie}>
                    <Ionicons name="camera-reverse" size={18} color="#fff" />
                    <Text style={styles.retakeSelfieBtnText}>Opnieuw</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.selfieButton, { borderColor: primary }]} onPress={takeSelfie}>
                  <Ionicons name="person-circle-outline" size={32} color={primary} />
                  <Text style={[styles.selfieButtonText, { color: primary }]}>Selfie maken</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Send to client */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Sturen naar klant</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>PDF versturen naar klant</Text>
                <View style={styles.toggleButtons}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, verstuurNaarKlant && { backgroundColor: '#28a745', borderColor: '#28a745' }]}
                    onPress={() => setVerstuurNaarKlant(true)}
                  >
                    <Text style={[styles.toggleBtnText, verstuurNaarKlant && { color: '#fff' }]}>JA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !verstuurNaarKlant && { backgroundColor: '#dc3545', borderColor: '#dc3545' }]}
                    onPress={() => setVerstuurNaarKlant(false)}
                  >
                    <Text style={[styles.toggleBtnText, !verstuurNaarKlant && { color: '#fff' }]}>NEE</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {verstuurNaarKlant && (
                <View style={styles.conditionalField}>
                  <Text style={styles.fieldLabel}>E-mailadres klant</Text>
                  <TextInput
                    style={styles.input}
                    value={klantEmail}
                    onChangeText={setKlantEmail}
                    placeholder="klant@email.com"
                    placeholderTextColor="#8C9199"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              )}
            </View>

            {/* Legal notice */}
            <View style={styles.privacyBox}>
              <Ionicons name="document-text-outline" size={18} color="#6c757d" />
              <Text style={styles.privacyText}>{LEGAL_TEXT}</Text>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      {/* Fixed footer with safe area padding */}
      <View style={[styles.fixedFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {page === 1 ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: primary }]}
            onPress={() => { if (validatePage1()) setPage(2); }}
          >
            <Text style={styles.primaryButtonText}>Volgende — Handtekening</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: primary }, saving && styles.primaryButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Opslaan & PDF versturen</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loaderScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  pageIndicator: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E9ED' },
  headerSpacer: { width: 44 },
  content: { padding: 16, paddingBottom: 30 },
  pageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  pageBannerText: { fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    gap: 10,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#4D5560', marginBottom: 4 },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1E6EC',
    backgroundColor: '#FAFBFC',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: '#1A1A2E',
  },
  mediumInput: { minHeight: 100 },
  largeInput: { minHeight: 130 },
  smallInput: { minHeight: 48 },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeCell: { flex: 1 },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E9ED' },
  chipText: { color: '#4D5560', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },

  floorRow: { borderWidth: 1, borderColor: '#E8E9ED', borderRadius: 12, padding: 12, gap: 8, backgroundColor: '#FAFBFC' },
  floorLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  floorInputs: { flexDirection: 'row', gap: 12 },
  floorInput: { flex: 1 },
  floorInputLabel: { fontSize: 12, color: '#6c757d', marginBottom: 4 },

  totaalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5 },
  totaalLabel: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  totaalValue: { fontSize: 22, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', flex: 1 },
  toggleButtons: { flexDirection: 'row', gap: 8 },
  toggleBtn: { minWidth: 52, minHeight: 40, borderRadius: 10, borderWidth: 1.5, borderColor: '#E1E6EC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#4D5560' },
  conditionalField: { marginTop: 8, paddingLeft: 8 },
  helperText: { fontSize: 12, color: '#6c757d', lineHeight: 17 },

  photoActionRow: { flexDirection: 'row', gap: 10 },
  photoActionButton: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E1E6EC', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoActionText: { fontSize: 12, fontWeight: '600', color: '#4D5560' },
  photoCounter: { fontSize: 13, color: '#6c757d', fontWeight: '600' },
  photoPreviewScroll: { marginTop: 4 },
  photoPreview: { width: 100, height: 100, borderRadius: 12, marginRight: 10, position: 'relative' },
  photoImage: { width: '100%', height: '100%', borderRadius: 12 },
  removePhotoButton: { position: 'absolute', right: -6, top: -6 },

  gpsButton: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, backgroundColor: '#FAFBFC' },
  gpsButtonText: { flex: 1, fontSize: 14, fontWeight: '600' },

  signatureWrapper: { minHeight: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E6EC' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#EEF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: '#1A1A2E', fontWeight: '600', fontSize: 14 },

  selfieButton: { minHeight: 90, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FAFBFC' },
  selfieButtonText: { fontSize: 15, fontWeight: '700' },
  selfiePreviewWrapper: { alignItems: 'center', gap: 10 },
  selfiePreview: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#E8E9ED' },
  retakeSelfieBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6c757d', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  retakeSelfieBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  privacyBox: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#F5F6FA', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', marginBottom: 16 },
  privacyText: { flex: 1, fontSize: 12, color: '#6c757d', lineHeight: 17 },

  primaryButton: { 
    minHeight: 56, 
    borderRadius: 14, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginHorizontal: 0,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bottomSpacer: { height: 120 },  // Extra space for fixed footer
  fixedFooter: {
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
});
