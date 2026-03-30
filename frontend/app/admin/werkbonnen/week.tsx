import React from 'react';
import { View, Platform } from 'react-native';
import { WerkbonnenPeriodList } from './WerkbonnenPeriodList';

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function WerkbonnenWeekScreen() {
  const now = new Date();
  const week = getISOWeek(now);
  const jaar = now.getFullYear();

  if (Platform.OS !== 'web') return null;

  return (
    <View style={{ flex: 1 }}>
      <WerkbonnenPeriodList
        title="Werkbonnen deze week"
        description={`ISO-week ${week} · jaar ${jaar}`}
        weekNummer={week}
        jaar={jaar}
      />
    </View>
  );
}
