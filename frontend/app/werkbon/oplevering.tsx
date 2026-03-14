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
import SignatureScreen from 'react-native-signature-canvas';
import { useAuth } from '../../context/AuthContext';
import { showAlert } from '../../utils/alerts';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const RATING_CATEGORIES = [
  'Kwaliteit van afwerking',
  'Netheid werkplek',
  'Communicatie',
  'Stiptheid',
  'Algemene tevredenheid',
];

type RatingMap = Record<string, number>;

const WebSignatureCanvas = ({ onEnd, onClear, signatureRef }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: any) => {
    e.preventDefault();
    setIsDrawing(true);
    setLastPos(getPos(e));
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const currentPos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();
    setLastPos(currentPos);
  };

  const stopDrawing = () => {
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
        if (canvas && ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        onClear?.();
      },
      readSignature: () => canvasRef.current?.toDataURL('image/png') || null,
    };
  }, [onClear, signatureRef]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={220}
      style={{
        width: '100%',
        height: 220,
        borderRadius: 14,
        border: '2px solid #E8E9ED',
        backgroundColor: '#FFFFFF',
        touchAction: 'none',
      }}
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

export default function OpleveringWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const signatureRef = useRef<any>(null);
  const pendingSubmitRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [klanten, setKlanten] = useState<any[]>([]);
  const [werven, setWerven] = useState<any[]>([]);
  const [selectedKlant, setSelectedKlant] = useState<any | null>(null);
  const [selectedWerf, setSelectedWerf] = useState<any | null>(null);
  const [installationType, setInstallationType] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [materials, setMaterials] = useState('');
  const [notes, setNotes] = useState('');
  const [damageStatus, setDamageStatus] = useState<'geen_schade' | 'schade_aanwezig'>('geen_schade');
  const [damageNote, setDamageNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [sendToCustomer, setSendToCustomer] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [signatureValue, setSignatureValue] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [allesOk, setAllesOk] = useState(true);
  const [ratings, setRatings] = useState<RatingMap>(() =>
    RATING_CATEGORIES.reduce((acc, item) => ({ ...acc, [item]: 0 }), {})
  );

  const filteredWerven = useMemo(
    () => werven.filter((item) => item.klant_id === selectedKlant?.id),
    [selectedKlant, werven]
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [klantenRes, wervenRes] = await Promise.all([
        fetch(`${API_URL}/api/klanten`),
        fetch(`${API_URL}/api/werven`),
      ]);
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

  const validateEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsMultipleSelection: true,
      });
      if (!result.canceled && result.assets?.length) {
        const newPhotos = result.assets
          .filter((asset) => asset.base64)
          .map((asset) => `data:image/jpeg;base64,${asset.base64}`);
        setPhotos((prev) => [...prev, ...newPhotos]);
      }
    } catch (error) {
      console.error(error);
      showAlert('Fout', 'Foto kiezen mislukt');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Toegang nodig', 'Camera toegang is nodig om een foto te maken');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
      if (!result.canceled && result.assets?.[0]?.base64) {
        setPhotos((prev) => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
      }
    } catch (error) {
      console.error(error);
      showAlert('Fout', 'Foto maken mislukt');
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleClearSignature = () => {
    signatureRef.current?.clearSignature?.();
    setHasSignature(false);
    setSignatureValue(null);
  };

  const handleSignatureCaptured = async (signature: string) => {
    setSignatureValue(signature);
    setHasSignature(true);
    if (pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      await submit(signature);
    }
  };

  const renderStars = (label: string) => (
    <View key={label} style={styles.ratingBlock} testID={`oplevering-rating-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={`${label}-${star}`}
            testID={`oplevering-rating-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${star}`}
            style={styles.starButton}
            onPress={() => setRatings((prev) => ({ ...prev, [label]: star }))}
          >
            <Ionicons
              name={star <= ratings[label] ? 'star' : 'star-outline'}
              size={28}
              color={star <= ratings[label] ? '#F5A623' : '#CDD3DA'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const runValidation = () => {
    if (!selectedKlant || !selectedWerf) {
      showAlert('Fout', 'Selecteer eerst klant en werf');
      return false;
    }
    if (!customerName.trim()) {
      showAlert('Fout', 'Vul de naam van de klant in');
      return false;
    }
    if (!hasSignature && !signatureValue) {
      showAlert('Fout', 'Plaats eerst de handtekening van de klant');
      return false;
    }
    if (Object.values(ratings).some((score) => score < 1)) {
      showAlert('Fout', 'Geef alle 5 beoordelingen een score');
      return false;
    }
    if (damageStatus === 'schade_aanwezig' && photos.length === 0) {
      showAlert('Fout', 'Bij schade is minstens 1 foto verplicht');
      return false;
    }
    if (sendToCustomer && !validateEmail(customerEmail)) {
      showAlert('Fout', 'Vul een geldig klant e-mailadres in');
      return false;
    }
    return true;
  };

  const submit = async (signature: string) => {
    if (!user?.id || !user?.naam) {
      showAlert('Fout', 'Gebruiker niet gevonden');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        klant_id: selectedKlant.id,
        werf_id: selectedWerf.id,
        datum: new Date().toISOString().slice(0, 10),
        installatie_type: installationType.trim(),
        werk_beschrijving: workDescription.trim(),
        gebruikte_materialen: materials.trim(),
        extra_opmerkingen: notes.trim(),
        schade_status: damageStatus,
        schade_opmerking: damageNote.trim(),
        schade_checks: [
          { label: 'Geen schade', checked: damageStatus === 'geen_schade', opmerking: damageStatus === 'geen_schade' ? 'Klant bevestigt geen schade' : '' },
          { label: 'Schade aanwezig', checked: damageStatus === 'schade_aanwezig', opmerking: damageNote.trim() },
        ],
        alles_ok: allesOk,
        beoordelingen: RATING_CATEGORIES.map((categorie) => ({ categorie, score: ratings[categorie], opmerking: '' })),
        fotos: photos,
        foto_labels: photos.map((_, index) => `Schade foto ${index + 1}`),
        handtekening_klant: signature,
        handtekening_klant_naam: customerName.trim(),
        handtekening_monteur_naam: user.naam,
        verstuur_naar_klant: sendToCustomer,
        klant_email_override: sendToCustomer ? customerEmail.trim() : '',
      };

      const createResponse = await fetch(
        `${API_URL}/api/oplevering-werkbonnen?user_id=${encodeURIComponent(user.id)}&user_naam=${encodeURIComponent(user.naam)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const createData = await createResponse.json();
      if (!createResponse.ok) {
        throw new Error(createData.detail || 'Oplevering werkbon opslaan mislukt');
      }

      const query = sendToCustomer ? `?klant_email=${encodeURIComponent(customerEmail.trim())}` : '';
      const sendResponse = await fetch(`${API_URL}/api/oplevering-werkbonnen/${createData.id}/verzenden${query}`, {
        method: 'POST',
      });
      const sendData = await sendResponse.json();
      if (!sendResponse.ok) {
        throw new Error(sendData.detail || 'PDF verzenden mislukt');
      }

      showAlert(
        'Gelukt',
        sendData.email_sent
          ? `Oplevering werkbon opgeslagen en PDF verzonden naar: ${(sendData.recipients || []).join(', ')}`
          : 'Werkbon opgeslagen, maar e-mail verzending mislukte'
      );
      router.back();
    } catch (error: any) {
      console.error(error);
      showAlert('Fout', error?.message || 'Kon oplevering werkbon niet verwerken');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!runValidation()) return;
    if (Platform.OS === 'web') {
      const signature = signatureRef.current?.readSignature?.() || signatureValue;
      if (!signature) {
        showAlert('Fout', 'Plaats eerst de handtekening van de klant');
        return;
      }
      await submit(signature);
      return;
    }

    if (signatureValue) {
      await submit(signatureValue);
      return;
    }

    pendingSubmitRef.current = true;
    signatureRef.current?.readSignature?.();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <ActivityIndicator testID="oplevering-loading-indicator" size="large" color="#F5A623" />
      </SafeAreaView>
    );
  }

  const signaturePadStyle = `
    .m-signature-pad {box-shadow: none; border: none;}
    .m-signature-pad--body {border: 2px solid #E8E9ED; border-radius: 14px; overflow: hidden;}
    .m-signature-pad--footer {display: none;}
    body, html {background: #FFFFFF;}
  `;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="oplevering-screen">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity testID="oplevering-back-button" style={styles.headerIconButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} testID="oplevering-header-title">Oplevering Werkbon</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBanner} testID="oplevering-info-banner">
            <Ionicons name="document-text-outline" size={20} color="#F5A623" />
            <Text style={styles.infoBannerText}>Na ondertekenen wordt de PDF naar beheerder gestuurd en optioneel ook naar de klant.</Text>
          </View>

          <Text style={styles.sectionTitle}>Klant</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {klanten.map((klant) => (
              <TouchableOpacity
                key={klant.id}
                testID={`oplevering-klant-${klant.id}`}
                style={[styles.chip, selectedKlant?.id === klant.id && styles.chipActive]}
                onPress={() => selectKlant(klant)}
              >
                <Text style={[styles.chipText, selectedKlant?.id === klant.id && styles.chipTextActive]}>{klant.naam}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {!!selectedKlant && (
            <>
              <Text style={styles.sectionTitle}>Werf</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {filteredWerven.map((werf) => (
                  <TouchableOpacity
                    key={werf.id}
                    testID={`oplevering-werf-${werf.id}`}
                    style={[styles.chip, selectedWerf?.id === werf.id && styles.chipActive]}
                    onPress={() => setSelectedWerf(werf)}
                  >
                    <Text style={[styles.chipText, selectedWerf?.id === werf.id && styles.chipTextActive]}>{werf.naam}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.card} testID="oplevering-work-card">
            <Text style={styles.sectionTitle}>Werk info</Text>
            <TextInput
              testID="oplevering-installation-type-input"
              style={styles.input}
              value={installationType}
              onChangeText={setInstallationType}
              placeholder="Installatie type"
              placeholderTextColor="#8C9199"
            />
            <TextInput
              testID="oplevering-work-description-input"
              style={[styles.input, styles.largeInput]}
              value={workDescription}
              onChangeText={setWorkDescription}
              placeholder="Uitgevoerde werken"
              placeholderTextColor="#8C9199"
              multiline
              textAlignVertical="top"
            />
            <TextInput
              testID="oplevering-materials-input"
              style={[styles.input, styles.mediumInput]}
              value={materials}
              onChangeText={setMaterials}
              placeholder="Gebruikte materialen"
              placeholderTextColor="#8C9199"
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card} testID="oplevering-damage-card">
            <Text style={styles.sectionTitle}>Schadecontrole</Text>
            <View style={styles.choiceRow}>
              <TouchableOpacity
                testID="oplevering-no-damage-button"
                style={[styles.choiceButton, damageStatus === 'geen_schade' && styles.choiceButtonSuccess]}
                onPress={() => {
                  setDamageStatus('geen_schade');
                  setAllesOk(true);
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color={damageStatus === 'geen_schade' ? '#fff' : '#28a745'} />
                <Text style={[styles.choiceText, damageStatus === 'geen_schade' && styles.choiceTextActive]}>Geen schade</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="oplevering-damage-present-button"
                style={[styles.choiceButton, damageStatus === 'schade_aanwezig' && styles.choiceButtonDanger]}
                onPress={() => {
                  setDamageStatus('schade_aanwezig');
                  setAllesOk(false);
                }}
              >
                <Ionicons name="alert-circle" size={18} color={damageStatus === 'schade_aanwezig' ? '#fff' : '#dc3545'} />
                <Text style={[styles.choiceText, damageStatus === 'schade_aanwezig' && styles.choiceTextActive]}>Schade aanwezig</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              testID="oplevering-damage-note-input"
              style={[styles.input, styles.mediumInput]}
              value={damageNote}
              onChangeText={setDamageNote}
              placeholder={damageStatus === 'schade_aanwezig' ? 'Beschrijf de schade' : 'Extra toelichting (optioneel)'}
              placeholderTextColor="#8C9199"
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              testID="oplevering-alles-ok-toggle"
              style={[styles.checkboxRow, allesOk && styles.checkboxRowActive]}
              onPress={() => setAllesOk((prev) => !prev)}
            >
              <View style={[styles.checkbox, allesOk && styles.checkboxChecked]}>
                {allesOk ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={styles.checkboxText}>Alles netjes opgeleverd</Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>Bij schade is minstens 1 foto verplicht.</Text>
            <View style={styles.photoActionRow}>
              <TouchableOpacity testID="oplevering-take-photo-button" style={styles.photoActionButton} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={20} color="#F5A623" />
                <Text style={styles.photoActionText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="oplevering-gallery-photo-button" style={styles.photoActionButton} onPress={pickPhoto}>
                <Ionicons name="images-outline" size={20} color="#3498db" />
                <Text style={styles.photoActionText}>Galerij</Text>
              </TouchableOpacity>
            </View>

            {!!photos.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoPreviewScroll}>
                {photos.map((photo, index) => (
                  <View key={`${photo}-${index}`} style={styles.photoPreview} testID={`oplevering-photo-${index}`}>
                    <Image source={{ uri: photo }} style={styles.photoImage} />
                    <TouchableOpacity
                      testID={`oplevering-remove-photo-${index}`}
                      style={styles.removePhotoButton}
                      onPress={() => removePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={22} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.card} testID="oplevering-ratings-card">
            <Text style={styles.sectionTitle}>Klant beoordeling</Text>
            {RATING_CATEGORIES.map(renderStars)}
          </View>

          <View style={styles.card} testID="oplevering-signature-card">
            <Text style={styles.sectionTitle}>Klant handtekening & mail</Text>
            <TextInput
              testID="oplevering-customer-name-input"
              style={styles.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Naam klant / contactpersoon"
              placeholderTextColor="#8C9199"
            />

            <TouchableOpacity
              testID="oplevering-send-customer-toggle"
              style={[styles.checkboxRow, sendToCustomer && styles.checkboxRowActive]}
              onPress={() => {
                setSendToCustomer((prev) => !prev);
                if (!customerEmail.trim() && selectedKlant?.email) {
                  setCustomerEmail(selectedKlant.email);
                }
              }}
            >
              <View style={[styles.checkbox, sendToCustomer && styles.checkboxChecked]}>
                {sendToCustomer ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={styles.checkboxText}>Ook naar klant mailen</Text>
            </TouchableOpacity>

            {sendToCustomer ? (
              <TextInput
                testID="oplevering-customer-email-input"
                style={styles.input}
                value={customerEmail}
                onChangeText={setCustomerEmail}
                placeholder="klant@email.com"
                placeholderTextColor="#8C9199"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : null}

            <Text style={styles.signatureLabel}>Klant handtekening</Text>
            <View style={styles.signatureWrapper} testID="oplevering-signature-pad-wrapper">
              {Platform.OS === 'web' ? (
                <WebSignatureCanvas signatureRef={signatureRef} onEnd={() => setHasSignature(true)} onClear={handleClearSignature} />
              ) : (
                <SignatureScreen
                  ref={signatureRef}
                  onBegin={() => setHasSignature(true)}
                  onOK={handleSignatureCaptured}
                  onEmpty={() => setHasSignature(false)}
                  webStyle={signaturePadStyle}
                  descriptionText=""
                  backgroundColor="#FFFFFF"
                  penColor="#1A1A2E"
                  imageType="image/png"
                />
              )}
            </View>

            <View style={styles.signatureButtonsRow}>
              <TouchableOpacity testID="oplevering-clear-signature-button" style={styles.secondaryButton} onPress={handleClearSignature}>
                <Ionicons name="refresh" size={18} color="#1A1A2E" />
                <Text style={styles.secondaryButtonText}>Leegmaken</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card} testID="oplevering-notes-card">
            <Text style={styles.sectionTitle}>Extra opmerkingen</Text>
            <TextInput
              testID="oplevering-notes-input"
              style={[styles.input, styles.largeInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Extra opmerkingen voor klant of beheerder"
              placeholderTextColor="#8C9199"
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            testID="oplevering-save-send-button"
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Opslaan & PDF versturen</Text>
              </>
            )}
          </TouchableOpacity>
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  headerSpacer: { width: 44 },
  content: { padding: 18, paddingBottom: 30 },
  infoBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#FFF8E8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F5E2B8',
    marginBottom: 18,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: '#6B5A2A', lineHeight: 19 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  chipRow: { gap: 10, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  chipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  chipText: { color: '#4D5560', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    gap: 12,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E6EC',
    backgroundColor: '#FAFBFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A2E',
  },
  mediumInput: { minHeight: 90 },
  largeInput: { minHeight: 120 },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E1E6EC',
    backgroundColor: '#FFFFFF',
  },
  choiceButtonSuccess: { backgroundColor: '#28a745', borderColor: '#28a745' },
  choiceButtonDanger: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  choiceText: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  choiceTextActive: { color: '#FFFFFF' },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E6EC',
    backgroundColor: '#FAFBFC',
    paddingHorizontal: 14,
  },
  checkboxRowActive: { borderColor: '#F5A623', backgroundColor: '#FFF9EC' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C7CFD8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  checkboxText: { flex: 1, fontSize: 14, color: '#1A1A2E', fontWeight: '600' },
  helperText: { color: '#6C7580', fontSize: 13, lineHeight: 18 },
  photoActionRow: { flexDirection: 'row', gap: 10 },
  photoActionButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E6EC',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoActionText: { color: '#4D5560', fontSize: 13, fontWeight: '600' },
  photoPreviewScroll: { marginTop: 4 },
  photoPreview: { width: 110, height: 110, borderRadius: 16, marginRight: 12, position: 'relative' },
  photoImage: { width: '100%', height: '100%', borderRadius: 16 },
  removePhotoButton: { position: 'absolute', right: -6, top: -6 },
  ratingBlock: { gap: 8 },
  ratingLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  starRow: { flexDirection: 'row', gap: 4 },
  starButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  signatureLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', marginTop: 4 },
  signatureWrapper: {
    minHeight: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  signatureButtonsRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#EEF1F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: { color: '#1A1A2E', fontWeight: '700', fontSize: 14 },
  primaryButton: {
    minHeight: 54,
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#F5A623',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  bottomSpacer: { height: 36 },
});