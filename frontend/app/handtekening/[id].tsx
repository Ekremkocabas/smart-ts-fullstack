import React, { useRef, useState } from 'react';
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
import SignatureCanvas from 'react-native-signature-canvas';
import { useAppStore } from '../../store/appStore';

export default function HandtekeningScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updateWerkbon } = useAppStore();
  
  const signatureRef = useRef<SignatureCanvas>(null);
  const [naam, setNaam] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const handleClear = () => {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
  };

  const handleSave = async () => {
    if (!naam.trim()) {
      Alert.alert('Fout', 'Vul uw naam in');
      return;
    }

    if (!hasSignature) {
      Alert.alert('Fout', 'Plaats uw handtekening');
      return;
    }

    signatureRef.current?.readSignature();
  };

  const handleSignatureEnd = () => {
    setHasSignature(true);
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
      Alert.alert('Succes', 'Handtekening opgeslagen', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Fout', error.message || 'Kon handtekening niet opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmpty = () => {
    Alert.alert('Fout', 'Plaats uw handtekening');
  };

  const webStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      background-color: #16213e;
    }
    .m-signature-pad--body {
      border: none;
    }
    .m-signature-pad--footer {
      display: none;
    }
    body, html {
      background-color: #16213e;
    }
  `;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Handtekening</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Naam ondertekenaar</Text>
            <TextInput
              style={styles.input}
              value={naam}
              onChangeText={setNaam}
              placeholder="Volledige naam"
              placeholderTextColor="#6c757d"
            />
          </View>

          <View style={styles.signatureContainer}>
            <Text style={styles.label}>Handtekening</Text>
            <View style={styles.signatureWrapper}>
              <SignatureCanvas
                ref={signatureRef}
                onOK={handleSignatureData}
                onEmpty={handleEmpty}
                onEnd={handleSignatureEnd}
                webStyle={webStyle}
                backgroundColor="#16213e"
                penColor="#4361ee"
                dotSize={2}
                minWidth={2}
                maxWidth={4}
              />
            </View>
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Ionicons name="refresh" size={18} color="#6c757d" />
              <Text style={styles.clearButtonText}>Wissen</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    color: '#a0a0a0',
    fontSize: 14,
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
  signatureWrapper: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2d3a5f',
    minHeight: 200,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  clearButtonText: {
    color: '#6c757d',
    fontSize: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5f',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#28a745',
    padding: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
