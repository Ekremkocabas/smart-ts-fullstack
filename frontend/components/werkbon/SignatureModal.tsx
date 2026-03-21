/**
 * SignatureModal - Dedicated modal for capturing signature
 * Opens a fullscreen modal with a signature canvas
 * Solves alignment/drift issues on APK by having isolated touch handling
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Signature canvas dimensions for native
const CANVAS_WIDTH = SCREEN_WIDTH - 32;
const CANVAS_HEIGHT = Math.min(SCREEN_HEIGHT * 0.4, 300);

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

// Native signature style - simplified for better performance
const nativeSignatureStyle = `
  .m-signature-pad { 
    box-shadow: none; 
    border: none; 
    background-color: #FFFFFF;
    margin: 0;
    padding: 0;
  }
  .m-signature-pad--body { 
    border: none; 
    background-color: #FFFFFF;
    margin: 0;
    padding: 0;
  }
  .m-signature-pad--footer { 
    display: none; 
    margin: 0; 
  }
  body { 
    margin: 0; 
    padding: 0;
    background-color: #FFFFFF;
  }
  canvas { 
    background-color: #FFFFFF !important;
    touch-action: none;
  }
`;

// Web signature canvas component
const WebSignatureCanvas = ({ onEnd, onClear, signatureRef }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    ctx.lineWidth = 2.5;
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
    ctx.lineWidth = 2.5;
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
      height={280}
      style={{
        width: '100%',
        height: 280,
        borderRadius: 12,
        border: '2px solid #E8E9ED',
        touchAction: 'none',
        backgroundColor: '#FFFFFF',
      }}
    />
  );
};

interface SignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signatureData: string) => void;
  primaryColor?: string;
}

export default function SignatureModal({ 
  visible, 
  onClose, 
  onSave,
  primaryColor = '#F5A623' 
}: SignatureModalProps) {
  const insets = useSafeAreaInsets();
  const signatureRef = useRef<any>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setHasDrawn(false);
      setSignatureData(null);
    }
  }, [visible]);

  const handleClear = () => {
    if (Platform.OS === 'web') {
      signatureRef.current?.clearSignature?.();
    } else {
      signatureRef.current?.clearSignature?.();
    }
    setHasDrawn(false);
    setSignatureData(null);
  };

  const handleDrawStart = () => {
    setHasDrawn(true);
  };

  const handleDrawEnd = () => {
    // For native, read signature on end
    if (Platform.OS !== 'web' && signatureRef.current?.readSignature) {
      signatureRef.current.readSignature();
    }
  };

  const handleNativeOK = (sig: string) => {
    console.log('[SignatureModal] Native OK received, length:', sig?.length);
    setSignatureData(sig);
  };

  const handleSave = () => {
    let finalSignature: string | null = null;

    if (Platform.OS === 'web') {
      finalSignature = signatureRef.current?.readSignature?.();
    } else {
      // For native, use the stored signature data
      finalSignature = signatureData;
      
      // If no stored data, try to read directly
      if (!finalSignature && signatureRef.current?.readSignature) {
        signatureRef.current.readSignature();
        // Give a brief moment for callback
        setTimeout(() => {
          if (signatureData) {
            onSave(signatureData);
            onClose();
          }
        }, 200);
        return;
      }
    }

    if (finalSignature) {
      onSave(finalSignature);
      onClose();
    } else {
      // If still no signature, alert user
      console.warn('[SignatureModal] No signature data available');
    }
  };

  const NativeSignature = getSignatureScreen();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#6C7A89" />
          </TouchableOpacity>
          <Text style={styles.title}>Teken hier</Text>
          <TouchableOpacity 
            style={[styles.clearButton, { borderColor: primaryColor }]} 
            onPress={handleClear}
          >
            <Ionicons name="refresh" size={18} color={primaryColor} />
            <Text style={[styles.clearButtonText, { color: primaryColor }]}>Wissen</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Ionicons name="finger-print-outline" size={20} color="#6C7A89" />
          <Text style={styles.instructionsText}>
            Teken uw handtekening in het witte vlak hieronder
          </Text>
        </View>

        {/* Signature Canvas Area */}
        <View style={styles.canvasContainer}>
          <View style={styles.canvasWrapper}>
            {Platform.OS === 'web' ? (
              <WebSignatureCanvas
                signatureRef={signatureRef}
                onEnd={handleDrawStart}
                onClear={() => setHasDrawn(false)}
              />
            ) : NativeSignature ? (
              <NativeSignature
                ref={signatureRef}
                onBegin={handleDrawStart}
                onEnd={handleDrawEnd}
                onOK={handleNativeOK}
                onEmpty={() => {
                  setHasDrawn(false);
                  setSignatureData(null);
                }}
                onClear={() => {
                  setHasDrawn(false);
                  setSignatureData(null);
                }}
                webStyle={nativeSignatureStyle}
                descriptionText=""
                clearText=""
                confirmText=""
                backgroundColor="#FFFFFF"
                penColor="#1A1A2E"
                minWidth={2}
                maxWidth={4}
                dotSize={3}
                imageType="image/png"
                dataURL=""
                autoClear={false}
                trimWhitespace={false}
                style={styles.nativeCanvas}
              />
            ) : (
              <View style={styles.fallbackContainer}>
                <Ionicons name="alert-circle-outline" size={48} color="#C4C4C4" />
                <Text style={styles.fallbackText}>Handtekening niet beschikbaar</Text>
              </View>
            )}
          </View>
          
          {/* Signature line indicator */}
          <View style={styles.signatureLine}>
            <View style={styles.lineLeft} />
            <Text style={styles.signatureX}>X</Text>
            <View style={styles.lineRight} />
          </View>
        </View>

        {/* Save Button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: primaryColor },
              !hasDrawn && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasDrawn}
          >
            <Ionicons name="checkmark-circle" size={22} color="#1A1A2E" />
            <Text style={styles.saveButtonText}>Handtekening Bevestigen</Text>
          </TouchableOpacity>
          
          <Text style={styles.footerHint}>
            Door te bevestigen gaat u akkoord met de digitale ondertekening
          </Text>
        </View>
      </View>
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFF8E1',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#6C7A89',
    flex: 1,
  },
  canvasContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  canvasWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E8E9ED',
    overflow: 'hidden',
    minHeight: 280,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  nativeCanvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    minHeight: 280,
  },
  fallbackText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8C9199',
  },
  signatureLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  lineLeft: {
    flex: 0.15,
    height: 1,
    backgroundColor: '#C4C4C4',
  },
  signatureX: {
    fontSize: 16,
    fontWeight: '600',
    color: '#C4C4C4',
    marginHorizontal: 8,
  },
  lineRight: {
    flex: 0.85,
    height: 1,
    backgroundColor: '#C4C4C4',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 56,
  },
  saveButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#E8E9ED',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  footerHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8C9199',
    marginTop: 12,
  },
});
