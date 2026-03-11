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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen from 'react-native-signature-canvas';
import { useAppStore } from '../../store/appStore';

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

  const handleSave = async () => {
    if (!naam.trim()) {
      setErrorMessage('Vul uw naam in');
      Alert.alert('Fout', 'Vul uw naam in');
      return;
    }

    if (!hasSignature) {
      setErrorMessage('Plaats uw handtekening');
      Alert.alert('Fout', 'Plaats uw handtekening');
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
        status: 'ondertekend',
      });
      const detailRoute = `/werkbon/${id}?refresh=${Date.now()}`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = detailRoute;
        return;
      }
      router.replace(detailRoute);
    } catch (error: any) {
      const message = error.message || 'Kon handtekening niet opslaan';
      setErrorMessage(message);
      Alert.alert('Fout', message);
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
