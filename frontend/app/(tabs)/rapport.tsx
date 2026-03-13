import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const MAANDEN = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const MAANDEN_FULL = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

const getCurrentWeek = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
  return Math.ceil(dayOfYear / 7);
};

interface WerfDetail {
  werf_naam: string;
  uren: number;
}

interface WerknemerRapport {
  werknemer_naam: string;
  werven: WerfDetail[];
  totaal_uren: number;
}

export default function RapportScreen() {
  const [periodeType, setPeriodeType] = useState<'week' | 'maand'>('maand');
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const [week, setWeek] = useState(getCurrentWeek());
  const [maand, setMaand] = useState(new Date().getMonth() + 1);
  const [rapport, setRapport] = useState<WerknemerRapport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRapport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = { jaar };
      if (periodeType === 'week') params.week = week;
      else params.maand = maand;
      const res = await axios.get(`${BACKEND_URL}/api/rapporten/uren`, { params });
      setRapport(res.data);
    } catch {
      setRapport([]);
    } finally {
      setIsLoading(false);
    }
  }, [jaar, periodeType, week, maand]);

  useEffect(() => { fetchRapport(); }, [fetchRapport]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRapport();
    setRefreshing(false);
  };

  const buildCsvString = () => {
    const lines = ['Werknemer,Werf,Uren'];
    rapport.forEach(w => {
      if (w.werven.length === 0) {
        lines.push(`"${w.werknemer_naam}","",${w.totaal_uren}`);
      } else {
        w.werven.forEach(v => {
          lines.push(`"${w.werknemer_naam}","${v.werf_naam}",${v.uren}`);
        });
        lines.push(`"${w.werknemer_naam}","TOTAAL",${w.totaal_uren}`);
      }
    });
    return lines.join('\n');
  };

  const handleExport = async () => {
    setIsExporting(true);
    const label = periodeType === 'week'
      ? `week${week}_${jaar}`
      : `${MAANDEN[maand - 1].toLowerCase()}_${jaar}`;
    const filename = `rapport_${label}.csv`;
    const csv = buildCsvString();

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const docDir = (FileSystem as any).documentDirectory || '';
        const path = docDir + filename;
        const encoding = (FileSystem as any).EncodingType?.UTF8 || 'utf8';
        await (FileSystem as any).writeAsStringAsync(path, csv, { encoding });
        await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: '.csv', dialogTitle: 'Export Rapport' });
      }
    } catch {
      // silent
    } finally {
      setIsExporting(false);
    }
  };

  const totalUren = rapport.reduce((s, w) => s + w.totaal_uren, 0);

  const periodeLabel = periodeType === 'week'
    ? `Week ${week} / ${jaar}`
    : `${MAANDEN_FULL[maand - 1]} ${jaar}`;

  const navigate = (dir: -1 | 1) => {
    if (periodeType === 'week') {
      let nw = week + dir;
      let ny = jaar;
      if (nw < 1) { nw = 52; ny -= 1; }
      if (nw > 52) { nw = 1; ny += 1; }
      setWeek(nw);
      setJaar(ny);
    } else {
      let nm = maand + dir;
      let ny = jaar;
      if (nm < 1) { nm = 12; ny -= 1; }
      if (nm > 12) { nm = 1; ny += 1; }
      setMaand(nm);
      setJaar(ny);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Uren Rapport</Text>
          <Text style={styles.subtitle}>Overzicht per werknemer</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, isExporting && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={isExporting || rapport.length === 0}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.exportBtnText}>CSV</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Period Selector */}
      <View style={styles.periodContainer}>
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeBtn, periodeType === 'week' && styles.typeBtnActive]}
            onPress={() => setPeriodeType('week')}
          >
            <Text style={[styles.typeBtnText, periodeType === 'week' && styles.typeBtnTextActive]}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, periodeType === 'maand' && styles.typeBtnActive]}
            onPress={() => setPeriodeType('maand')}
          >
            <Text style={[styles.typeBtnText, periodeType === 'maand' && styles.typeBtnTextActive]}>Maand</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigate(-1)}>
            <Ionicons name="chevron-back" size={20} color="#F5A623" />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>{periodeLabel}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigate(1)}>
            <Ionicons name="chevron-forward" size={20} color="#F5A623" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Stats */}
      {rapport.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{rapport.length}</Text>
            <Text style={styles.statLabel}>Werknemers</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#F5A623' }]}>
            <Text style={[styles.statValue, { color: '#F5A623' }]}>{totalUren}</Text>
            <Text style={styles.statLabel}>Totaal uren</Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : rapport.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="bar-chart-outline" size={56} color="#2d3a5f" />
          <Text style={styles.emptyText}>Geen gegevens voor {periodeLabel}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />
          }
        >
          {rapport.map((werknemer, idx) => (
            <View key={idx} style={styles.werknemerCard}>
              <View style={styles.werknemerHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {werknemer.werknemer_naam.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.werknemerInfo}>
                  <Text style={styles.werknemerNaam}>{werknemer.werknemer_naam}</Text>
                  <Text style={styles.werknemerSub}>{werknemer.werven.length} werf{werknemer.werven.length !== 1 ? 'en' : ''}</Text>
                </View>
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeValue}>{werknemer.totaal_uren}</Text>
                  <Text style={styles.totalBadgeLabel}>uur</Text>
                </View>
              </View>

              {werknemer.werven.map((werf, wi) => (
                <View key={wi} style={styles.werfRow}>
                  <View style={styles.werfDot} />
                  <Text style={styles.werfNaam} numberOfLines={1}>{werf.werf_naam}</Text>
                  <Text style={styles.werfUren}>{werf.uren} uur</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1A1A2E' },
  subtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#28a745',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  periodContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 12,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: '#F5A623' },
  typeBtnText: { color: '#6c757d', fontSize: 14, fontWeight: '600' },
  typeBtnTextActive: { color: '#fff' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  periodLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', minWidth: 160, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#28a745',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#28a745' },
  statLabel: { fontSize: 10, color: '#6c757d', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6c757d', fontSize: 16, marginTop: 12, textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: 16 },
  werknemerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  werknemerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F6FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  avatarText: { color: '#F5A623', fontSize: 18, fontWeight: 'bold' },
  werknemerInfo: { flex: 1 },
  werknemerNaam: { color: '#1A1A2E', fontSize: 16, fontWeight: '600' },
  werknemerSub: { color: '#6c757d', fontSize: 12, marginTop: 2 },
  totalBadge: {
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 52,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  totalBadgeValue: { color: '#F5A623', fontSize: 18, fontWeight: 'bold' },
  totalBadgeLabel: { color: '#6c757d', fontSize: 10 },
  werfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    gap: 8,
  },
  werfDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F5A623',
    marginLeft: 4,
  },
  werfNaam: { flex: 1, color: '#6c757d', fontSize: 13 },
  werfUren: { color: '#1A1A2E', fontSize: 13, fontWeight: '600' },
});
