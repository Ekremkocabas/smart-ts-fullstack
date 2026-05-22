import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

// Signybon diamond logo (3-layer rotated squares)
function SignybonLogo() {
  return (
    <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 40, height: 40, backgroundColor: '#22C55E', borderRadius: 8, transform: [{ rotate: '45deg' }], position: 'absolute' }} />
      <View style={{ width: 30, height: 30, backgroundColor: '#0F172A', borderRadius: 6, transform: [{ rotate: '45deg' }], position: 'absolute' }} />
      <View style={{ width: 16, height: 16, backgroundColor: '#22C55E', borderRadius: 3, transform: [{ rotate: '45deg' }], position: 'absolute' }} />
    </View>
  );
}

export default function AdminLogin() {
  const { user, isLoading, setUser, login: authLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If a session already exists (e.g. user logged in via /login plain HTML
  // and was sent here, or hit /admin/login directly while still authenticated),
  // skip the form and route them onward instead of asking for credentials again.
  useEffect(() => {
    if (Platform.OS !== 'web' || isLoading || !user) return;
    if (user.rol === 'platform_admin') {
      router.replace('/masterpanel' as any);
      return;
    }
    if (['beheerder', 'admin', 'manager', 'master_admin', 'planner'].includes(user.rol) && user.web_access !== false) {
      router.replace('/admin/dashboard');
    }
  }, [user, isLoading]);

  // Only show on web
  if (Platform.OS !== 'web') {
    return null;
  }

  // While auth state is hydrating from localStorage, don't render the form —
  // would briefly flash the login screen for an already-logged-in user.
  if (isLoading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#0F172A" size="large" />
      </View>
    );
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Vul alle velden in');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authLogin(email.trim(), password);
      const userFromResponse = response.user;
      const userRole = userFromResponse.rol;
      const hasWebAccess = userFromResponse.web_access !== false;

      // Platform owner goes straight to the Signybon master panel
      if (userRole === 'platform_admin') {
        router.replace('/masterpanel' as any);
        return;
      }

      if (!['beheerder', 'admin', 'master_admin', 'planner'].includes(userRole)) {
        setError('Alleen beheerders hebben toegang tot dit portaal');
        return;
      }

      if (!hasWebAccess) {
        setError('U heeft geen toegang tot het webportaal');
        return;
      }

      router.replace('/admin/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ongeldige inloggegevens';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior="padding" style={styles.content}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <SignybonLogo />
            </View>
            <Text style={styles.title}>SIGNYBON</Text>
            <Text style={styles.subtitle}>Het digitale werkbonplatform</Text>
          </View>

          {error ? (
            <View testID="admin-login-error-container" style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#dc3545" />
              <Text testID="admin-login-error-text" style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>E-mailadres</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#6c757d" style={styles.inputIcon} />
              <TextInput
                testID="admin-login-email-input"
                style={styles.input}
                placeholder="naam@bedrijf.be"
                placeholderTextColor="#a0a0a0"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <Text style={styles.label}>Wachtwoord</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#6c757d" style={styles.inputIcon} />
              <TextInput
                testID="admin-login-password-input"
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#a0a0a0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#6c757d" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="admin-login-submit-button"
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#22C55E" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.loginButtonText}>Inloggen</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Alleen voor geautoriseerd personeel</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.backLink} onPress={() => { window.location.href = '/'; }}>
          <Ionicons name="arrow-back" size={18} color="#6c757d" />
          <Text style={styles.backLinkText}>Terug naar homepage</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.registerLink} onPress={() => { window.location.href = '/register'; }}>
          <Text style={styles.registerLinkText}>
            Nog geen account? <Text style={styles.registerLinkAccent}>Registreer nu — 30 dagen gratis</Text>
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  header: { alignItems: 'center', marginBottom: 32 },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#0F172A15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc354515',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    gap: 8,
  },
  errorText: { color: '#dc3545', fontSize: 14, flex: 1 },
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#0F172A', marginBottom: 6, marginTop: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#0F172A', fontSize: 16 },
  eyeIcon: { padding: 4 },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    height: 56,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  loginButtonDisabled: { opacity: 0.7 },
  loginButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
  },
  footerText: { color: '#6c757d', fontSize: 12 },
  backLink: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 6 },
  backLinkText: { color: '#6c757d', fontSize: 14 },
  registerLink: { marginTop: 12 },
  registerLinkText: { color: '#6c757d', fontSize: 14 },
  registerLinkAccent: { color: '#0F172A', fontWeight: '700' },
});
