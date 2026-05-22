import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../../context/AuthContext';
import { showAlert } from '../../../utils/alerts';

// Web-only canvas — react-native-signature-canvas relies on RNWebView which
// is not available on web. Keeps the touch/mouse drawing UX identical.
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
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
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
    if (!ctx || !canvas) return;
    const currentPos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();
    setLastPos(currentPos);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      onEnd?.();
    }
  };

  useEffect(() => {
    if (signatureRef) {
      signatureRef.current = {
        clearSignature: () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (ctx && canvas) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          onClear?.();
        },
        readSignature: () => {
          const canvas = canvasRef.current;
          if (canvas) return canvas.toDataURL('image/png');
          return null;
        },
      };
    }
  }, [signatureRef]);

  return (
    <canvas
      ref={canvasRef}
      width={350}
      height={200}
      style={{
        border: '2px solid #E8E9ED',
        borderRadius: 12,
        touchAction: 'none',
        cursor: 'crosshair',
        backgroundColor: '#FFFFFF',
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

interface GroepWerkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  datum_maandag?: string;
  datum_zondag?: string;
  klant_naam?: string;
  werf_naam?: string;
}

interface WerkbonGroep {
  id: string;
  periode_van: string;
  periode_tot: string;
  klant_naam: string;
  werf_naam: string;
  status: string;
  werkbonnen: GroepWerkbon[];
}

export default function WerkbonGroepSignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const signatureRef = useRef<any>(null);
  const [groep, setGroep] = useState<WerkbonGroep | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [naam, setNaam] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);

  const signaturePadStyle = `
    .m-signature-pad {box-shadow: none; border: none; background: #FFFFFF;}
    .m-signature-pad--body {border: 2px solid #E8E9ED; border-radius: 12px; overflow: hidden; background: #FFFFFF;}
    .m-signature-pad--footer {display: none; margin: 0;}
    body, html {background: #F5F6FA;}
  `;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await apiClient.get(`/api/werkbon-groepen/${id}`);
        setGroep(res.data);
      } catch (e) {
        console.error('[werkbon-groep] fetch failed', e);
        showAlert('Fout', 'Kon maand-werkbon niet laden');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  const handleClear = () => {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
    setErrorMessage('');
  };

  const handleTakeSelfie = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Toestemming vereist', 'Camera toegang is nodig voor selfie');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          cameraType: ImagePicker.CameraType.front,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.4,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]) {
          setSelfieUri(result.assets[0].uri);
          setSelfieBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.4,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]) {
          setSelfieUri(result.assets[0].uri);
          setSelfieBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
      }
    } catch {
      showAlert('Fout', 'Selfie kon niet worden gemaakt');
    }
  };

  const handleSignatureEnd = () => {
    setHasSignature(true);
    setErrorMessage('');
  };

  const handleSignatureData = async (signature: string) => {
    if (!id) return;
    setIsSaving(true);
    try {
      // One PUT signs every week in the bundle: the backend marks the groep
      // as 'ondertekend' and the verzenden endpoint later cascades 'verzonden'
      // down to each child werkbon.
      await apiClient.put(`/api/werkbon-groepen/${id}`, {
        handtekening_data: signature,
        handtekening_naam: naam.trim(),
        selfie_data: selfieBase64 || undefined,
      });
      router.replace('/(tabs)/planning');
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Kon handtekening niet opslaan';
      setErrorMessage(message);
      showAlert('Fout', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!naam.trim()) {
      setErrorMessage('Vul uw naam in');
      showAlert('Fout', 'Vul uw naam in');
      return;
    }
    if (!hasSignature) {
      setErrorMessage('Plaats uw handtekening');
      showAlert('Fout', 'Plaats uw handtekening');
      return;
    }
    setErrorMessage('');
    if (Platform.OS === 'web') {
      const signature = signatureRef.current?.readSignature();
      if (signature) await handleSignatureData(signature);
      return;
    }
    signatureRef.current?.readSignature();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0F172A" />
        </View>
      </SafeAreaView>
    );
  }

  if (!groep) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.title}>Maand werkbon</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#6c757d' }}>Maand-werkbon niet gevonden.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.title}>Maand werkbon tekenen</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.summary} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
          <Text style={styles.summaryHeader}>{groep.klant_naam}</Text>
          <Text style={styles.summarySub}>{groep.werf_naam}</Text>
          <Text style={styles.summaryPeriode}>
            Periode: {groep.periode_van} t/m {groep.periode_tot}
          </Text>
          <View style={styles.weekList}>
            <Text style={styles.weekListHeader}>{groep.werkbonnen.length} weken in deze maand-werkbon:</Text>
            {groep.werkbonnen.map((w) => (
              <View key={w.id} style={styles.weekRow}>
                <Ionicons name="calendar-outline" size={14} color="#0F172A" />
                <Text style={styles.weekText}>
                  W{w.week_nummer}-{w.jaar} ({w.datum_maandag} t/m {w.datum_zondag})
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color="#0F172A" />
            <Text style={styles.noticeText}>
              Eén handtekening dekt de volledige periode. Hierna wordt één combined PDF gegenereerd en verzonden.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.topSection}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Naam ondertekenaar</Text>
            <TextInput
              style={styles.input}
              value={naam}
              onChangeText={(value) => {
                setNaam(value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="Uw volledige naam"
              placeholderTextColor="#6c757d"
            />
          </View>

          <View style={styles.securityRow}>
            <TouchableOpacity style={styles.securityBtn} onPress={handleTakeSelfie}>
              {selfieUri ? (
                <Image source={{ uri: selfieUri }} style={styles.selfieThumbnail} />
              ) : (
                <Ionicons name="camera-outline" size={20} color="#22C55E" />
              )}
              <Text style={styles.securityBtnText}>{selfieUri ? 'Selfie ✓' : 'Selfie'}</Text>
            </TouchableOpacity>
          </View>

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>

        <View style={styles.signatureSection}>
          <Text style={styles.label}>Handtekening</Text>
          <View style={styles.canvasWrapper}>
            {Platform.OS === 'web' ? (
              <WebSignatureCanvas
                signatureRef={signatureRef}
                onEnd={handleSignatureEnd}
                onClear={() => setHasSignature(false)}
              />
            ) : (
              <SignatureScreen
                ref={signatureRef}
                onOK={handleSignatureData}
                onBegin={handleSignatureEnd}
                onEmpty={() => setHasSignature(false)}
                descriptionText=""
                webStyle={signaturePadStyle}
                backgroundColor="#FFFFFF"
                penColor="#0F172A"
                autoClear={false}
              />
            )}
          </View>
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Ionicons name="refresh" size={18} color="#6c757d" />
            <Text style={styles.clearText}>Wissen</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Maand werkbon bevestigen</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  keyboardView: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  summary: { maxHeight: 220, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  summaryHeader: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  summarySub: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  summaryPeriode: { fontSize: 13, color: '#333', marginTop: 6, fontWeight: '600' },
  weekList: { marginTop: 10, padding: 10, backgroundColor: '#F5F6FA', borderRadius: 8 },
  weekListHeader: { fontSize: 12, color: '#6c757d', marginBottom: 6, fontWeight: '600' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  weekText: { fontSize: 12, color: '#333' },
  notice: {
    flexDirection: 'row', gap: 8, padding: 10, marginTop: 8,
    backgroundColor: '#E8F4EA', borderRadius: 8, alignItems: 'flex-start',
  },
  noticeText: { flex: 1, fontSize: 12, color: '#0F172A', lineHeight: 16 },
  topSection: { padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  formGroup: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 6 },
  input: {
    backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: '#E8E9ED',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#0F172A',
  },
  securityRow: { flexDirection: 'row', gap: 10 },
  securityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F5F6FA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  securityBtnText: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
  selfieThumbnail: { width: 24, height: 24, borderRadius: 12 },
  errorText: { color: '#dc3545', fontSize: 13, marginTop: 8 },
  signatureSection: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
  canvasWrapper: {
    flex: 1, minHeight: 180,
    backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden',
  },
  clearButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 8, gap: 4 },
  clearText: { fontSize: 13, color: '#6c757d' },
  footer: { padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8E9ED' },
  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 14,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
