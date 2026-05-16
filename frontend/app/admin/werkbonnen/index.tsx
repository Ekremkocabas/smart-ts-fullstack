import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';

const hubCards = [
  {
    key: 'week',
    title: 'Deze week',
    subtitle: 'Werkbonnen van de huidige ISO-week',
    icon: 'calendar' as const,
    color: '#D4A017',
    route: '/admin/werkbonnen/week' as const,
  },
  {
    key: 'month',
    title: 'Deze maand',
    subtitle: 'Per kalendermaand filteren',
    icon: 'calendar-outline' as const,
    color: '#3498db',
    route: '/admin/werkbonnen/month' as const,
  },
  {
    key: 'year',
    title: 'Dit jaar',
    subtitle: 'Alle werkbonnen van een kalenderjaar',
    icon: 'albums-outline' as const,
    color: '#9b59b6',
    route: '/admin/werkbonnen/year' as const,
  },
  {
    key: 'volledig',
    title: 'Volledig overzicht',
    subtitle: 'Uren, prestatie, oplevering & project — filters & export',
    icon: 'layers-outline' as const,
    color: '#1B4332',
    route: '/admin/werkbonnen/volledig' as const,
  },
];

export default function WerkbonnenHub() {
  const { user } = useAuth();
  const { theme } = useTheme();

  if (Platform.OS !== 'web') return null;
  if (!['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#6c757d' }}>Geen toegang</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.secondaryColor || '#1B4332' }]}>Werkbonnen</Text>
      <Text style={styles.subtitle}>
        Kies een periode of open het volledige overzicht met alle types werkbonnen.
      </Text>

      <View style={styles.grid}>
        {hubCards.map((card) => {
          const resolvedColor = card.color === '#D4A017' ? (theme.primaryColor || '#D4A017') : card.color === '#1B4332' ? (theme.secondaryColor || '#1B4332') : card.color;
          return (
          <TouchableOpacity
            key={card.key}
            style={[styles.card, { borderLeftColor: resolvedColor }]}
            onPress={() => router.push(card.route as any)}
            activeOpacity={0.85}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${resolvedColor}18` }]}>
              <Ionicons name={card.icon} size={28} color={resolvedColor} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.secondaryColor || '#1B4332' }]}>{card.title}</Text>
            <Text style={styles.cardSub}>{card.subtitle}</Text>
            <View style={styles.cardFooter}>
              <Text style={[styles.cardLink, { color: resolvedColor }]}>Openen</Text>
              <Ionicons name="chevron-forward" size={18} color={resolvedColor} />
            </View>
          </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#1B4332', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6c757d', marginBottom: 28, lineHeight: 22 },
  grid: { gap: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    borderLeftWidth: 4,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1B4332' },
  cardSub: { fontSize: 14, color: '#6c757d', marginTop: 6, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 16 },
  cardLink: { fontSize: 14, fontWeight: '600' },
});
