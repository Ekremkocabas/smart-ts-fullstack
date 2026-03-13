import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAG_KORT: Record<string, string> = { maandag: 'Ma', dinsdag: 'Di', woensdag: 'Wo', donderdag: 'Do', vrijdag: 'Vr', zaterdag: 'Za', zondag: 'Zo' };
const PRIORITEIT_KLEUREN: Record<string, string> = { laag: '#28a745', normaal: '#3498db', hoog: '#F5A623', urgent: '#dc3545' };
const STATUS_KLEUREN: Record<string, string> = { gepland: '#6c757d', onderweg: '#3498db', bezig: '#F5A623', afgerond: '#28a745' };

interface PlanningItem {
  id: string;
  week_nummer: number;
  jaar: number;
  dag: string;
  datum: string;
  werknemer_ids: string[];
  werknemer_namen: string[];
  team_naam?: string;
  klant_naam: string;
  werf_naam: string;
  werf_adres?: string;
  omschrijving: string;
  materiaallijst: string[];
  geschatte_duur: string;
  prioriteit: string;
  status: string;
  bevestigd_door: string[];
  notities: string;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function PlanningTab() {
  const { user } = useAuth();
  const now = new Date();
  const [weekNummer, setWeekNummer] = useState(getISOWeek(now));
  const [jaar, setJaar] = useState(now.getFullYear());
  const [planning, setPlanning] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPlanning = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/planning/werknemer/${user.id}?week_nummer=${weekNummer}&jaar=${jaar}`);
      const data = await res.json();
      setPlanning(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user?.id, weekNummer, jaar]);

  useEffect(() => {
    setLoading(true);
    fetchPlanning();
  }, [fetchPlanning]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPlanning();
    setRefreshing(false);
  };

  const changeWeek = (dir: number) => {
    let newWeek = weekNummer + dir;
    let newYear = jaar;
    if (newWeek < 1) { newYear--; newWeek = 52; }
    if (newWeek > 52) { newYear++; newWeek = 1; }
    setWeekNummer(newWeek);
    setJaar(newYear);
  };

  const bevestigPlanning = async (itemId: string) => {
    if (!user?.id) return;
    try {
      await fetch(`${API_URL}/api/planning/${itemId}/bevestig?werknemer_id=${user.id}`, { method: 'POST' });
      fetchPlanning();
    } catch (e) { console.error(e); }
  };

  const openNavigation = (adres: string) => {
    const encoded = encodeURIComponent(adres);
    if (Platform.OS === 'ios') {
      Linking.openURL(`maps:?q=${encoded}`);
    } else if (Platform.OS === 'android') {
      Linking.openURL(`geo:0,0?q=${encoded}`);
    } else {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    }
  };

  const vandaagDag = DAGEN[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  // Group by day
  const planningByDay: Record<string, PlanningItem[]> = {};
  DAGEN.forEach(dag => { planningByDay[dag] = []; });
  planning.forEach(item => {
    if (planningByDay[item.dag]) planningByDay[item.dag].push(item);
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Planning</Text>
        <Text style={styles.subtitle}>Uw weekplanning</Text>
      </View>

      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.weekBtn} onPress={() => changeWeek(-1)}>
          <Ionicons name="chevron-back" size={20} color="#1A1A2E" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekCenter} onPress={() => { setWeekNummer(getISOWeek(new Date())); setJaar(new Date().getFullYear()); }}>
          <Text style={styles.weekTitle}>Week {weekNummer}</Text>
          <Text style={styles.weekYear}>{jaar}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekBtn} onPress={() => changeWeek(1)}>
          <Ionicons name="chevron-forward" size={20} color="#1A1A2E" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : planning.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />}
        >
          <Ionicons name="calendar-outline" size={64} color="#E8E9ED" />
          <Text style={styles.emptyTitle}>Geen taken deze week</Text>
          <Text style={styles.emptySubtext}>U heeft geen ingeplande taken voor week {weekNummer}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />}
        >
          {DAGEN.map(dag => {
            const items = planningByDay[dag];
            if (items.length === 0) return null;
            const isVandaag = dag === vandaagDag;
            return (
              <View key={dag} style={styles.dagSection}>
                <View style={[styles.dagHeader, isVandaag && styles.dagHeaderToday]}>
                  <Text style={[styles.dagNaam, isVandaag && styles.dagNaamToday]}>{DAG_KORT[dag]}</Text>
                  <Text style={[styles.dagFull, isVandaag && styles.dagFullToday]}>{dag}</Text>
                  {isVandaag && <View style={styles.todayBadge}><Text style={styles.todayText}>Vandaag</Text></View>}
                  <Text style={styles.dagCount}>{items.length} {items.length === 1 ? 'taak' : 'taken'}</Text>
                </View>
                {items.map(item => {
                  const isExpanded = expandedId === item.id;
                  const isBevestigd = user?.id ? item.bevestigd_door.includes(user.id) : false;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.taskCard}
                      activeOpacity={0.7}
                      onPress={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {/* Priority bar */}
                      <View style={[styles.priorityBar, { backgroundColor: PRIORITEIT_KLEUREN[item.prioriteit] || '#3498db' }]} />
                      <View style={styles.taskContent}>
                        {/* Top row */}
                        <View style={styles.taskTopRow}>
                          <View style={[styles.statusBadge, { backgroundColor: (STATUS_KLEUREN[item.status] || '#6c757d') + '20' }]}>
                            <View style={[styles.statusDot, { backgroundColor: STATUS_KLEUREN[item.status] || '#6c757d' }]} />
                            <Text style={[styles.statusText, { color: STATUS_KLEUREN[item.status] || '#6c757d' }]}>{item.status}</Text>
                          </View>
                          {item.geschatte_duur ? (
                            <View style={styles.duurBadge}>
                              <Ionicons name="time-outline" size={12} color="#6c757d" />
                              <Text style={styles.duurText}>{item.geschatte_duur}</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Client & Site */}
                        <Text style={styles.taskKlant}>{item.klant_naam}</Text>
                        <View style={styles.taskRow}>
                          <Ionicons name="location-outline" size={16} color="#6c757d" />
                          <Text style={styles.taskWerf}>{item.werf_naam}</Text>
                        </View>

                        {/* Address + Navigate */}
                        {item.werf_adres ? (
                          <TouchableOpacity style={styles.navigateBtn} onPress={() => openNavigation(item.werf_adres!)}>
                            <Ionicons name="navigate" size={16} color="#3498db" />
                            <Text style={styles.navigateText}>{item.werf_adres}</Text>
                            <Ionicons name="open-outline" size={14} color="#3498db" />
                          </TouchableOpacity>
                        ) : null}

                        {/* Workers */}
                        {item.werknemer_namen.length > 1 && (
                          <View style={styles.taskRow}>
                            <Ionicons name="people-outline" size={16} color="#3498db" />
                            <Text style={styles.taskWorkers}>{item.werknemer_namen.join(', ')}</Text>
                          </View>
                        )}

                        {/* Expanded content */}
                        {isExpanded && (
                          <View style={styles.expandedContent}>
                            {item.omschrijving ? (
                              <View style={styles.expandedSection}>
                                <Text style={styles.expandedLabel}>Omschrijving</Text>
                                <Text style={styles.expandedText}>{item.omschrijving}</Text>
                              </View>
                            ) : null}
                            {item.materiaallijst.length > 0 ? (
                              <View style={styles.expandedSection}>
                                <Text style={styles.expandedLabel}>Materiaallijst</Text>
                                {item.materiaallijst.map((m, i) => (
                                  <View key={i} style={styles.materialItem}>
                                    <View style={styles.materialDot} />
                                    <Text style={styles.expandedText}>{m}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                            {item.notities ? (
                              <View style={styles.expandedSection}>
                                <Text style={styles.expandedLabel}>Notities</Text>
                                <Text style={styles.expandedText}>{item.notities}</Text>
                              </View>
                            ) : null}
                          </View>
                        )}

                        {/* Confirm button */}
                        <View style={styles.taskFooter}>
                          {isBevestigd ? (
                            <View style={styles.confirmedBadge}>
                              <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                              <Text style={styles.confirmedText}>Bevestigd</Text>
                            </View>
                          ) : (
                            <TouchableOpacity style={styles.confirmBtn} onPress={() => bevestigPlanning(item.id)}>
                              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                              <Text style={styles.confirmBtnText}>Bevestigen</Text>
                            </TouchableOpacity>
                          )}
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6c757d" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },

  weekNav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  weekBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center',
  },
  weekCenter: { flex: 1, alignItems: 'center' },
  weekTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  weekYear: { fontSize: 12, color: '#6c757d' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 400 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },

  scrollView: { flex: 1 },

  dagSection: { marginTop: 12, paddingHorizontal: 16 },
  dagHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  dagHeaderToday: {},
  dagNaam: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', width: 30 },
  dagNaamToday: { color: '#F5A623' },
  dagFull: { fontSize: 14, color: '#6c757d', flex: 1 },
  dagFullToday: { color: '#F5A623' },
  todayBadge: { backgroundColor: '#F5A623', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  todayText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  dagCount: { fontSize: 12, color: '#999' },

  taskCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    marginBottom: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  priorityBar: { width: 4 },
  taskContent: { flex: 1, padding: 14, gap: 6 },
  taskTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  duurBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  duurText: { fontSize: 11, color: '#6c757d' },

  taskKlant: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskWerf: { fontSize: 14, color: '#6c757d' },
  taskWorkers: { fontSize: 13, color: '#3498db' },

  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#3498db10', padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#3498db30',
  },
  navigateText: { flex: 1, fontSize: 13, color: '#3498db' },

  expandedContent: { marginTop: 8, gap: 10 },
  expandedSection: { backgroundColor: '#F5F6FA', borderRadius: 8, padding: 12 },
  expandedLabel: { fontSize: 12, fontWeight: '600', color: '#6c757d', marginBottom: 4 },
  expandedText: { fontSize: 14, color: '#1A1A2E', lineHeight: 20 },
  materialItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  materialDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F5A623' },

  taskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 13, color: '#28a745', fontWeight: '600' },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5A623', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
  },
  confirmBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
