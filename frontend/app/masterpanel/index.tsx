import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SIGNYBON_GREEN = '#1B4332';
const SIGNYBON_GOLD = '#D4A017';

const placeholderCards: { icon: any; label: string }[] = [
  { icon: 'business', label: 'Totaal bedrijven' },
  { icon: 'time', label: 'Actieve trials' },
  { icon: 'document-text', label: 'Werkbonnen' },
  { icon: 'cash', label: 'Omzet' },
];

export default function MasterDashboard() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Signybon Master Panel — Dashboard</Text>
        <Text style={styles.subtitle}>Platform overzicht</Text>
      </View>

      <View style={styles.grid}>
        {placeholderCards.map((card) => (
          <View key={card.label} style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name={card.icon} size={26} color={SIGNYBON_GREEN} />
            </View>
            <Text style={styles.cardValue}>—</Text>
            <Text style={styles.cardLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.placeholderNote}>
        <Ionicons name="information-circle-outline" size={18} color="#6c757d" />
        <Text style={styles.placeholderText}>
          Inhoud wordt gevuld in de volgende fase.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  header: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 22,
    minWidth: 220,
    flexGrow: 1,
    flexBasis: 220,
    borderTopWidth: 3,
    borderTopColor: SIGNYBON_GOLD,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1B433215',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: '800',
    color: SIGNYBON_GREEN,
  },
  cardLabel: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  placeholderNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
  },
  placeholderText: { color: '#6c757d', fontSize: 13 },
});
