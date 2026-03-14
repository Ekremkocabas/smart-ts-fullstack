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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import SignatureScreen from 'react-native-signature-canvas';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { showAlert } from '../../utils/alerts';

const PRIVACY_TEXT = 'Persoonsgegevens worden verwerkt conform de AVG. Foto\'s en handtekening worden uitsluitend gebruikt voor administratieve doeleinden.';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const FEEDBACK_ITEMS = [
  'Werken uitgevoerd volgens planning',
  'Communicatie met klant was duidelijk',
  'Werf proper en veilig achtergelaten',
  'Afspraken correct nageleefd',
  'Klant tevreden over algemene prestatie',
];

type DayRow = {
  id: string;
  datum: string;
  start_tijd: string;
  stop_tijd: string;
  pauze_minuten: string;
  omschrijving: string;
};

const createDayRow = (seedDate?: string): DayRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  datum: seedDate || new Date().toISOString().slice(0, 10),
  start_tijd: '',
  stop_tijd: '',
  pauze_minuten: '0',
  omschrijving: '',
});

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

  const getPos = (event: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (event: any) => {
    event.preventDefault();
    hasDrawnRef.current = true;
    setIsDrawing(true);
    setLastPos(getPos(event));
  };

  const draw = (event: any) => {
    if (!isDrawing) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const current = getPos(event);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    setLastPos(current);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    onEnd?.();
  };

  useEffect(() => {
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
      style={{ width: '100%', height: 220, borderRadius: 14, border: '2px solid #E8E9ED', backgroundColor: '#FFFFFF', touchAction: 'none' }}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
    />
  );
};

export default function ProjectWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const signatureRef = useRef<any>(null);
  const pendingSubmitRef = useRef(false);
  const hasSignatureRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<1 | 2>(1);
  const [klanten, setKlanten] = useState<any[]>([]);
  const [werven, setWerven] = useState<any[]>([]);
  const [selectedKlant, setSelectedKlant] = useState<any | null>(null);
  const [selectedWerf, setSelectedWerf] = useState<any | null>(null);
  const [dayRows, setDayRows] = useState<DayRow[]>([createDayRow()]);
  const [workDescription, setWorkDescription] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [feedbackItems, setFeedbackItems] = useState(FEEDBACK_ITEMS.map((label) => ({ label, checked: false })));
  const [feedbackNote, setFeedbackNote] = useState('');
  const [overallRating, setOverallRating] = useState(0);
  const [sendToCustomer, setSendToCustomer] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState(''); // NOT auto-filled
  const [signatureValue, setSignatureValue] = useState<string | null>(null);
  // Page 2 new fields
  const [gpsLocatie, setGpsLocatie] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [selfieFoto, setSelfieFoto] = useState<string | null>(null);
  const [handtekeningDatum, setHandtekeningDatum] = useState(new Date().toISOString().slice(0, 10));

  const filteredWerven = useMemo(() => werven.filter((item) => item.klant_id === selectedKlant?.id), [selectedKlant, werven]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [klantenRes, wervenRes] = await Promise.all([fetch(`${API_URL}/api/klanten`), fetch(`${API_URL}/api/werven`)]);
      const klantenData = await klantenRes.json();
      const wervenData = await wervenRes.json();
      setKlanten(Array.isArray(klantenData) ? klantenData.filter((item: any) => item.actief) : []);
      setWerven(Array.isArray(wervenData) ? wervenData.filter((item: any) => item.actief) : []);
    } catch (error) {
      console.error(error);
      showAlert('Fout', 'Kon klanten en werven niet laden');
    } finally {
      setLoading(false);
    }
  };

  const selectKlant = (klant: any) => {
    setSelectedKlant(klant);
    setSelectedWerf(null);
    setCustomerEmail((prev) => prev || klant.email || '');
  };

  const updateDayRow = (id: string, field: keyof DayRow, value: string) => {
    setDayRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addDayRow = () => {
    const lastDate = dayRows[dayRows.length - 1]?.datum;
    const nextDate = lastDate ? new Date(new Date(lastDate).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : undefined;
    setDayRows((prev) => [...prev, createDayRow(nextDate)]);
  };

  const removeDayRow = (id: string) => {
    setDayRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const markSignaturePresent = () => {
    hasSignatureRef.current = true;
  };

  const clearSignature = () => {
    signatureRef.current?.clearSignature?.();
    hasSignatureRef.current = false;
    setSignatureValue(null);
  };

  const getGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { showAlert('Toegang nodig', 'Locatietoegang is vereist'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGpsLocatie(`${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
    } catch (e) { console.error(e); showAlert('Fout', 'Locatie ophalen mislukt'); }
    finally { setGpsLoading(false); }
  };

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert('Toegang nodig', 'Camera is nodig voor selfie'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, cameraType: ImagePicker.CameraType.front });
      if (!result.canceled && result.assets?.[0]?.base64) setSelfieFoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    } catch (e) { console.error(e); }
  };

  const validatePage1 = () => {
    if (!selectedKlant || !selectedWerf) { showAlert('Fout', 'Selecteer eerst klant en werf'); return false; }
    for (const row of dayRows) {
      if (!row.datum || !row.start_tijd || !row.stop_tijd) { showAlert('Fout', 'Elke werkdag moet datum, startuur en stopuur hebben'); return false; }
    }
    return true;
  };

  const handleSignatureOk = async (signature: string) => {
    hasSignatureRef.current = true;
    setSignatureValue(signature);
    if (pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      await submit(signature);
    }
  };

  const validateForm = () => {
    const hasWebSignature = Platform.OS === 'web' && !signatureRef.current?.isEmpty?.();
    if (!customerName.trim()) { showAlert('Fout', 'Vul de naam van de klant in'); return false; }
    if (!hasSignatureRef.current && !signatureValue && !hasWebSignature) { showAlert('Fout', 'Handtekening is verplicht'); return false; }
    if (!selfieFoto) { showAlert('Fout', 'Selfie foto is verplicht'); return false; }
    if (overallRating < 1) { showAlert('Fout', 'Geef een score van 1 tot 3 sterren'); return false; }
    if (sendToCustomer && !validateEmail(customerEmail)) { showAlert('Fout', 'Vul een geldig klant e-mailadres in'); return false; }
    return true;
  };

  const submit = async (signature: string) => {
    if (!user?.id || !user?.naam) { showAlert('Fout', 'Gebruiker niet gevonden'); return; }
    setSaving(true);
    try {
      const payload = {
        klant_id: selectedKlant.id,
        werf_id: selectedWerf.id,
        datum: dayRows[0].datum,
        dag_regels: dayRows.map((row) => ({
          datum: row.datum,
          start_tijd: row.start_tijd,
          stop_tijd: row.stop_tijd,
          pauze_minuten: parseInt(row.pauze_minuten || '0', 10) || 0,
          omschrijving: row.omschrijving.trim(),
        })),
        werk_beschrijving: workDescription.trim(),
        extra_opmerkingen: extraNotes.trim(),
        klant_feedback_items: feedbackItems,
        klant_feedback_opmerking: feedbackNote.trim(),
        klant_prestatie_score: overallRating,
        handtekening_klant: signature,
        handtekening_klant_naam: customerName.trim(),
        handtekening_monteur_naam: user.naam,
        selfie_foto: selfieFoto,
        gps_locatie: gpsLocatie || null,
        handtekening_datum_str: handtekeningDatum,
        verstuur_naar_klant: sendToCustomer,
        klant_email_override: sendToCustomer ? customerEmail.trim() : '',
      };
      const createResponse = await fetch(
        `${API_URL}/api/project-werkbonnen?user_id=${encodeURIComponent(user.id)}&user_naam=${encodeURIComponent(user.naam)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      const createData = await createResponse.json();
      if (!createResponse.ok) throw new Error(createData.detail || 'Project werkbon opslaan mislukt');
      const sendQuery = sendToCustomer ? `?klant_email=${encodeURIComponent(customerEmail.trim())}` : '';
      const sendResponse = await fetch(`${API_URL}/api/project-werkbonnen/${createData.id}/verzenden${sendQuery}`, { method: 'POST' });
      const sendData = await sendResponse.json();
      showAlert('Gelukt', sendData.email_sent ? `PDF verzonden` : 'Werkbon opgeslagen (e-mail niet verzonden)');
      router.back();
    } catch (error: any) {
      console.error(error);
      showAlert('Fout', error?.message || 'Project werkbon kon niet worden verwerkt');
    } finally {
      setSaving(false);
    }
  };

  const validateEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

  const handleSave = async () => {
    if (!validateForm()) return;
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

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <ActivityIndicator size="large" color={theme.primaryColor || '#F5A623'} />
      </SafeAreaView>
    );
  }

  const signaturePadStyle = `.m-signature-pad{box-shadow:none;border:none;}.m-signature-pad--body{border:2px solid #E8E9ED;border-radius:14px;overflow:hidden;}.m-signature-pad--footer{display:none;}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="project-screen">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity testID="project-back-button" style={styles.headerIconButton} onPress={() => { if (page === 2) { setPage(1); } else { router.back(); } }}>
            <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.headerTitle}>Project Werkbon</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E9ED' }, page === 1 && { backgroundColor: theme.primaryColor || '#F5A623' }]} />
              <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E9ED' }, page === 2 && { backgroundColor: theme.primaryColor || '#F5A623' }]} />
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {page === 1 && (
            <View style={styles.infoBanner}>
              <Ionicons name="time-outline" size={20} color={theme.primaryColor || '#F5A623'} />
              <Text style={styles.infoBannerText}>Pagina 1 van 2 — Werkdagen & gegevens</Text>
            </View>
          )}
          {page === 2 && (
            <View style={[styles.infoBanner, { backgroundColor: '#28a74515', borderColor: '#28a74535' }]}>
              <Ionicons name="pen-outline" size={20} color="#28a745" />
              <Text style={[styles.infoBannerText, { color: '#28a745' }]}>Pagina 2 van 2 — Handtekening & Bevestiging</Text>
            </View>
          )}

          {page === 1 && (
            <>
              <Text style={styles.sectionTitle}>Klant</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {klanten.map((klant) => (
                  <TouchableOpacity key={klant.id} testID={`project-klant-${klant.id}`}
                    style={[styles.chip, selectedKlant?.id === klant.id && { backgroundColor: theme.primaryColor || '#F5A623', borderColor: theme.primaryColor || '#F5A623' }]}
                    onPress={() => selectKlant(klant)}>
                    <Text style={[styles.chipText, selectedKlant?.id === klant.id && styles.chipTextActive]}>{klant.naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {!!selectedKlant && (
                <>
                  <Text style={styles.sectionTitle}>Werf</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {filteredWerven.map((werf) => (
                      <TouchableOpacity key={werf.id} testID={`project-werf-${werf.id}`}
                        style={[styles.chip, selectedWerf?.id === werf.id && { backgroundColor: theme.primaryColor || '#F5A623', borderColor: theme.primaryColor || '#F5A623' }]}
                        onPress={() => setSelectedWerf(werf)}>
                        <Text style={[styles.chipText, selectedWerf?.id === werf.id && styles.chipTextActive]}>{werf.naam}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <View style={styles.card} testID="project-days-card">
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.sectionTitle}>Werkdagen</Text>
                  <TouchableOpacity testID="project-add-day-button" style={[styles.smallActionButton, { backgroundColor: theme.primaryColor || '#F5A623' }]} onPress={addDayRow}>
                    <Ionicons name="add" size={18} color={theme.secondaryColor || '#000'} />
                    <Text style={[styles.smallActionButtonText, { color: theme.secondaryColor || '#000' }]}>Dag toevoegen</Text>
                  </TouchableOpacity>
                </View>
                {dayRows.map((row, index) => (
                  <View key={row.id} style={styles.dayCard} testID={`project-day-row-${index}`}>
                    <View style={styles.dayCardHeader}>
                      <Text style={styles.dayCardTitle}>Dag {index + 1}</Text>
                      {dayRows.length > 1 ? (
                        <TouchableOpacity testID={`project-remove-day-${index}`} onPress={() => removeDayRow(row.id)}>
                          <Ionicons name="trash-outline" size={18} color="#dc3545" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TextInput testID={`project-date-input-${index}`} style={styles.input} value={row.datum} onChangeText={(v) => updateDayRow(row.id, 'datum', v)} placeholder="YYYY-MM-DD" placeholderTextColor="#8C9199" />
                    <View style={styles.timeRow}>
                      <TextInput testID={`project-start-input-${index}`} style={[styles.input, styles.timeInput]} value={row.start_tijd} onChangeText={(v) => updateDayRow(row.id, 'start_tijd', v)} placeholder="07:00" placeholderTextColor="#8C9199" />
                      <TextInput testID={`project-stop-input-${index}`} style={[styles.input, styles.timeInput]} value={row.stop_tijd} onChangeText={(v) => updateDayRow(row.id, 'stop_tijd', v)} placeholder="16:00" placeholderTextColor="#8C9199" />
                      <TextInput testID={`project-break-input-${index}`} style={[styles.input, styles.breakInput]} value={row.pauze_minuten} onChangeText={(v) => updateDayRow(row.id, 'pauze_minuten', v)} placeholder="30" placeholderTextColor="#8C9199" keyboardType="number-pad" />
                    </View>
                    <TextInput testID={`project-day-note-input-${index}`} style={[styles.input, styles.mediumInput]} value={row.omschrijving} onChangeText={(v) => updateDayRow(row.id, 'omschrijving', v)} placeholder="Korte notitie voor deze dag" placeholderTextColor="#8C9199" multiline textAlignVertical="top" />
                  </View>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Project samenvatting</Text>
                <TextInput testID="project-description-input" style={[styles.input, styles.largeInput]} value={workDescription} onChangeText={setWorkDescription} placeholder="Algemene werkbeschrijving" placeholderTextColor="#8C9199" multiline textAlignVertical="top" />
                <TextInput testID="project-notes-input" style={[styles.input, styles.largeInput]} value={extraNotes} onChangeText={setExtraNotes} placeholder="Extra opmerkingen" placeholderTextColor="#8C9199" multiline textAlignVertical="top" />
              </View>

              <View style={styles.card} testID="project-feedback-card">
                <Text style={styles.sectionTitle}>Klant feedback over prestatie</Text>
                {feedbackItems.map((item, index) => (
                  <TouchableOpacity key={item.label} testID={`project-feedback-item-${index}`}
                    style={[styles.checkboxRow, item.checked && { borderColor: theme.primaryColor || '#F5A623', backgroundColor: '#FFF9EC' }]}
                    onPress={() => setFeedbackItems((prev) => prev.map((cur, i) => (i === index ? { ...cur, checked: !cur.checked } : cur)))}>
                    <View style={[styles.checkbox, item.checked && { backgroundColor: theme.primaryColor || '#F5A623', borderColor: theme.primaryColor || '#F5A623' }]}>
                      {item.checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                    <Text style={styles.checkboxText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
                <TextInput testID="project-feedback-note-input" style={[styles.input, styles.mediumInput]} value={feedbackNote} onChangeText={setFeedbackNote} placeholder="Extra feedback van klant" placeholderTextColor="#8C9199" multiline textAlignVertical="top" />
                <Text style={styles.ratingHint}>Algemene score</Text>
                <View style={styles.overallRatingRow}>
                  {[1, 2, 3].map((star) => (
                    <TouchableOpacity key={star} testID={`project-overall-rating-${star}`} style={styles.starButton} onPress={() => setOverallRating(star)}>
                      <Ionicons name={star <= overallRating ? 'star' : 'star-outline'} size={34} color={star <= overallRating ? (theme.primaryColor || '#F5A623') : '#CDD3DA'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primaryColor || '#F5A623' }]}
                onPress={() => { if (validatePage1()) setPage(2); }}>
                <Text style={[styles.primaryButtonText, { color: theme.secondaryColor || '#000' }]}>Volgende — Handtekening</Text>
                <Ionicons name="arrow-forward" size={20} color={theme.secondaryColor || '#000'} />
              </TouchableOpacity>
            </>
          )}

          {page === 2 && (
            <>
              {/* GPS */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Locatie</Text>
                <TouchableOpacity style={[styles.gpsButton, { borderColor: gpsLocatie ? '#28a745' : (theme.primaryColor || '#F5A623') }]} onPress={getGPS} disabled={gpsLoading}>
                  {gpsLoading ? <ActivityIndicator size="small" color={theme.primaryColor || '#F5A623'} /> : <Ionicons name="navigate" size={20} color={gpsLocatie ? '#28a745' : (theme.primaryColor || '#F5A623')} />}
                  <Text style={[styles.gpsButtonText, { color: gpsLocatie ? '#28a745' : (theme.primaryColor || '#F5A623') }]}>
                    {gpsLocatie ? `GPS: ${gpsLocatie}` : 'Locatie openen (GPS vastleggen)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Signature card */}
              <View style={styles.card} testID="project-signature-card">
                <Text style={styles.sectionTitle}>Klant handtekening *</Text>
                <Text style={{ fontSize: 13, color: '#6c757d' }}>Naam (verplicht — niet automatisch ingevuld)</Text>
                <TextInput testID="project-customer-name-input" style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Volledige naam klant" placeholderTextColor="#8C9199" autoCapitalize="words" />
                <Text style={{ fontSize: 13, color: '#6c757d' }}>Datum</Text>
                <TextInput style={styles.input} value={handtekeningDatum} onChangeText={setHandtekeningDatum} placeholder="YYYY-MM-DD" placeholderTextColor="#8C9199" />
                <View style={styles.signatureWrapper}>
                  {Platform.OS === 'web' ? (
                    <WebSignatureCanvas signatureRef={signatureRef} onEnd={markSignaturePresent} onClear={clearSignature} />
                  ) : (
                    <SignatureScreen ref={signatureRef} onBegin={markSignaturePresent} onOK={handleSignatureOk}
                      onEmpty={() => { hasSignatureRef.current = false; setSignatureValue(null); }}
                      webStyle={signaturePadStyle} descriptionText="" backgroundColor="#FFFFFF" penColor="#1A1A2E" imageType="image/png" />
                  )}
                </View>
                <TouchableOpacity testID="project-clear-signature-button" style={styles.secondaryButton} onPress={clearSignature}>
                  <Ionicons name="refresh" size={18} color="#1A1A2E" />
                  <Text style={styles.secondaryButtonText}>Handtekening leegmaken</Text>
                </TouchableOpacity>
              </View>

              {/* Selfie */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Selfie foto *</Text>
                <Text style={{ fontSize: 13, color: '#6c757d' }}>Neem een selfie ter bevestiging van aanwezigheid.</Text>
                {selfieFoto ? (
                  <View style={{ alignItems: 'center', gap: 10 }}>
                    <Image source={{ uri: selfieFoto }} style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#E8E9ED' }} />
                    <TouchableOpacity style={styles.secondaryButton} onPress={takeSelfie}>
                      <Ionicons name="camera-reverse" size={18} color="#6c757d" />
                      <Text style={[styles.secondaryButtonText, { color: '#6c757d' }]}>Opnieuw nemen</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={{ minHeight: 90, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.primaryColor || '#F5A623', alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'row' }} onPress={takeSelfie}>
                    <Ionicons name="person-circle-outline" size={32} color={theme.primaryColor || '#F5A623'} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.primaryColor || '#F5A623' }}>Selfie maken</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Send to client */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Sturen naar klant</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A2E', flex: 1 }}>PDF versturen naar klant</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity testID="project-send-customer-toggle"
                      style={[styles.toggleBtn, sendToCustomer && { backgroundColor: '#28a745', borderColor: '#28a745' }]}
                      onPress={() => { setSendToCustomer(true); if (!customerEmail.trim() && selectedKlant?.email) setCustomerEmail(selectedKlant.email); }}>
                      <Text style={[{ fontSize: 13, fontWeight: '700', color: '#4D5560' }, sendToCustomer && { color: '#fff' }]}>JA</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, !sendToCustomer && { backgroundColor: '#dc3545', borderColor: '#dc3545' }]} onPress={() => setSendToCustomer(false)}>
                      <Text style={[{ fontSize: 13, fontWeight: '700', color: '#4D5560' }, !sendToCustomer && { color: '#fff' }]}>NEE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {sendToCustomer && (
                  <TextInput testID="project-customer-email-input" style={[styles.input, { marginTop: 8 }]} value={customerEmail} onChangeText={setCustomerEmail}
                    placeholder="klant@email.com" placeholderTextColor="#8C9199" keyboardType="email-address" autoCapitalize="none" />
                )}
              </View>

              {/* Privacy notice */}
              <View style={{ flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#F5F6FA', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', marginBottom: 16 }}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#6c757d" />
                <Text style={{ flex: 1, fontSize: 12, color: '#6c757d', lineHeight: 17 }}>{PRIVACY_TEXT}</Text>
              </View>

              {/* Save */}
              <TouchableOpacity testID="project-save-send-button"
                style={[styles.primaryButton, { backgroundColor: theme.primaryColor || '#F5A623' }, saving && styles.primaryButtonDisabled]}
                onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.secondaryColor || '#000'} /> : (
                  <>
                    <Ionicons name="send" size={20} color={theme.secondaryColor || '#000'} />
                    <Text style={[styles.primaryButtonText, { color: theme.secondaryColor || '#000' }]}>Opslaan & PDF versturen</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loaderScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  headerSpacer: { width: 44 },
  content: { padding: 18, paddingBottom: 40 },
  infoBanner: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#FFF8E8', borderRadius: 14, borderWidth: 1, borderColor: '#F5E2B8', marginBottom: 18 },
  infoBannerText: { flex: 1, fontSize: 13, color: '#6B5A2A', lineHeight: 19 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  chipRow: { gap: 10, paddingBottom: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E9ED' },
  chipText: { color: '#4D5560', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginTop: 18, borderWidth: 1, borderColor: '#E8E9ED', gap: 12 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallActionButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallActionButtonText: { fontSize: 13, fontWeight: '700' },
  dayCard: { borderWidth: 1, borderColor: '#E8E9ED', borderRadius: 14, padding: 12, gap: 10, backgroundColor: '#FAFBFC' },
  dayCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayCardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#E1E6EC', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1A1A2E' },
  mediumInput: { minHeight: 88 },
  largeInput: { minHeight: 120 },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeInput: { flex: 1 },
  breakInput: { width: 90 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#E1E6EC', backgroundColor: '#FAFBFC', paddingHorizontal: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#C7CFD8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkboxText: { flex: 1, fontSize: 14, color: '#1A1A2E', fontWeight: '600' },
  ratingHint: { color: '#6C7580', fontSize: 13, marginTop: 6 },
  overallRatingRow: { flexDirection: 'row', gap: 8 },
  starButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  signatureWrapper: { minHeight: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#EEF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: '#1A1A2E', fontWeight: '700', fontSize: 14 },
  gpsButton: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, backgroundColor: '#FAFBFC' },
  gpsButtonText: { flex: 1, fontSize: 14, fontWeight: '600' },
  toggleBtn: { minWidth: 52, minHeight: 40, borderRadius: 10, borderWidth: 1.5, borderColor: '#E1E6EC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryButton: { minHeight: 54, marginTop: 24, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
});