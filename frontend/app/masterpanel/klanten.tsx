import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SIGNYBON_GREEN = '#1B4332';

export default function MasterKlanten() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bedrijven overzicht</Text>
      <Text style={styles.subtitle}>Alle Signybon-klanten</Text>

      <View style={styles.tableShell}>
        <View style={styles.tableHeader}>
          <Text style={[styles.col, styles.colName]}>Bedrijf</Text>
          <Text style={[styles.col, styles.colSmall]}>Plan</Text>
          <Text style={[styles.col, styles.colSmall]}>Status</Text>
          <Text style={[styles.col, styles.colSmall]}>Trial einde</Text>
          <Text style={[styles.col, styles.colSmall]}>Acties</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={32} color="#adb5bd" />
          <Text style={styles.emptyText}>Lijst wordt gevuld in de volgende fase.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4, marginBottom: 24 },
  tableShell: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  col: { fontSize: 13, fontWeight: '700', color: '#495057' },
  colName: { flex: 2 },
  colSmall: { flex: 1 },
  empty: { alignItems: 'center', padding: 60, gap: 10 },
  emptyText: { color: '#6c757d', fontSize: 13 },
});
