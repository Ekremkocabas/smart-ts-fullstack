import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Werkbon } from '../../store/appStore';
import { useAuth } from '../../context/AuthContext';
import { showAlert, showConfirm } from '../../utils/alerts';
const getStatusColor = (status: string) => {
  switch (status) {
    case 'concept': return '#ffc107';
    case 'ondertekend': return '#28a745';
    case 'verzonden': return '#F5A623';
    default: return '#6c757d';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'concept': return 'Concept';
    case 'ondertekend': return 'Ondertekend';
    case 'verzonden': return 'Verzonden';
    default: return status;
  }
};

const getCurrentWeek = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
  return Math.ceil(dayOfYear / 7);
};

const calcTotalUren = (werkbon: Werkbon) =>
  werkbon.uren.reduce(
    (sum, r) => sum + r.maandag + r.dinsdag + r.woensdag + r.donderdag + r.vrijdag + r.zaterdag + r.zondag,
    0
  );

export default function WerkbonnenScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { werkbonnen, fetchWerkbonnen, deleteWerkbon, duplicateWerkbon, isLoading } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const isAdmin = user?.rol === 'admin';
  const currentWeek = getCurrentWeek();

  useEffect(() => {
    if (user?.id) fetchWerkbonnen({ userId: user.id, isAdmin });
  }, [fetchWerkbonnen, isAdmin, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWerkbonnen({ userId: user?.id, isAdmin });
    setRefreshing(false);
  };

  // Unique week numbers from werkbonnen, sorted descending
  const weekNumbers = useMemo(() => {
    const weeks = Array.from(new Set(werkbonnen.map(w => w.week_nummer))).sort((a, b) => b - a);
    return weeks;
  }, [werkbonnen]);

  const filtered = useMemo(() => {
    if (selectedWeek === null) return werkbonnen;
    return werkbonnen.filter(w => w.week_nummer === selectedWeek);
  }, [werkbonnen, selectedWeek]);

  // Weekly stats
  const weekStats = useMemo(() => {
    const thisWeek = werkbonnen.filter(w => w.week_nummer === currentWeek);
    const totalUren = thisWeek.reduce((sum, w) => sum + calcTotalUren(w), 0);
    return { count: thisWeek.length, uren: totalUren };
  }, [werkbonnen, currentWeek]);

  const handleCopy = async (item: Werkbon) => {
    if (!user) return;
    try {
      const newWerkbon = await duplicateWerkbon(item.id, user.id, user.naam);
      router.push(`/werkbon/bewerken/${newWerkbon.id}`);
    } catch {
      showAlert('Fout', 'Kopie kon niet worden aangemaakt');
    }
  };

  const handleDelete = (item: Werkbon) => {
    showConfirm(
      'Werkbon verwijderen',
      `Wilt u de werkbon voor ${item.klant_naam} (week ${item.week_nummer}) verwijderen?`,
      async () => {
        try {
          await deleteWerkbon(item.id);
        } catch {
          if (Platform.OS === 'web') {
            window.alert('Werkbon kon niet worden verwijderd');
          }
        }
      },
      undefined,
      'Verwijderen',
      true
    );
  };

  const renderWerkbon = ({ item }: { item: Werkbon }) => {
    const totalUren = calcTotalUren(item);
    return (
      <View style={styles.werkbonRow}>
        <TouchableOpacity
          testID="werkbon-card"
          style={styles.werkbonCard}
          onPress={() => router.push(`/werkbon/${item.id}`)}
        >
          <View style={styles.werkbonHeader}>
            <View style={styles.weekBadge}>
              <Text style={styles.weekText}>Week {item.week_nummer}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
          <Text style={styles.klantNaam}>{item.klant_naam}</Text>
          <Text style={styles.werfNaam}>{item.werf_naam}</Text>
          <View style={styles.werkbonFooter}>
            <View style={styles.infoItem}>
              <Ionicons name="people-outline" size={14} color="#6c757d" />
              <Text style={styles.infoText}>{item.uren.length} pers.</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={14} color="#6c757d" />
              <Text style={styles.infoText}>{totalUren} uur</Text>
            </View>
            {item.km_afstand && (item.km_afstand.maandag + item.km_afstand.dinsdag + item.km_afstand.woensdag + item.km_afstand.donderdag + item.km_afstand.vrijdag + item.km_afstand.zaterdag + item.km_afstand.zondag) > 0 && (
              <View style={styles.infoItem}>
                <Ionicons name="car-outline" size={14} color="#6c757d" />
                <Text style={styles.infoText}>{item.km_afstand.maandag + item.km_afstand.dinsdag + item.km_afstand.woensdag + item.km_afstand.donderdag + item.km_afstand.vrijdag + item.km_afstand.zaterdag + item.km_afstand.zondag} km</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          testID="werkbon-copy-btn"
          style={styles.copyBtn}
          onPress={() => handleCopy(item)}
        >
          <Ionicons name="copy-outline" size={18} color="#F5A623" />
        </TouchableOpacity>
        <TouchableOpacity
          testID="werkbon-delete-btn"
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
        >
          <Ionicons name="trash-outline" size={18} color="#dc3545" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Werkbonnen</Text>
          <Text style={styles.subtitle}>
            {isAdmin ? 'Alle werkbonnen' : 'Uw werkbonnen'}
          </Text>
        </View>
        <TouchableOpacity
          testID="werkbon-add-button"
          style={styles.addButton}
          onPress={() => router.push('/werkbon/nieuw')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Weekly Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{weekStats.count}</Text>
          <Text style={styles.statLabel}>Week {currentWeek} werkbonnen</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#28a745' }]}>
          <Text style={[styles.statValue, { color: '#28a745' }]}>{weekStats.uren}</Text>
          <Text style={styles.statLabel}>Uren deze week</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#F5A623' }]}>
          <Text style={[styles.statValue, { color: '#F5A623' }]}>{werkbonnen.length}</Text>
          <Text style={styles.statLabel}>Totaal</Text>
        </View>
      </View>

      {/* Week Filter */}
      {weekNumbers.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          <TouchableOpacity
            style={[styles.weekChip, selectedWeek === null && styles.weekChipActive]}
            onPress={() => setSelectedWeek(null)}
          >
            <Text style={[styles.weekChipText, selectedWeek === null && styles.weekChipTextActive]}>
              Alle
            </Text>
          </TouchableOpacity>
          {weekNumbers.map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.weekChip, selectedWeek === w && styles.weekChipActive]}
              onPress={() => setSelectedWeek(selectedWeek === w ? null : w)}
            >
              <Text style={[styles.weekChipText, selectedWeek === w && styles.weekChipTextActive]}>
                Week {w}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isLoading && werkbonnen.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#6c757d" />
          <Text style={styles.emptyText}>
            {selectedWeek ? `Geen werkbonnen voor week ${selectedWeek}` : 'Nog geen werkbonnen'}
          </Text>
          <Text style={styles.emptySubtext}>Maak een nieuwe werkbon aan</Text>
          <TouchableOpacity
            testID="empty-state-werkbon-add-button"
            style={styles.emptyButton}
            onPress={() => router.push('/werkbon/nieuw')}
          >
            <Text style={styles.emptyButtonText}>Nieuwe Werkbon</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderWerkbon}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  addButton: {
    backgroundColor: '#F5A623',
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#2d3a5f',
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 10, color: '#6c757d', marginTop: 2 },
  filterScroll: { maxHeight: 46 },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    paddingBottom: 8,
  },
  weekChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  weekChipActive: {
    backgroundColor: '#F5A623',
    borderColor: '#F5A623',
  },
  weekChipText: { fontSize: 13, color: '#aaa', fontWeight: '500' },
  weekChipTextActive: { color: '#fff', fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 16, textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: '#6c757d', marginTop: 8 },
  emptyButton: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8, marginTop: 24,
  },
  emptyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 80 },
  werkbonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  werkbonCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
  },
  werkbonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  weekBadge: {
    backgroundColor: '#2d3a5f',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6,
  },
  weekText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  klantNaam: { fontSize: 16, fontWeight: '600', color: '#fff' },
  werfNaam: { fontSize: 13, color: '#a0a0a0', marginTop: 3 },
  werkbonFooter: { flexDirection: 'row', marginTop: 10, gap: 14 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, color: '#6c757d' },
  copyBtn: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5A62340',
  },
  deleteBtn: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2a1520',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dc354540',
  },
});
