import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../store/appStore';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Werkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  klant_naam: string;
  werf_naam: string;
  status: string;
  created_by_naam?: string;
  handtekening_data?: string;
  uren?: any[];
}

export default function WerkbonnenAdmin() {
  const { user } = useAppStore();
  const [werkbonnen, setWerkbonnen] = useState<Werkbon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterWeek, setFilterWeek] = useState<number | null>(null);

  const currentWeek = Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));

  if (Platform.OS !== 'web') return null;
  if (user?.role !== 'beheerder') {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
        </View>
      </View>
    );
  }

  useEffect(() => { fetchWerkbonnen(); }, []);

  const fetchWerkbonnen = async () => {
    try {
      const res = await fetch(`${API_URL}/api/werkbonnen`);
      const data = await res.json();
      setWerkbonnen(data.sort((a: Werkbon, b: Werkbon) => b.week_nummer - a.week_nummer));
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/werkbonnen/${id}/pdf`);
      const data = await res.json();
      if (data.pdf_base64) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.pdf_base64}`;
        link.download = `werkbon_${id}.pdf`;
        link.click();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const resendEmail = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/werkbonnen/${id}/verzenden`, { method: 'POST' });
      alert('E-mail opnieuw verzonden!');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept': return '#ffc107';
      case 'ondertekend': return '#28a745';
      case 'verzonden': return '#F5A623';
      default: return '#6c757d';
    }
  };

  const calcTotalUren = (wb: Werkbon) => {
    return wb.uren?.reduce((acc, u) => {
      return acc + (u.maandag || 0) + (u.dinsdag || 0) + (u.woensdag || 0) + (u.donderdag || 0) + (u.vrijdag || 0) + (u.zaterdag || 0) + (u.zondag || 0);
    }, 0) || 0;
  };

  let filtered = werkbonnen;
  if (search) {
    filtered = filtered.filter(wb =>
      wb.klant_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.werf_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.created_by_naam?.toLowerCase().includes(search.toLowerCase())
    );
  }
  if (filterStatus) {
    filtered = filtered.filter(wb => wb.status === filterStatus);
  }
  if (filterWeek) {
    filtered = filtered.filter(wb => wb.week_nummer === filterWeek);
  }

  const statusOptions = ['concept', 'ondertekend', 'verzonden'];
  const weekOptions = [...new Set(werkbonnen.map(wb => wb.week_nummer))].sort((a, b) => b - a).slice(0, 10);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Werkbonnen</Text>
          <Text style={styles.subtitle}>{werkbonnen.length} totaal</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#6c757d" />
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek klant, werf of werknemer..."
          placeholderTextColor="#6c757d"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal style={styles.filtersScroll} showsHorizontalScrollIndicator={false}>
        <View style={styles.filters}>
          <TouchableOpacity style={[styles.filterChip, !filterStatus && styles.filterChipActive]} onPress={() => setFilterStatus(null)}>
            <Text style={[styles.filterText, !filterStatus && styles.filterTextActive]}>Alle statussen</Text>
          </TouchableOpacity>
          {statusOptions.map((s) => (
            <TouchableOpacity key={s} style={[styles.filterChip, filterStatus === s && styles.filterChipActive]} onPress={() => setFilterStatus(filterStatus === s ? null : s)}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(s) }]} />
              <Text style={[styles.filterText, filterStatus === s && styles.filterTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          <TouchableOpacity style={[styles.filterChip, !filterWeek && styles.filterChipActive]} onPress={() => setFilterWeek(null)}>
            <Text style={[styles.filterText, !filterWeek && styles.filterTextActive]}>Alle weken</Text>
          </TouchableOpacity>
          {weekOptions.map((w) => (
            <TouchableOpacity key={w} style={[styles.filterChip, filterWeek === w && styles.filterChipActive]} onPress={() => setFilterWeek(filterWeek === w ? null : w)}>
              <Text style={[styles.filterText, filterWeek === w && styles.filterTextActive]}>Week {w}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list}>
          {filtered.map((wb) => (
            <View key={wb.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekText}>Week {wb.week_nummer}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wb.status) }]}>
                  <Text style={styles.statusText}>{wb.status}</Text>
                </View>
              </View>
              <Text style={styles.klantNaam}>{wb.klant_naam}</Text>
              <Text style={styles.werfNaam}>{wb.werf_naam}</Text>
              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={14} color="#6c757d" />
                  <Text style={styles.metaText}>{wb.created_by_naam || '-'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color="#6c757d" />
                  <Text style={styles.metaText}>{calcTotalUren(wb)} uur</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name={wb.handtekening_data ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={wb.handtekening_data ? '#28a745' : '#6c757d'} />
                  <Text style={styles.metaText}>{wb.handtekening_data ? 'Getekend' : 'Niet getekend'}</Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => downloadPdf(wb.id)}>
                  <Ionicons name="download-outline" size={20} color="#3498db" />
                  <Text style={[styles.actionText, { color: '#3498db' }]}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => resendEmail(wb.id)}>
                  <Ionicons name="mail-outline" size={20} color="#F5A623" />
                  <Text style={[styles.actionText, { color: '#F5A623' }]}>Versturen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/werkbon/${wb.id}` as any)}>
                  <Ionicons name="eye-outline" size={20} color="#6c757d" />
                  <Text style={styles.actionText}>Bekijken</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, marginLeft: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#6c757d' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 16, marginBottom: 8, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 16, color: '#1A1A2E' },
  filtersScroll: { maxHeight: 50, marginBottom: 8 },
  filters: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  filterChipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  filterText: { fontSize: 13, color: '#6c757d' },
  filterTextActive: { color: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  filterDivider: { width: 1, height: 24, backgroundColor: '#E8E9ED', marginHorizontal: 8 },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  weekBadge: { backgroundColor: '#F5F6FA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  weekText: { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  klantNaam: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  werfNaam: { fontSize: 14, color: '#6c757d', marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: '#6c757d' },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E8E9ED' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F5F6FA' },
  actionText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
});