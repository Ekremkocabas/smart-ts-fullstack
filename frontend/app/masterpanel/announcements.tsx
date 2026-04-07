import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SIGNYBON_GREEN = '#1B4332';

export default function MasterAnnouncements() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Duyurular</Text>
      <Text style={styles.subtitle}>Platform-brede mededelingen</Text>

      <View style={styles.empty}>
        <Ionicons name="megaphone-outline" size={36} color="#adb5bd" />
        <Text style={styles.emptyText}>Mededelingen worden beheerd in de volgende fase.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 28 },
  title: { fontSize: 26, fontWeight: '800', color: SIGNYBON_GREEN },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4, marginBottom: 24 },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { color: '#6c757d', fontSize: 13 },
});
