/**
 * Werkbon Index - Type Selection (Step 1)
 * User selects which werkbon type to create
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useWerkbonFormStore, WerkbonType } from '../../store/werkbonFormStore';

interface WerkbonTypeOption {
  type: WerkbonType;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const WERKBON_TYPES: WerkbonTypeOption[] = [
  {
    type: 'uren',
    title: 'Uren Werkbon',
    description: 'Wekelijkse urenregistratie per teamlid',
    icon: 'time-outline',
    color: '#3498db',
  },
  {
    type: 'oplevering',
    title: 'Oplevering',
    description: 'Werk opleveren met controlelijst',
    icon: 'checkmark-done-outline',
    color: '#27ae60',
  },
  {
    type: 'project',
    title: 'Project',
    description: 'Projectregistratie en voortgang',
    icon: 'briefcase-outline',
    color: '#9b59b6',
  },
  {
    type: 'prestatie',
    title: 'Prestatie',
    description: 'Productie werkbon (PUR, CHAP, etc.)',
    icon: 'construct-outline',
    color: '#e67e22',
  },
];

export default function WerkbonTypeSelect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { hasDraft, type: existingType, setType, startNewDraft, clearDraft } = useWerkbonFormStore();
  
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [selectedType, setSelectedType] = useState<WerkbonType | null>(null);
  
  const primary = theme?.primaryColor || '#F5A623';
  
  // User's allowed werkbon types
  const userWerkbonTypes = user?.werkbon_types || ['uren'];
  const isAdmin = user?.rol === 'admin' || user?.rol === 'master_admin';
  
  // Filter types based on user permissions
  const availableTypes = WERKBON_TYPES.filter(t => 
    isAdmin || userWerkbonTypes.includes(t.type)
  );

  // Check for existing draft on mount
  useEffect(() => {
    if (hasDraft && existingType) {
      setShowDraftModal(true);
    }
  }, []);

  const handleTypeSelect = (type: WerkbonType) => {
    if (hasDraft && existingType && existingType !== type) {
      // Different type selected, ask about existing draft
      setSelectedType(type);
      setShowDraftModal(true);
    } else {
      // No draft or same type
      proceedWithType(type);
    }
  };

  const proceedWithType = (type: WerkbonType) => {
    setType(type);
    
    // If it's uren type and user is logged in, initialize with user name
    if (type === 'uren' && user?.naam) {
      // Use store's initializeUrenWithUser function
      const { initializeUrenWithUser } = useWerkbonFormStore.getState();
      initializeUrenWithUser(user.naam);
    }
    
    router.push('/werkbon/form');
  };

  const handleResumeDraft = () => {
    setShowDraftModal(false);
    if (existingType) {
      router.push('/werkbon/form');
    }
  };

  const handleNewDraft = () => {
    setShowDraftModal(false);
    clearDraft();
    if (selectedType) {
      proceedWithType(selectedType);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Werkbon Aanmaken</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + 20 }
        ]}
      >
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Welk type werkbon wilt u aanmaken?</Text>
          <Text style={styles.subtitle}>Selecteer het type dat past bij uw werkzaamheden</Text>
        </View>

        {/* Type Cards */}
        <View style={styles.cardsContainer}>
          {availableTypes.map((option) => (
            <TouchableOpacity
              key={option.type}
              style={styles.typeCard}
              onPress={() => handleTypeSelect(option.type)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${option.color}15` }]}>
                <Ionicons name={option.icon as any} size={32} color={option.color} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{option.title}</Text>
                <Text style={styles.cardDescription}>{option.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#C4C4C4" />
            </TouchableOpacity>
          ))}
        </View>

        {/* No permissions message */}
        {availableTypes.length === 0 && (
          <View style={styles.noPermissions}>
            <Ionicons name="lock-closed-outline" size={48} color="#C4C4C4" />
            <Text style={styles.noPermissionsText}>
              U heeft geen rechten om werkbonnen aan te maken.
            </Text>
            <Text style={styles.noPermissionsSubtext}>
              Neem contact op met uw beheerder.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Draft Recovery Modal */}
      <Modal
        visible={showDraftModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDraftModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="document-text-outline" size={40} color={primary} />
            </View>
            <Text style={styles.modalTitle}>Concept gevonden</Text>
            <Text style={styles.modalMessage}>
              U heeft een {existingType === 'uren' ? 'Uren Werkbon' : 
                existingType === 'oplevering' ? 'Oplevering' :
                existingType === 'project' ? 'Project' : 'Prestatie'} concept.
              Wilt u deze hervatten of opnieuw beginnen?
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={handleNewDraft}
              >
                <Text style={styles.modalButtonSecondaryText}>Nieuw beginnen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: primary }]}
                onPress={handleResumeDraft}
              >
                <Text style={styles.modalButtonPrimaryText}>Hervatten</Text>
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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6C7A89',
    lineHeight: 22,
  },
  cardsContainer: {
    gap: 12,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6C7A89',
    lineHeight: 20,
  },
  noPermissions: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noPermissionsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
    marginTop: 16,
    textAlign: 'center',
  },
  noPermissionsSubtext: {
    fontSize: 14,
    color: '#6C7A89',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: '#6C7A89',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#F5F6FA',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  modalButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6C7A89',
  },
  modalButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
  },
});
