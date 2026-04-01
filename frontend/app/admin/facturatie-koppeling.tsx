import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, apiClient } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface FacturatieSettings {
  billit_actief: boolean;
}

interface SystemCard {
  id: string;
  name: string;
  description: string;
  color: string;
  iconBg: string;
  letter: string;
  available: boolean;
  route?: string;
}

const SYSTEMS: SystemCard[] = [
  {
    id: 'billit',
    name: 'Billit',
    description: 'Belgische facturatiesoftware voor KMO\'s',
    color: '#0066CC',
    iconBg: '#E6F0FF',
    letter: 'B',
    available: true,
    route: '/admin/billit-koppeling',
  },
  {
    id: 'exact',
    name: 'Exact Online',
    description: 'ERP & boekhoudoplossing',
    color: '#E4002B',
    iconBg: '#FFE6EA',
    letter: 'E',
    available: false,
  },
  {
    id: 'octopus',
    name: 'Octopus',
    description: 'Boekhoudsoftware voor accountants',
    color: '#F5820D',
    iconBg: '#FFF0E0',
    letter: 'O',
    available: false,
  },
  {
    id: 'yuki',
    name: 'Yuki',
    description: 'Online boekhoudplatform',
    color: '#00A651',
    iconBg: '#E6F7EE',
    letter: 'Y',
    available: false,
  },
  {
    id: 'snelstart',
    name: 'SnelStart',
    description: 'Boekhoud- en facturatiesoftware',
    color: '#1B4F9E',
    iconBg: '#E6ECF8',
    letter: 'S',
    available: false,
  },
];

export default function FacturatieKoppelingScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [billitActief, setBillitActief] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (async () => {
      try {
        const res = await apiClient.get('/api/instellingen/facturatie');
        setBillitActief(res.data?.billit_actief ?? false);
      } catch {
        // silently ignore
      }
    })();
  }, []);

  if (Platform.OS !== 'web') return null;

  const canAccess = ['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '');
  if (!canAccess) {
    return (
      <View style={styles.noAccess}>
        <Ionicons name="lock-closed-outline" size={48} color="#6c757d" />
        <Text style={styles.noAccessText}>Geen toegang</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/admin/instellingen' as any)}>
          <Ionicons name="arrow-back" size={22} color={theme.primaryColor || '#F5A623'} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: theme.secondaryColor || '#1A1A2E' }]}>Facturatie Koppeling</Text>
          <Text style={styles.subtitle}>Koppel uw facturatieprogramma aan het systeem</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Logo cards grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kies uw facturatieprogramma</Text>
          <Text style={styles.sectionSubtitle}>Selecteer het programma dat u gebruikt voor uw facturatie</Text>

          <View style={styles.cardGrid}>
            {SYSTEMS.map((sys) => (
              <SystemCardItem
                key={sys.id}
                sys={sys}
                isConnected={sys.id === 'billit' && billitActief}
              />
            ))}
          </View>
        </View>

        {/* How-to block */}
        <View style={styles.howToSection}>
          <View style={styles.howToHeader}>
            <Ionicons name="help-circle-outline" size={24} color="#6C47FF" />
            <Text style={styles.howToTitle}>Hoe verbinden met uw factuur programma</Text>
          </View>

          <View style={styles.howToSteps}>
            <HowToStep
              number="1"
              title="Log in op uw facturatieprogramma"
              description="Ga naar uw facturatiesoftware (bijv. my.billit.be) en log in met uw accountgegevens."
            />
            <HowToStep
              number="2"
              title="Genereer een API-sleutel"
              description="Ga naar Instellingen → API en genereer een nieuwe API-sleutel. Kopieer deze sleutel zorgvuldig — u ziet hem slechts één keer."
            />
            <HowToStep
              number="3"
              title="Plak de API-sleutel hier"
              description="Klik op het gewenste programma hierboven, plak de API-sleutel in het daarvoor bestemde veld en sla op."
            />
            <HowToStep
              number="4"
              title="Automatisch of handmatig versturen"
              description="U kunt werkbonnen automatisch naar uw factuurprogramma sturen zodra ze verzonden zijn. Als u automatisch versturen uitschakelt, verschijnt er een handmatig verstuur-icoon naast elke werkbon op de werkbonnen-pagina — zo heeft u volledige controle over welke werkbonnen gefactureerd worden."
            />
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#0066CC" />
            <Text style={styles.infoText}>
              Eenmaal verbonden worden werkbonnen als factuurvoorstel aangemaakt in uw softwarepakket. U dient de factuur daar nog te controleren en definitief te maken voor verzending naar de klant.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function SystemCardItem({ sys, isConnected }: { sys: SystemCard; isConnected: boolean }) {
  if (!sys.available) {
    return (
      <View style={styles.card}>
        {/* Coming soon overlay */}
        <View style={styles.comingSoonOverlay} pointerEvents="none">
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Binnenkort</Text>
          </View>
        </View>
        <View style={[styles.cardIconWrap, { backgroundColor: sys.iconBg }]}>
          <Text style={[styles.cardLetter, { color: sys.color }]}>{sys.letter}</Text>
        </View>
        <Text style={[styles.cardName, { opacity: 0.5 }]}>{sys.name}</Text>
        <Text style={[styles.cardDesc, { opacity: 0.5 }]}>{sys.description}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, styles.cardActive, isConnected && styles.cardConnected]}
      onPress={() => router.push(sys.route as any)}
    >
      {isConnected && (
        <View style={styles.connectedBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#28a745" />
          <Text style={styles.connectedText}>Verbonden</Text>
        </View>
      )}
      <View style={[styles.cardIconWrap, { backgroundColor: sys.iconBg }]}>
        <Text style={[styles.cardLetter, { color: sys.color }]}>{sys.letter}</Text>
      </View>
      <Text style={styles.cardName}>{sys.name}</Text>
      <Text style={styles.cardDesc}>{sys.description}</Text>
      <View style={styles.cardArrow}>
        <Ionicons name="arrow-forward-circle-outline" size={20} color={sys.color} />
      </View>
    </TouchableOpacity>
  );
}

function HowToStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, marginLeft: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#6c757d' },

  // Content
  content: { padding: 16, maxWidth: 900, alignSelf: 'center', width: '100%' },

  // Section
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#6c757d', marginBottom: 20 },

  // Card grid
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '30%',
    minWidth: 160,
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    position: 'relative',
    overflow: 'hidden',
  },
  cardActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0C4FF',
    shadowColor: '#6C47FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardConnected: {
    borderColor: '#28a745',
    borderWidth: 2,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardLetter: { fontSize: 26, fontWeight: '800' },
  cardName: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#6c757d', lineHeight: 16 },
  cardArrow: { marginTop: 12, alignSelf: 'flex-end' },

  // Coming soon overlay
  comingSoonOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  },
  comingSoonBadge: {
    backgroundColor: '#6c757d',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },

  // Connected badge
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'absolute',
    top: 10,
    right: 10,
  },
  connectedText: { fontSize: 11, fontWeight: '600', color: '#28a745' },

  // How-to section
  howToSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  howToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  howToTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },

  // Steps
  howToSteps: { gap: 16, marginBottom: 20 },
  step: { flexDirection: 'row', gap: 14 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6C47FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  stepNumberText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  stepDesc: { fontSize: 13, color: '#6c757d', lineHeight: 20 },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#E6F0FF',
    borderRadius: 10,
    padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, color: '#0066CC', lineHeight: 20 },
});
