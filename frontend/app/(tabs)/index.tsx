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
import { useWerkbonFormStore, WerkbonType, getCurrentWeekNumber } from '../../store/werkbonFormStore';
const getStatusColor = (status: string) => {
  switch (status) {
    case 'concept': return '#ffc107';
    case 'ondertekend': return '#28a745';
    case 'verzonden': return '#D4A017';
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

// Helper to safely get numeric value (skip afkortingen like V, OV, Z)
const AFKORTINGEN = ['Z', 'V', 'OV', 'BV', 'F', 'ADV'];
const safeNum = (val: any): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (AFKORTINGEN.includes(val.toUpperCase())) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

const calcTotalUren = (werkbon: Werkbon) =>
  werkbon.uren.reduce(
    (sum, r) => sum + safeNum(r.maandag) + safeNum(r.dinsdag) + safeNum(r.woensdag) + safeNum(r.donderdag) + safeNum(r.vrijdag) + safeNum(r.zaterdag) + safeNum(r.zondag),
    0
  );

const getWeekMonday = (jaar: number, week: number): Date => {
  const jan1 = new Date(jaar, 0, 1);
  const dayOfWeek = jan1.getDay() || 7;
  const daysToFirstMonday = dayOfWeek <= 4 ? 1 - dayOfWeek : 8 - dayOfWeek;
  const firstMonday = new Date(jaar, 0, 1 + daysToFirstMonday);
  return new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
};

export default function WerkbonnenScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { werkbonnen, fetchWerkbonnen, deleteWerkbon, fetchWerkbon, isLoading } = useAppStore();
  const { setType, clearDraft, setKlant, setWerf, setUrenData, setKmAfstand, setOpmerkingen } = useWerkbonFormStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  // Type selection now handled by /werkbon page (no modal needed)
  const isAdmin = user?.rol === 'admin' || user?.rol === 'master_admin';
  // ISO week — must match werkbon.week_nummer in DB (same as nieuwe werkbon flow)
  const currentWeek = getCurrentWeekNumber();

  useEffect(() => {
    if (user?.id) fetchWerkbonnen({ userId: user.id, isAdmin });
  }, [fetchWerkbonnen, isAdmin, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWerkbonnen({ userId: user?.id, isAdmin });
    setRefreshing(false);
  };

  // Parse DD-MM-YYYY or ISO date strings safely
  const parseDatum = (d: string | undefined) => {
    if (!d) return null;
    const parts = d.split('-');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    return new Date(`${year}-${month}-${day}`);
  };

  // Unique week numbers from werkbonnen, sorted descending (normalize string/number from API)
  const weekNumbers = useMemo(() => {
    const raw = werkbonnen
      .map((w) => {
        const n = Number(w.week_nummer);
        return Number.isFinite(n) && n > 0 ? n : null;
      })
      .filter((n): n is number => n !== null);
    return Array.from(new Set(raw)).sort((a, b) => b - a);
  }, [werkbonnen]);

  const filtered = useMemo(() => {
    if (selectedWeek === null) return werkbonnen;
    return werkbonnen.filter((w) => Number(w.week_nummer) === selectedWeek);
  }, [werkbonnen, selectedWeek]);

  // Weekly stats
  const weekStats = useMemo(() => {
    const thisWeek = werkbonnen.filter((w) => Number(w.week_nummer) === currentWeek);
    const totalUren = thisWeek.reduce((sum, w) => sum + calcTotalUren(w), 0);
    return { count: thisWeek.length, uren: totalUren };
  }, [werkbonnen, currentWeek]);

  // Monthly stats
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const maandStats = useMemo(() => {
    const thisMonth = werkbonnen.filter(w => {
      const refDate = parseDatum(w.datum_maandag)
        ?? getWeekMonday(w.jaar || currentYear, w.week_nummer);
      return refDate.getMonth() === currentMonth && refDate.getFullYear() === currentYear;
    });
    const totalUren = thisMonth.reduce((sum, w) => sum + calcTotalUren(w), 0);
    return { count: thisMonth.length, uren: totalUren };
  }, [werkbonnen, currentMonth, currentYear]);

  const handleCopy = async (item: Werkbon) => {
    if (!user) return;
    try {
      const w = await fetchWerkbon(item.id);

      // Reset store en laad werkbon data erin
      clearDraft();
      setType('uren');

      setKlant(w.klant_id || null, w.klant_naam || '');
      setWerf(w.werf_id || null, w.werf_naam || '');

      if (w.opmerkingen) setOpmerkingen(w.opmerkingen);

      const mappedUrenRegels = (w.uren || []).map((r: any) => ({
        teamlidNaam: r.teamlid_naam || r.teamlidNaam || '',
        maandag: r.maandag ?? 0,
        dinsdag: r.dinsdag ?? 0,
        woensdag: r.woensdag ?? 0,
        donderdag: r.donderdag ?? 0,
        vrijdag: r.vrijdag ?? 0,
        zaterdag: r.zaterdag ?? 0,
        zondag: r.zondag ?? 0,
        afkortingMa: r.afkorting_ma || r.afkortingMa || '',
        afkortingDi: r.afkorting_di || r.afkortingDi || '',
        afkortingWo: r.afkorting_wo || r.afkortingWo || '',
        afkortingDo: r.afkorting_do || r.afkortingDo || '',
        afkortingVr: r.afkorting_vr || r.afkortingVr || '',
        afkortingZa: r.afkorting_za || r.afkortingZa || '',
        afkortingZo: r.afkorting_zo || r.afkortingZo || '',
      }));

      const kmData = w.km_afstand || { maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0 };

      setUrenData({
        weekNummer: w.week_nummer || getCurrentWeekNumber(),
        jaar: w.jaar || new Date().getFullYear(),
        urenRegels: mappedUrenRegels,
        kmAfstand: kmData,
        uitgevoerdeWerken: w.uitgevoerde_werken || '',
        extraMaterialen: w.extra_materialen || '',
      });

      setKmAfstand(kmData);

      router.push('/werkbon/form');
    } catch {
      showAlert('Fout', 'Werkbon kon niet worden gekopieerd');
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
          <Ionicons name="copy-outline" size={18} color="#D4A017" />
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

  // Navigate to type selection page
  const handleNewWerkbon = () => {
    clearDraft();
    router.push('/werkbon');
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
          onPress={handleNewWerkbon}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: '#3498db' }]}>
          <Text style={[styles.statValue, { color: '#3498db' }]}>{maandStats.uren}</Text>
          <Text style={styles.statLabel}>Deze maand gewerkte uren</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#28a745' }]}>
          <Text style={[styles.statValue, { color: '#28a745' }]}>{weekStats.uren}</Text>
          <Text style={styles.statLabel}>Uren deze week</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#D4A017' }]}>
          <Text style={[styles.statValue, { color: '#D4A017' }]}>{maandStats.count}</Text>
          <Text style={styles.statLabel}>Werkbonnen deze maand</Text>
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
            <Text
              style={[styles.weekChipText, selectedWeek === null && styles.weekChipTextActive]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              Alles
            </Text>
          </TouchableOpacity>
          {weekNumbers.map((w) => (
            <TouchableOpacity
              key={`week-${w}`}
              style={[styles.weekChip, selectedWeek === w && styles.weekChipActive]}
              onPress={() => setSelectedWeek(selectedWeek === w ? null : w)}
            >
              <Text
                style={[styles.weekChipText, selectedWeek === w && styles.weekChipTextActive]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                W{w}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isLoading && werkbonnen.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4A017" />
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
            onPress={() => router.push('/werkbon')}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4A017" />
          }
        />
      )}
      {/* Type selection moved to /werkbon page */}
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
  title: { fontSize: 26, fontWeight: 'bold', color: '#1B4332' },
  subtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  addButton: {
    backgroundColor: '#D4A017',
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  // (type modal styles removed — type selection now on /werkbon page)
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#E8E9ED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#1B4332' },
  statLabel: { fontSize: 10, color: '#6c757d', marginTop: 2 },
  filterScroll: { maxHeight: 48 },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    paddingBottom: 8,
    flexDirection: 'row',
    flexGrow: 0,
  },
  weekChip: {
    flexShrink: 0,
    minWidth: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D0D3D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekChipActive: {
    backgroundColor: '#D4A017',
    borderColor: '#D4A017',
  },
  weekChipText: { fontSize: 12, color: '#6c757d', fontWeight: '500' },
  weekChipTextActive: { color: '#fff', fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1B4332', marginTop: 16, textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: '#6c757d', marginTop: 8 },
  emptyButton: {
    backgroundColor: '#D4A017',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  werkbonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  weekBadge: {
    backgroundColor: '#F5F6FA',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  weekText: { color: '#1B4332', fontSize: 13, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  klantNaam: { fontSize: 16, fontWeight: '600', color: '#1B4332' },
  werfNaam: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  werkbonFooter: { flexDirection: 'row', marginTop: 10, gap: 14 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, color: '#6c757d' },
  copyBtn: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D4A01740',
  },
  deleteBtn: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dc354540',
  },
});
