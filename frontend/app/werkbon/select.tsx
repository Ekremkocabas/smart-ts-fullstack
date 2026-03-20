/**
 * Unified Werkbon System - Type Selector
 * First screen: Select which werkbon type to create
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';

const WERKBON_TYPES = [
  {
    id: 'uren',
    title: 'Uren Werkbon',
    description: 'Werkuren registreren per week',
    icon: 'time-outline',
    color: '#3498db',
  },
  {
    id: 'productie',
    title: 'Productie Werkbon',
    description: 'Productie werk registreren',
    icon: 'construct-outline',
    color: '#27ae60',
  },
  {
    id: 'oplevering',
    title: 'Oplevering Werkbon',
    description: 'Oplevering documenteren',
    icon: 'checkmark-done-outline',
    color: '#9b59b6',
  },
  {
    id: 'project',
    title: 'Project Werkbon',
    description: 'Project taken registreren',
    icon: 'folder-outline',
    color: '#e67e22',
  },
];

export default function WerkbonTypeSelector() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const primary = theme.primaryColor || '#F5A623';

  const handleSelectType = (typeId: string) => {
    if (typeId === 'uren') {
      // Uren has its own special flow
      router.push('/werkbon/nieuw');
    } else {
      // Other types use unified flow
      router.push(`/werkbon/form?type=${typeId}`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nieuwe Werkbon</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Selecteer werkbon type</Text>

        {WERKBON_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={styles.typeCard}
            onPress={() => handleSelectType(type.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: type.color + '20' }]}>
              <Ionicons name={type.icon as any} size={28} color={type.color} />
            </View>
            <View style={styles.typeInfo}>
              <Text style={styles.typeTitle}>{type.title}</Text>
              <Text style={styles.typeDescription}>{type.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#8C9199" />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 20,
    textAlign: 'center',
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  typeInfo: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 14,
    color: '#8C9199',
  },
});
