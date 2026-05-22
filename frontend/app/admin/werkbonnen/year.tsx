import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WerkbonnenPeriodList } from './WerkbonnenPeriodList';
import { useTheme } from '../../../context/ThemeContext';

export default function WerkbonnenYearScreen() {
  const { theme } = useTheme();
  const [jaar, setJaar] = useState(new Date().getFullYear());

  if (Platform.OS !== 'web') return null;

  const extraHeader = (
    <View style={styles.nav}>
      <TouchableOpacity onPress={() => setJaar((y) => y - 1)} style={styles.navBtn} accessibilityLabel="Vorig jaar">
        <Ionicons name="chevron-back" size={22} color={theme.secondaryColor || '#0F172A'} />
      </TouchableOpacity>
      <Text style={[styles.navLabel, { color: theme.secondaryColor || '#0F172A' }]}>Kalenderjaar {jaar}</Text>
      <TouchableOpacity onPress={() => setJaar((y) => y + 1)} style={styles.navBtn} accessibilityLabel="Volgend jaar">
        <Ionicons name="chevron-forward" size={22} color={theme.secondaryColor || '#0F172A'} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <WerkbonnenPeriodList
        key={String(jaar)}
        title="Werkbonnen dit jaar"
        description="Alle werkbonnen met dit kalenderjaar in het veld jaar"
        jaar={jaar}
        extraHeader={extraHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  navBtn: { padding: 8 },
  navLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
});
