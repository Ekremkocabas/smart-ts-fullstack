/**
 * Unified Werkbon Sign - Signature Page
 * Final step: Sign the werkbon and submit
 * 
 * CRITICAL: The signature canvas is OUTSIDE the ScrollView
 * to prevent scrolling issues on the signature pad.
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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { GPSLocation } from '../../components/werkbon/GPSLocation';

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
  const { formData: formDataStr } = useLocalSearchParams<{ formData: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const signatureRef = useRef<any>(null);
  
  const primary = theme.primaryColor || '#F5A623';
  
  // Parse form data
  let formData: any = {};
  try {
    formData = JSON.parse(formDataStr || '{}');
  } catch (e) {
    console.error('Failed to parse form data:', e);
  }

  // State
  const [signerName, setSignerName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(formData.gpsCoords || '');
  const [gpsAddress, setGpsAddress] = useState(formData.gpsAddress || '');
  const [sendToCustomer, setSendToCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // For native: store signature when onOK is called
  const [nativeSignatureData, setNativeSignatureData] = useState<string | null>(null);

  const handleSignatureOk = (signature: string) => {
    // Called by native SignatureScreen when user finishes signing
    setNativeSignatureData(signature);
    setHasSignature(true);
  };

  const handleSignatureStart = () => {
    setHasSignature(true);
  };

  const handleSignatureClear = () => {
    setHasSignature(false);
    setNativeSignatureData(null);
  };

  const clearSignature = () => {
    if (Platform.OS === 'web') {
      signatureRef.current?.clearSignature?.();
    } else {
      signatureRef.current?.clearSignature?.();
    }
    handleSignatureClear();
  };

  const getSignatureData = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return signatureRef.current?.readSignature?.() || null;
    } else {
      // For native, we need to call readSignature which triggers onOK
      // If we already have data from onOK, use that
      if (nativeSignatureData) {
        return nativeSignatureData;
      }
      // Otherwise, try to get it
      return new Promise((resolve) => {
        if (signatureRef.current?.readSignature) {
          signatureRef.current.readSignature();
          // Wait a bit for onOK to be called
          setTimeout(() => {
            resolve(nativeSignatureData);
          }, 500);
        } else {
          resolve(null);
        }
      });
    }
  };

  const handleSubmit = async () => {
    // Validate
    if (!signerName.trim()) {
      Alert.alert('Fout', 'Vul de naam van de ondertekenaar in');
      return;
    }
    
    if (!hasSignature) {
      Alert.alert('Fout', 'Handtekening is vereist');
      return;
    }

    setSaving(true);

    try {
      // Get signature data
      let signatureData: string | null = null;
      
      if (Platform.OS === 'web') {
        signatureData = signatureRef.current?.readSignature?.();
      } else {
        // For native, use the stored data
        signatureData = nativeSignatureData;
      }

      if (!signatureData) {
        Alert.alert('Fout', 'Kon handtekening niet ophalen. Teken opnieuw.');
        setSaving(false);
        return;
      }

      // Build werkbon data based on type
      const werkbonData = buildWerkbonData(signatureData);
      
      // Submit to API
      const endpoint = getEndpointForType(formData.type);
      const response = await axios.post(`${API_URL}${endpoint}`, werkbonData);

      if (response.data) {
        // Success - optionally send email if enabled
        if (sendToCustomer && response.data.id) {
          try {
            await axios.post(`${API_URL}${endpoint}/${response.data.id}/verzenden`);
          } catch (emailError) {
            console.warn('Email sending failed:', emailError);
          }
        }

        Alert.alert(
          'Succes',
          'Werkbon is succesvol opgeslagen!',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      Alert.alert(
        'Fout',
        error.response?.data?.detail || 'Er ging iets mis bij het opslaan. Probeer opnieuw.'
      );
    } finally {
      setSaving(false);
    }
  };

  const buildWerkbonData = (signatureData: string) => {
    const baseData = {
      klant_id: formData.klant?.id || '',
      werf_id: formData.werf?.id || '',
      datum: new Date().toISOString().split('T')[0],
      gps_locatie: gpsCoords || gpsAddress || null,
      handtekening_klant: signatureData,
      handtekening_klant_naam: signerName,
      verstuur_naar_klant: sendToCustomer,
    };

    switch (formData.type) {
      case 'productie':
        return {
          ...baseData,
          handtekening: signatureData,
          handtekening_naam: signerName,
          uit_te_voeren_werk: formData.productType || '',
          opmerking: formData.opmerking || '',
          fotos: (formData.photos || []).map((photo: string, i: number) => ({
            base64: photo,
            timestamp: new Date().toISOString(),
            werknemer_id: user?.id || '',
            gps: gpsCoords || '',
          })),
        };
        
      case 'oplevering':
        return {
          ...baseData,
          werk_beschrijving: formData.omschrijving || '',
          extra_opmerkingen: formData.opmerking || '',
          fotos: formData.photos || [],
          handtekening_monteur: signatureData,
          handtekening_monteur_naam: user?.naam || '',
        };
        
      case 'project':
        return {
          ...baseData,
          werk_beschrijving: formData.projectNaam || '',
          extra_opmerkingen: formData.opmerking || '',
          dag_regels: (formData.taken || []).map((t: string) => ({ beschrijving: t })),
          handtekening_monteur: signatureData,
          handtekening_monteur_naam: user?.naam || '',
        };
        
      default:
        return baseData;
    }
  };

  const getEndpointForType = (type: string) => {
    switch (type) {
      case 'productie': return '/api/productie-werkbonnen';
      case 'oplevering': return '/api/oplevering-werkbonnen';
      case 'project': return '/api/project-werkbonnen';
      default: return '/api/werkbonnen';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ondertekenen</Text>
        <View style={styles.pageIndicators}>
          <View style={styles.pageIndicator} />
          <View style={styles.pageIndicator} />
          <View style={[styles.pageIndicator, { backgroundColor: primary }]} />
        </View>
      </View>

      {/* Main Content - NOT a ScrollView to prevent signature scroll issues */}
      <KeyboardAvoidingView 
        style={styles.mainContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top Section - Scrollable fields */}
        <View style={styles.fieldsSection}>
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
            <GPSLocation
              onLocationChange={(coords, address) => {
                setGpsCoords(coords);
                setGpsAddress(address);
              }}
              initialCoords={gpsCoords}
              initialAddress={gpsAddress}
              primaryColor={primary}
            />
          </View>
        </View>

        {/* Signature Section - FIXED, not scrollable */}
        <View style={styles.signatureSection}>
          <View style={styles.card}>
            <View style={styles.signatureHeader}>
              <Text style={styles.fieldLabel}>Klanthandtekening *</Text>
              <TouchableOpacity
                style={[styles.clearButton, { borderColor: primary }]}
                onPress={clearSignature}
              >
                <Ionicons name="refresh" size={16} color={primary} />
                <Text style={[styles.clearButtonText, { color: primary }]}>Wissen</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.signatureWrapper}>
              {Platform.OS === 'web' ? (
                <WebSignatureCanvas
                  signatureRef={signatureRef}
                  onEnd={handleSignatureStart}
                  onClear={handleSignatureClear}
                />
              ) : (
                (() => {
                  const NativeSignature = getSignatureScreen();
                  return NativeSignature ? (
                    <NativeSignature
                      ref={signatureRef}
                      onBegin={handleSignatureStart}
                      onOK={handleSignatureOk}
                      onEmpty={handleSignatureClear}
                      webStyle={nativeSignatureStyle}
                      descriptionText=""
                      backgroundColor="#FFFFFF"
                      penColor="#1A1A2E"
                      imageType="image/png"
                    />
                  ) : (
                    <View style={styles.fallbackSignature}>
                      <Text style={styles.fallbackText}>Handtekening niet beschikbaar</Text>
                    </View>
                  );
                })()
              )}
            </View>
          </View>

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

          {/* Legal Text */}
          <View style={styles.legalBox}>
            <Ionicons name="document-text-outline" size={16} color="#6c757d" />
            <Text style={styles.legalText}>{LEGAL_TEXT}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Fixed Footer */}
      <View style={[styles.fixedFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: primary },
            (!hasSignature || saving) && styles.primaryButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!hasSignature || saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={20} color="#000" />
              <Text style={styles.primaryButtonText}>Tekenen en versturen</Text>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    textAlign: 'center',
  },
  pageIndicators: {
    flexDirection: 'row',
    gap: 6,
    width: 50,
    justifyContent: 'flex-end',
  },
  pageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8E9ED',
  },
  mainContent: {
    flex: 1,
    padding: 16,
  },
  fieldsSection: {
    // Top fields (name, GPS)
  },
  signatureSection: {
    flex: 1,
    justifyContent: 'flex-start',
    marginTop: 8,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 8,
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
  clearButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
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
  fallbackText: {
    color: '#8C9199',
    fontSize: 14,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleText: {
    fontSize: 15,
    color: '#1A1A2E',
    fontWeight: '500',
  },
  legalBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  legalText: {
    flex: 1,
    fontSize: 11,
    color: '#6c757d',
    lineHeight: 16,
  },
  fixedFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 56,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
});
