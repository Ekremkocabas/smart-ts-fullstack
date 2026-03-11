import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';

export default function ProfielScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    // Web'de Alert.alert çalışmayabilir, doğrudan logout yapalım
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profiel</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color="#F5A623" />
          </View>
          <Text style={styles.userName}>{user?.naam}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoItem}>
            <Ionicons name="shield-checkmark" size={24} color="#F5A623" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Rol</Text>
              <Text style={styles.infoValue}>
                {user?.rol === 'admin' ? 'Beheerder' : 'Werknemer'}
              </Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={24} color="#28a745" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>Actief</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#dc3545" />
          <Text style={styles.logoutText}>Uitloggen</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#16213e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  userEmail: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 4,
  },
  infoSection: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginTop: 'auto',
  },
  logoutText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
  },
});
