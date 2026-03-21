import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

// Determine API URL - ALWAYS use window.location.origin for web production
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    // Production - use current origin, NO env variables
    return window.location.origin;
  }
  // Mobile only
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

const getScreenSize = () => {
  const { width } = Dimensions.get('window');
  if (width < 480) return 'phone';
  if (width < 768) return 'tablet';
  return 'desktop';
};

export default function AccountScreen() {
  const { user } = useAuth();
  const [screenSize, setScreenSize] = useState(getScreenSize());
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle screen resize
  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setScreenSize(getScreenSize());
    });
    return () => subscription?.remove();
  }, []);

  if (Platform.OS !== 'web') return null;

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Vul alle velden in');
      return;
    }

    if (newPassword.length < 8) {
      setError('Nieuw wachtwoord moet minimaal 8 tekens bevatten');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Nieuwe wachtwoorden komen niet overeen');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Wachtwoord wijzigen mislukt');
      }

      setSuccess('Wachtwoord is succesvol gewijzigd!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Er is een fout opgetreden');
    } finally {
      setIsLoading(false);
    }
  };

  const isCompact = screenSize === 'phone';

  return (
    <View style={styles.container}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Account</Text>
          {!isCompact && <Text style={styles.subtitle}>Beheer uw accountinstellingen</Text>}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={[styles.contentInner, isCompact && styles.contentCompact]}>
        {/* User Info Card */}
        <View style={[styles.card, isCompact && styles.cardCompact]}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={24} color="#F5A623" />
            <Text style={styles.cardTitle}>Profiel</Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{user?.naam?.charAt(0) || 'A'}</Text>
            </View>
            <View style={styles.profileDetails}>
              <Text style={styles.profileName}>{user?.naam || 'Gebruiker'}</Text>
              <Text style={styles.profileEmail}>{user?.email || '-'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{user?.rol || 'Admin'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Password Change Card */}
        <View style={[styles.card, isCompact && styles.cardCompact]}>
          <View style={styles.cardHeader}>
            <Ionicons name="key-outline" size={24} color="#F5A623" />
            <Text style={styles.cardTitle}>Wachtwoord Wijzigen</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color="#dc3545" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={20} color="#28a745" />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Huidig wachtwoord</Text>
            <View style={styles.passwordInput}>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Voer huidig wachtwoord in"
                placeholderTextColor="#6c757d"
                secureTextEntry={!showCurrentPassword}
              />
              <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} style={styles.eyeBtn}>
                <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6c757d" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Nieuw wachtwoord</Text>
            <View style={styles.passwordInput}>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimaal 8 tekens"
                placeholderTextColor="#6c757d"
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeBtn}>
                <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6c757d" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Bevestig nieuw wachtwoord</Text>
            <View style={styles.passwordInput}>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Herhaal nieuw wachtwoord"
                placeholderTextColor="#6c757d"
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6c757d" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, isLoading && styles.saveBtnDisabled]}
            onPress={handleChangePassword}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Wachtwoord Wijzigen</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Security Tips */}
        <View style={[styles.card, styles.tipsCard, isCompact && styles.cardCompact]}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#28a745" />
            <Text style={styles.cardTitle}>Beveiligingstips</Text>
          </View>
          <View style={styles.tipsList}>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#28a745" />
              <Text style={styles.tipText}>Gebruik minimaal 8 tekens</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#28a745" />
              <Text style={styles.tipText}>Combineer letters, cijfers en symbolen</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#28a745" />
              <Text style={styles.tipText}>Gebruik geen persoonlijke informatie</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color="#28a745" />
              <Text style={styles.tipText}>Wijzig uw wachtwoord regelmatig</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  headerCompact: { padding: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, marginLeft: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' },
  titleCompact: { fontSize: 18 },
  subtitle: { fontSize: 13, color: '#6c757d' },
  content: { flex: 1 },
  contentInner: { padding: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },
  contentCompact: { padding: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  cardCompact: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  profileInfo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  profileDetails: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  profileEmail: { fontSize: 14, color: '#6c757d', marginTop: 2 },
  roleBadge: { backgroundColor: '#F5A62320', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginTop: 8 },
  roleText: { fontSize: 12, color: '#F5A623', fontWeight: '600' },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, fontWeight: '500' },
  passwordInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F6FA', borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED' },
  input: { flex: 1, padding: 14, fontSize: 16, color: '#1A1A2E' },
  eyeBtn: { padding: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#dc354515', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: '#dc3545', fontSize: 14, flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#28a74515', padding: 12, borderRadius: 8, marginBottom: 16 },
  successText: { color: '#28a745', fontSize: 14, flex: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#28a745', padding: 16, borderRadius: 12, marginTop: 8 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tipsCard: { backgroundColor: '#f8fff8' },
  tipsList: { gap: 10 },
  tipItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipText: { fontSize: 14, color: '#1A1A2E' },
});
