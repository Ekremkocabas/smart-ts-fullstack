/**
 * SignatureCanvas - Unified Signature Component
 * Used across all werkbon types (productie, oplevering, project)
 * 
 * CRITICAL FIX: Native signature capture now properly handles the async onOK callback
 * 
 * Features:
 * - Works on both web and native
 * - Proper touch/mouse coordinate scaling
 * - Clear and read signature functions
 * - White background for PDF compatibility
 */

import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import native signature canvas only for native platforms
let SignatureScreen: any = null;
if (Platform.OS !== 'web') {
  try {
    SignatureScreen = require('react-native-signature-canvas').default;
  } catch (e) {
    console.warn('react-native-signature-canvas not available');
  }
}

// Web-based signature canvas with proper scaling
const WebSignatureCanvas = ({ onEnd, onClear, signatureRef }: any) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const startDrawing = useCallback((e: any) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    }
  }, []);

  const draw = useCallback((e: any) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }, []);

  const stopDrawing = useCallback((e: any) => {
    if (isDrawing.current) {
      e?.preventDefault?.();
      isDrawing.current = false;
      onEnd?.();
    }
  }, [onEnd]);

  const clearCanvas = useCallback(() => {
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
  }, [onClear]);

  const readSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }, []);

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
  }, [clearCanvas, readSignature, signatureRef]);

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
  }, [startDrawing, draw, stopDrawing]);

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

// Native signature style for react-native-signature-canvas
export const nativeSignatureStyle = `.m-signature-pad { box-shadow: none; border: none; background-color: #FFFFFF; }
.m-signature-pad--body { border: none; background-color: #FFFFFF; }
.m-signature-pad--footer { display: none; margin: 0; }
canvas { background-color: #FFFFFF !important; }`;

interface SignatureCanvasProps {
  signatureRef: React.MutableRefObject<any>;
  onSignatureStart: () => void;
  onSignatureClear: () => void;
  onSignatureOk?: (signature: string) => void;
  onSignatureChange?: (signature: string | null) => void;
  primaryColor?: string;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  signatureRef,
  onSignatureStart,
  onSignatureClear,
  onSignatureOk,
  onSignatureChange,
  primaryColor = '#F5A623',
}) => {
  // For native: store signature data internally and provide it via ref
  const nativeSignatureRef = useRef<any>(null);
  const [storedSignature, setStoredSignature] = useState<string | null>(null);

  // Handle native onOK - this is called when readSignature() completes on native
  const handleNativeOk = (signature: string) => {
    console.log('Native signature received, length:', signature?.length);
    setStoredSignature(signature);
    onSignatureOk?.(signature);
    onSignatureChange?.(signature);
  };

  // Handle native onEnd (when user finishes a stroke)
  const handleNativeEnd = () => {
    onSignatureStart();
    // On native, we need to call readSignature to get the data
    // This triggers onOK with the signature data
    if (nativeSignatureRef.current?.readSignature) {
      nativeSignatureRef.current.readSignature();
    }
  };

  // Handle clear
  const handleClear = () => {
    if (Platform.OS === 'web') {
      signatureRef.current?.clearSignature?.();
    } else {
      nativeSignatureRef.current?.clearSignature?.();
    }
    setStoredSignature(null);
    onSignatureClear();
    onSignatureChange?.(null);
  };

  // Expose methods via signatureRef
  useEffect(() => {
    if (!signatureRef) return;
    
    if (Platform.OS === 'web') {
      // Web ref is already set by WebSignatureCanvas
    } else {
      // For native, provide methods that work with stored signature
      signatureRef.current = {
        clearSignature: () => {
          nativeSignatureRef.current?.clearSignature?.();
          setStoredSignature(null);
        },
        readSignature: () => {
          // Return stored signature or trigger read
          if (storedSignature) {
            return storedSignature;
          }
          // Trigger read and return null (caller should use onSignatureOk)
          nativeSignatureRef.current?.readSignature?.();
          return null;
        },
        getStoredSignature: () => storedSignature,
      };
    }
  }, [signatureRef, storedSignature]);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Klanthandtekening</Text>
        <TouchableOpacity
          style={[styles.clearButton, { borderColor: primaryColor }]}
          onPress={handleClear}
        >
          <Ionicons name="refresh" size={16} color={primaryColor} />
          <Text style={[styles.clearButtonText, { color: primaryColor }]}>Wissen</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.signatureWrapper}>
        {Platform.OS === 'web' ? (
          <WebSignatureCanvas
            signatureRef={signatureRef}
            onEnd={onSignatureStart}
            onClear={onSignatureClear}
          />
        ) : (
          SignatureScreen ? (
            <SignatureScreen
              ref={nativeSignatureRef}
              onBegin={onSignatureStart}
              onEnd={handleNativeEnd}
              onOK={handleNativeOk}
              onEmpty={onSignatureClear}
              webStyle={nativeSignatureStyle}
              descriptionText=""
              backgroundColor="#FFFFFF"
              penColor="#1A1A2E"
              imageType="image/png"
              trimWhitespace={false}
              autoClear={false}
            />
          ) : (
            <View style={styles.fallbackSignature}>
              <Text style={styles.fallbackText}>Handtekening niet beschikbaar</Text>
            </View>
          )
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
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
});

export default SignatureCanvas;
