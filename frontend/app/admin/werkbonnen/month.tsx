import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WerkbonnenPeriodList } from './WerkbonnenPeriodList';
import { useTheme } from '../../../context/ThemeContext';

const MAANDEN = [
  'Januari',
  'Februari',
  'Maart',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Augustus',
  'September',
  'Oktober',
  'November',
  'December',
];

export default function WerkbonnenMonthScreen() {
  const { theme } = useTheme();
  const now = new Date();
  const [jaar, setJaar] = useState(now.getFullYear());
  const [maand, setMaand] = useState(now.getMonth() + 1);

  const prev = () => {
    if (maand <= 1) {
      setMaand(12);
      setJaar((y) => y - 1);
    } else {
      setMaand((m) => m - 1);
    }
  };

  const next = () => {
    if (maand >= 12) {
      setMaand(1);
      setJaar((y) => y + 1);
    } else {
      setMaand((m) => m + 1);
    }
  };

  if (Platform.OS !== 'web') return null;

  const extraHeader = (
    <View style={styles.nav}>
      <TouchableOpacity onPress={prev} style={styles.navBtn} accessibilityLabel="Vorige maand">
        <Ionicons name="chevron-back" size={22} color={theme.secondaryColor || '#0F172A'} />
      </TouchableOpacity>
      <Text style={[styles.navLabel, { color: theme.secondaryColor || '#0F172A' }]}>
        {MAANDEN[maand - 1]} {jaar}
      </Text>
      <TouchableOpacity onPress={next} style={styles.navBtn} accessibilityLabel="Volgende maand">
        <Ionicons name="chevron-forward" size={22} color={theme.secondaryColor || '#0F172A'} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <WerkbonnenPeriodList
        key={`${jaar}-${maand}`}
        title="Werkbonnen deze maand"
        description="Alle werkbonnen waarvan de week in deze kalendermaand valt"
        jaar={jaar}
        maand={maand}
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
