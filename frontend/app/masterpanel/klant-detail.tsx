import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

const SIGNYBON_GREEN = '#1B4332';

export default function MasterKlantDetail() {
  const params = useLocalSearchParams<{ company_id?: string }>();
  const companyId = params.company_id || '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={SIGNYBON_GREEN} />
        <Text style={styles.backText}>Terug</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Klant detail</Text>
      <Text style={styles.subtitle}>company_id: {companyId || '—'}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bedrijfsgegevens</Text>
        <Text style={styles.placeholder}>Wordt gevuld in de volgende fase.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acties</Text>
        <Text style={styles.placeholder}>Block / Unblock / Trial verlengen / Plan wijzigen / Verwijderen.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 18,
  },
  backText: { color: SIGNYBON_GREEN, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 13, color: '#6c757d', marginTop: 4, marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 22,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: SIGNYBON_GREEN,
    marginBottom: 8,
  },
  placeholder: { color: '#6c757d', fontSize: 13 },
});
