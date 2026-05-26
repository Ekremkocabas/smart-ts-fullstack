import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, WEB_PANEL_ROLES, MOBILE_APP_ROLES, apiClient } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const LOGO_DARK = require('../../assets/icon.png');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();
  const { login, setUser } = useAuth();
  const { theme } = useTheme();

  const openForgotModal = () => {
    setForgotEmail(email.trim());
    setForgotMessage(null);
    setShowForgotModal(true);
  };

  const closeForgotModal = () => {
    if (forgotLoading) return;
    setShowForgotModal(false);
    setForgotMessage(null);
  };

  const submitForgotPassword = async () => {
    const targetEmail = forgotEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setForgotMessage({ type: 'error', text: 'Vul een geldig e-mailadres in.' });
      return;
    }
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      await apiClient.post('/api/auth/forgot-password', { email: targetEmail });
      setForgotMessage({ type: 'success', text: 'Er is een link verstuurd naar uw e-mailadres.' });
    } catch (error: any) {
      const status = error?.response?.status;
      let text = 'Er ging iets mis. Probeer opnieuw.';
      if (status === 404) text = 'Er bestaat geen account met dit e-mailadres.';
      else if (status === 400) text = error?.response?.data?.detail || 'Vul een geldig e-mailadres in.';
      else if (status === 429) text = 'Te veel pogingen. Probeer over een minuut opnieuw.';
      setForgotMessage({ type: 'error', text });
    } finally {
      setForgotLoading(false);
    }
  };

  const logoSource = theme.logoBase64
    ? { uri: theme.logoBase64.startsWith('data:image') ? theme.logoBase64 : `data:image/png;base64,${theme.logoBase64}` }
    : LOGO_DARK;

  const handleLogin = async () => {
    setErrorMessage('');
    
    if (!email.trim()) {
      setErrorMessage('Vul uw e-mailadres in');
      return;
    }
    
    if (!password) {
      setErrorMessage('Vul uw wachtwoord in');
      return;
    }

    setIsLoading(true);
    try {
      const response = await login(email, password);
      const { user: userData, platform_access } = response;
      
      // Check platform access based on where we're running
      const isWeb = Platform.OS === 'web';
      
      // Use actual web_access and app_access from user response (from database)
      // Fall back to role-based check if not specified
      const userRole = userData.rol;
      const canAccessWeb = userData.web_access ?? WEB_PANEL_ROLES.includes(userRole);
      const canAccessApp = userData.app_access ?? MOBILE_APP_ROLES.includes(userRole);
      
      if (isWeb && !canAccessWeb) {
        // Worker/onderaannemer trying to use web panel without web_access
        setErrorMessage('Uw account heeft alleen toegang tot de mobiele app. Download de Smart-TS app.');
        return;
      }
      
      if (!isWeb && !canAccessApp) {
        // User trying to use mobile app without app_access
        setErrorMessage('Uw account heeft alleen toegang tot het webpaneel. Gebruik de browser versie.');
        return;
      }
      
      // Register push notifications on mobile
      if (Platform.OS !== 'web' && userData.id) {
        try {
          const { registerForPushNotifications } = require('../../utils/notifications');
          registerForPushNotifications(userData.id);
        } catch (e) { console.log('Push setup skipped:', e); }
      }
      
      // Check if user must change password
      if (userData.must_change_password) {
        // Redirect to password change screen (we'll handle this in the tabs)
        router.replace('/(tabs)');
        // Alert will be shown by the layout
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.response?.status === 401) {
        setErrorMessage('Onjuist e-mailadres of wachtwoord');
      } else {
        setErrorMessage('Kan niet verbinden met server. Probeer opnieuw.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Image 
              source={logoSource}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.title, { color: theme.secondaryColor }]}>{theme.bedrijfsnaam || 'Werkbon'}</Text>
            <Text style={styles.subtitle}>Login met uw gebruikersnaam</Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#dc3545" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#6c757d" style={styles.inputIcon} />
              <TextInput
                testID="login-email-input"
                style={styles.input}
                placeholder="E-mailadres"
                placeholderTextColor="#6c757d"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setErrorMessage('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#6c757d" style={styles.inputIcon} />
              <TextInput
                testID="login-password-input"
                style={styles.input}
                placeholder="Wachtwoord"
                placeholderTextColor="#6c757d"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setErrorMessage('');
                }}
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />
              <TouchableOpacity 
                testID="login-password-visibility-button"
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#6c757d"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="login-submit-button"
              style={[styles.button, { backgroundColor: theme.primaryColor }, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.secondaryColor || '#000'} />
              ) : (
                <Text style={[styles.buttonText, { color: theme.secondaryColor || '#000' }]}>Inloggen</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="login-forgot-password-link"
              style={styles.forgotLink}
              onPress={openForgotModal}
              disabled={isLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.forgotLinkText, { color: theme.primaryColor }]}>Wachtwoord vergeten?</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={closeForgotModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wachtwoord vergeten</Text>
              <TouchableOpacity onPress={closeForgotModal} disabled={forgotLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Vul uw e-mailadres in. We sturen u een link om uw wachtwoord opnieuw in te stellen.
            </Text>

            <View style={styles.modalInputContainer}>
              <Ionicons name="mail-outline" size={20} color="#6c757d" style={styles.inputIcon} />
              <TextInput
                testID="forgot-email-input"
                style={styles.input}
                placeholder="E-mailadres"
                placeholderTextColor="#6c757d"
                value={forgotEmail}
                onChangeText={(text) => { setForgotEmail(text); if (forgotMessage) setForgotMessage(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={!forgotLoading}
              />
            </View>

            {forgotMessage ? (
              <View style={[
                styles.modalMessageBox,
                forgotMessage.type === 'success' ? styles.modalMessageSuccess : styles.modalMessageError,
              ]}>
                <Ionicons
                  name={forgotMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={forgotMessage.type === 'success' ? '#15803D' : '#dc3545'}
                />
                <Text style={[
                  styles.modalMessageText,
                  { color: forgotMessage.type === 'success' ? '#15803D' : '#dc3545' },
                ]}>{forgotMessage.text}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalSecondaryBtn]}
                onPress={closeForgotModal}
                disabled={forgotLoading}
              >
                <Text style={styles.modalSecondaryBtnText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="forgot-submit-button"
                style={[styles.modalPrimaryBtn, { backgroundColor: theme.primaryColor }, forgotLoading && styles.buttonDisabled]}
                onPress={submitForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? (
                  <ActivityIndicator color={theme.secondaryColor || '#FFFFFF'} />
                ) : (
                  <Text style={[styles.modalPrimaryBtnText, { color: theme.secondaryColor || '#FFFFFF' }]}>Stuur een link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 280,
    height: 140,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0F172A',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#dc3545',
    fontSize: 14,
    flex: 1,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#22C55E',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotLink: {
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 8,
  },
  forgotLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalDescription: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  modalMessageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  modalMessageSuccess: {
    backgroundColor: '#DCFCE7',
  },
  modalMessageError: {
    backgroundColor: 'rgba(220,53,69,0.10)',
  },
  modalMessageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
