import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../utils/alerts';
import { useAuth, getRoleLabel } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Helper for responsive design
const getScreenType = () => {
  const { width, height } = Dimensions.get('window');
  const isSmallScreen = height < 700; // Samsung Galaxy S21 and similar
  return { width, height, isSmallScreen };
};

export default function ProfielScreen() {
  const { user, logout, changePassword, isLoading: isAuthLoading } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [screenInfo, setScreenInfo] = useState(getScreenType());

  // Handle screen resize
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setScreenInfo(getScreenType());
    });
    return () => subscription?.remove();
  }, []);

  // Show loading state while auth context is initializing
  if (isAuthLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme?.primaryColor || '#F5A623'} />
          <Text style={styles.loadingText}>Profiel laden...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      logout().then(() => {
        router.replace('/(auth)/login');
      });
    } else {
      Alert.alert(
        'Uitloggen',
        'Weet u zeker dat u wilt uitloggen?',
        [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Uitloggen',
            style: 'destructive',
            onPress: async () => {
              await logout();
              router.replace('/(auth)/login');
            },
          },
        ]
      );
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert('Fout', 'Vul alle velden in');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showAlert('Fout', 'Nieuwe wachtwoorden komen niet overeen');
      return;
    }
    
    if (newPassword.length < 8) {
      showAlert('Fout', 'Nieuw wachtwoord moet minimaal 8 tekens bevatten');
      return;
    }
    
    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      
      showAlert('Succes', 'Wachtwoord is succesvol gewijzigd');
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const message = (error as any).response?.data?.detail || 'Kon wachtwoord niet wijzigen';
      showAlert('Fout', message);
    } finally {
      setIsLoading(false);
    }
  };

  // Get role display label
  const roleLabel = user?.rol ? getRoleLabel(user.rol) : 'Onbekend';
  
  // Determine platform access
  const hasWebAccess = user?.web_access ?? false;
  const hasAppAccess = user?.app_access ?? true;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 20, 40) }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profiel</Text>
        </View>

        <View style={styles.content}>
          <View style={[styles.avatarContainer, screenInfo.isSmallScreen && styles.avatarContainerCompact]}>
            <View style={[styles.avatar, screenInfo.isSmallScreen && styles.avatarCompact]}>
              <Ionicons name="person" size={screenInfo.isSmallScreen ? 36 : 48} color="#F5A623" />
            </View>
            <Text style={[styles.userName, screenInfo.isSmallScreen && styles.userNameCompact]}>{user?.naam}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoItem}>
              <Ionicons name="shield-checkmark" size={24} color={theme.primaryColor || "#F5A623"} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Rol</Text>
                <Text style={styles.infoValue}>{roleLabel}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={24} color="#28a745" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Status</Text>
                <Text style={styles.infoValue}>Actief</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="laptop-outline" size={24} color={hasWebAccess ? "#28a745" : "#6c757d"} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Webpaneel Toegang</Text>
                <Text style={styles.infoValue}>{hasWebAccess ? 'Ja' : 'Nee'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="phone-portrait-outline" size={24} color={hasAppAccess ? "#28a745" : "#6c757d"} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>App Toegang</Text>
                <Text style={styles.infoValue}>{hasAppAccess ? 'Ja' : 'Nee'}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity 
            testID="change-password-open-button"
            style={styles.actionButton} 
            onPress={() => setPasswordModalVisible(true)}
          >
            <Ionicons name="key-outline" size={24} color="#F5A623" />
            <Text style={styles.actionButtonText}>Wachtwoord wijzigen</Text>
            <Ionicons name="chevron-forward" size={20} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity testID="logout-button" style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#dc3545" />
            <Text style={styles.logoutText}>Uitloggen</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Password Change Modal */}
      <Modal
        visible={passwordModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wachtwoord Wijzigen</Text>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Huidig wachtwoord</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  testID="current-password-input"
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Voer huidig wachtwoord in"
                  placeholderTextColor="#6c757d"
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                  <Ionicons 
                    name={showCurrentPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color="#6c757d" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Nieuw wachtwoord</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  testID="new-password-input"
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Minimaal 6 tekens"
                  placeholderTextColor="#6c757d"
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                  <Ionicons 
                    name={showNewPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color="#6c757d" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bevestig nieuw wachtwoord</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  testID="confirm-password-input"
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Herhaal nieuw wachtwoord"
                  placeholderTextColor="#6c757d"
                  secureTextEntry={!showNewPassword}
                />
              </View>
            </View>

            <TouchableOpacity 
              testID="change-password-submit-button"
              style={[styles.saveButton, isLoading && styles.saveButtonDisabled]} 
              onPress={handleChangePassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveButtonText}>Wachtwoord Wijzigen</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A2E',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainerCompact: {
    marginBottom: 16,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarCompact: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 8,
  },
  userName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  userNameCompact: {
    fontSize: 18,
  },
  userEmail: {
    fontSize: 13,
    color: '#6c757d',
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoContent: {
    marginLeft: 14,
  },
  infoLabel: {
    fontSize: 11,
    color: '#6c757d',
  },
  infoValue: {
    fontSize: 15,
    color: '#1A1A2E',
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    minHeight: 52,
  },
  actionButtonText: {
    flex: 1,
    color: '#1A1A2E',
    fontSize: 15,
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.3)',
    minHeight: 56,
  },
  logoutText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6c757d',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#6c757d',
    fontSize: 14,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  input: {
    flex: 1,
    color: '#1A1A2E',
    fontSize: 16,
    paddingVertical: 16,
  },
  saveButton: {
    backgroundColor: '#F5A623',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
