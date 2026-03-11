import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../../store/appStore';
import { showAlert } from '../../utils/alerts';

// Web-compatible signature component
const WebSignatureCanvas = ({ onEnd, onClear, signatureRef }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#F5A623';
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
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
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

  // Expose methods via ref
  useEffect(() => {
    if (signatureRef) {
      signatureRef.current = {
        clearSignature: () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (ctx && canvas) {
            ctx.fillStyle = '#16213e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          onClear?.();
        },
        readSignature: () => {
          const canvas = canvasRef.current;
          if (canvas) {
            return canvas.toDataURL('image/png');
          }
          return null;
        }
      };
    }
  }, [signatureRef]);

  return (
    <canvas
      ref={canvasRef}
      width={350}
      height={200}
      style={{
        border: '2px solid #2d3a5f',
        borderRadius: 12,
        touchAction: 'none',
        cursor: 'crosshair',
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

export default function HandtekeningScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updateWerkbon } = useAppStore();
  
  const signatureRef = useRef<any>(null);
  const [naam, setNaam] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);

  const signaturePadStyle = `
    .m-signature-pad {box-shadow: none; border: none; background: #16213e;}
    .m-signature-pad--body {border: 2px solid #2d3a5f; border-radius: 12px; overflow: hidden; background: #16213e;}
    .m-signature-pad--footer {display: none; margin: 0;}
    body, html {background: #16213e;}
  `;

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
    // Get signature data
    if (Platform.OS === 'web') {
      const signature = signatureRef.current?.readSignature();
      if (signature) {
        await handleSignatureData(signature);
      }
      return;
    }

    signatureRef.current?.readSignature();
  };

  const handleSignatureEnd = () => {
    setHasSignature(true);
    setErrorMessage('');
  };

  const handleSignatureData = async (signature: string) => {
    if (!id) return;
    
    setIsSaving(true);
    try {
      await updateWerkbon(id, {
        handtekening_data: signature,
        handtekening_naam: naam.trim(),
        selfie_data: selfieBase64 || undefined,
        status: 'ondertekend',
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const signerParam = encodeURIComponent(naam.trim());
      const signedAtParam = encodeURIComponent(new Date().toISOString());
      router.replace(`/werkbon/${id}?justSigned=1&signer=${signerParam}&signedAt=${signedAtParam}`);
    } catch (error: any) {
      const message = error.message || 'Kon handtekening niet opslaan';
      setErrorMessage(message);
      showAlert('Fout', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="signature-close-button" onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Handtekening</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Naam ondertekenaar</Text>
            <TextInput
              testID="signature-name-input"
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

          {/* Optional Security: Selfie + SMS */}
          <View style={styles.securityRow}>
            {/* Selfie Button */}
            <TouchableOpacity style={styles.securityBtn} onPress={handleTakeSelfie}>
              {selfieUri ? (
                <Image source={{ uri: selfieUri }} style={styles.selfieThumbnail} />
              ) : (
                <Ionicons name="camera-outline" size={20} color="#F5A623" />
              )}
              <Text style={styles.securityBtnText}>
                {selfieUri ? 'Selfie ✓' : 'Selfie'}
              </Text>
            </TouchableOpacity>

            {/* SMS Button (disabled / coming soon) */}
            <View style={[styles.securityBtn, styles.securityBtnDisabled]}>
              <Ionicons name="chatbubble-outline" size={20} color="#555" />
              <Text style={[styles.securityBtnText, styles.securityBtnTextDisabled]}>SMS</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Binnenkort</Text>
              </View>
            </View>
          </View>

          {!!errorMessage && <Text testID="signature-error-text" style={styles.errorText}>{errorMessage}</Text>}

          <View style={styles.signatureContainer}>
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
                  backgroundColor="#16213e"
                  penColor="#F5A623"
                  autoClear={false}
                />
              )}
            </View>
            <TouchableOpacity testID="signature-clear-button" style={styles.clearButton} onPress={handleClear}>
              <Ionicons name="refresh" size={18} color="#6c757d" />
              <Text style={styles.clearText}>Wissen</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            testID="signature-save-button"
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark" size={24} color="#000" />
                <Text style={styles.saveButtonText}>Bevestigen</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  signatureContainer: {
    flex: 1,
  },
  canvasWrapper: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    padding: 10,
  },
  errorText: { color: '#dc3545', fontSize: 14, marginBottom: 12 },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  clearText: {
    color: '#6c757d',
    fontSize: 14,
  },
  securityRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  securityBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5A62350',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    position: 'relative',
  },
  securityBtnDisabled: {
    borderColor: '#2d3a5f',
    opacity: 0.55,
  },
  securityBtnText: {
    color: '#F5A623',
    fontSize: 13,
    fontWeight: '600',
  },
  securityBtnTextDisabled: {
    color: '#555',
  },
  selfieThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#28a745',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#2d3a5f',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  comingSoonText: {
    color: '#6c757d',
    fontSize: 9,
  },
  footer: {
    padding: 20,
  },
  saveButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
});
