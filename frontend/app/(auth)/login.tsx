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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const LOGO_DARK = require('../../assets/images/smarttech-logo.png');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();
  const { setUser } = useAuth();
  const { theme } = useTheme();

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
      const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        email: email.trim().toLowerCase(),
        password: password,
      });
      
      const userData = response.data;
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);  // Update context
      
      // Register push notifications on mobile
      if (Platform.OS !== 'web' && userData.id) {
        try {
          const { registerForPushNotifications } = require('../../utils/notifications');
          registerForPushNotifications(userData.id);
        } catch (e) { console.log('Push setup skipped:', e); }
      }
      
      router.replace('/(tabs)');
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
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
    color: '#1A1A2E',
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
    color: '#1A1A2E',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#F5A623',
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
});
