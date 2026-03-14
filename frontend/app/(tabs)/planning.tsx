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
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAG_KORT: Record<string, string> = {
  maandag: 'Ma', dinsdag: 'Di', woensdag: 'Wo', donderdag: 'Do',
  vrijdag: 'Vr', zaterdag: 'Za', zondag: 'Zo',
};
const PRIORITEIT_KLEUREN: Record<string, string> = {
  laag: '#28a745', normaal: '#3498db', hoog: '#F5A623', urgent: '#dc3545',
};
const STATUS_KLEUREN: Record<string, string> = {
  gepland: '#6c757d', onderweg: '#3498db', bezig: '#F5A623', afgerond: '#28a745',
};

interface PlanningItem {
  id: string;
  week_nummer: number;
  jaar: number;
  dag: string;
  datum: string;
  start_uur?: string;
  eind_uur?: string;
  voorziene_uur?: string;
  werknemer_ids: string[];
  werknemer_namen: string[];
  team_naam?: string;
  klant_naam: string;
  werf_naam: string;
  werf_adres?: string;
  omschrijving: string;
  materiaallijst: string[];
  nodige_materiaal?: string;
  opmerking_aandachtspunt?: string;
  geschatte_duur: string;
  prioriteit: string;
  belangrijk?: boolean;
  status: string;
  bevestigd_door: string[];
  bevestigingen?: { worker_id: string; worker_naam: string; timestamp: string }[];
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
  const [selectedItem, setSelectedItem] = useState<PlanningItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [bevestigingLoading, setBevestigingLoading] = useState<string | null>(null);

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

  const bevestigPlanning = async (item: PlanningItem) => {
    if (!user?.id) return;
    setBevestigingLoading(item.id);
    try {
      await fetch(
        `${API_URL}/api/planning/${item.id}/bevestig?werknemer_id=${user.id}&werknemer_naam=${encodeURIComponent(user.naam || user.id)}`,
        { method: 'POST' }
      );
      await fetchPlanning();
      if (selectedItem?.id === item.id) {
        const updated = planning.find(p => p.id === item.id);
        if (updated) setSelectedItem({ ...updated, bevestigd_door: [...(updated.bevestigd_door || []), user.id] });
      }
    } catch (e) { console.error(e); }
    finally { setBevestigingLoading(null); }
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

  const openDetail = (item: PlanningItem) => {
    setSelectedItem(item);
    setDetailVisible(true);
  };

  const vandaagDag = DAGEN[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  // Group by day
  const planningByDay: Record<string, PlanningItem[]> = {};
  DAGEN.forEach(dag => { planningByDay[dag] = []; });
  planning.forEach(item => {
    if (planningByDay[item.dag]) planningByDay[item.dag].push(item);
  });

  // Count total + important
  const totalTaken = planning.length;
  const belangrijkeTaken = planning.filter(p => p.belangrijk).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Planning</Text>
          <Text style={styles.subtitle}>Week {weekNummer} • {totalTaken} taken{belangrijkeTaken > 0 ? ` • ${belangrijkeTaken} belangrijk` : ''}</Text>
        </View>
      </View>

      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.weekBtn} onPress={() => changeWeek(-1)}>
          <Ionicons name="chevron-back" size={20} color="#1A1A2E" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekCenter} onPress={() => { setWeekNummer(getISOWeek(new Date())); setJaar(new Date().getFullYear()); }}>
          <Text style={styles.weekTitle}>Week {weekNummer}</Text>
          <Text style={styles.weekYear}>{jaar} • Tik om terug naar vandaag</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekBtn} onPress={() => changeWeek(1)}>
          <Ionicons name="chevron-forward" size={20} color="#1A1A2E" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.loadingText}>Planning laden...</Text>
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
                {/* Day Header */}
                <View style={[styles.dagHeader, isVandaag && styles.dagHeaderToday]}>
                  <View style={[styles.dagIconBadge, isVandaag && styles.dagIconBadgeToday]}>
                    <Text style={[styles.dagIconText, isVandaag && { color: '#fff' }]}>{DAG_KORT[dag]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dagNaam, isVandaag && styles.dagNaamToday]}>{dag.charAt(0).toUpperCase() + dag.slice(1)}</Text>
                    {isVandaag && <Text style={styles.todayLabel}>Vandaag</Text>}
                  </View>
                  <View style={styles.dagCountBadge}>
                    <Text style={styles.dagCount}>{items.length}</Text>
                  </View>
                </View>

                {/* Task Cards */}
                {items.map(item => {
                  const isBevestigd = user?.id ? item.bevestigd_door.includes(user.id) : false;
                  const materiaalItems = item.nodige_materiaal
                    ? item.nodige_materiaal.split('\n').filter(Boolean)
                    : (item.materiaallijst || []);
                  const heeftInstructies = !!(item.omschrijving || materiaalItems.length > 0 || item.opmerking_aandachtspunt);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.taskCard, item.belangrijk && styles.taskCardBelangrijk]}
                      activeOpacity={0.85}
                      onPress={() => openDetail(item)}
                    >
                      {/* Left priority bar */}
                      <View style={[styles.priorityBar, { backgroundColor: PRIORITEIT_KLEUREN[item.prioriteit] || '#3498db' }]} />

                      <View style={styles.taskContent}>
                        {/* BELANGRIJK banner — very prominent */}
                        {item.belangrijk && (
                          <View style={styles.belangrijkBanner}>
                            <Ionicons name="warning" size={14} color="#fff" />
                            <Text style={styles.belangrijkBannerText}>BELANGRIJK — Extra aandacht vereist</Text>
                          </View>
                        )}

                        {/* Header row: status + time */}
                        <View style={styles.taskTopRow}>
                          <View style={[styles.statusBadge, { backgroundColor: (STATUS_KLEUREN[item.status] || '#6c757d') + '20' }]}>
                            <View style={[styles.statusDot, { backgroundColor: STATUS_KLEUREN[item.status] || '#6c757d' }]} />
                            <Text style={[styles.statusText, { color: STATUS_KLEUREN[item.status] || '#6c757d' }]}>{item.status}</Text>
                          </View>
                          {(item.start_uur || item.voorziene_uur || item.geschatte_duur) && (
                            <View style={styles.timeBadge}>
                              <Ionicons name="time-outline" size={12} color="#3498db" />
                              <Text style={styles.timeText}>
                                {item.start_uur && item.eind_uur
                                  ? `${item.start_uur} – ${item.eind_uur}`
                                  : (item.voorziene_uur || item.geschatte_duur)}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Client */}
                        <Text style={styles.taskKlant}>{item.klant_naam}</Text>

                        {/* Werf + navigate */}
                        <View style={styles.taskRow}>
                          <Ionicons name="location-outline" size={16} color="#6c757d" />
                          <Text style={styles.taskWerf}>{item.werf_naam}</Text>
                        </View>
                        {item.werf_adres ? (
                          <TouchableOpacity style={styles.navigateBtn} onPress={(e) => { openNavigation(item.werf_adres!); }}>
                            <Ionicons name="navigate" size={15} color="#3498db" />
                            <Text style={styles.navigateText} numberOfLines={1}>{item.werf_adres}</Text>
                            <Ionicons name="open-outline" size={12} color="#3498db" />
                          </TouchableOpacity>
                        ) : null}

                        {/* Workers */}
                        {item.werknemer_namen.length > 0 && (
                          <View style={styles.taskRow}>
                            <Ionicons name="people-outline" size={16} color="#3498db" />
                            <Text style={styles.taskWorkers} numberOfLines={1}>{item.werknemer_namen.join(', ')}</Text>
                          </View>
                        )}

                        {/* Uit te voeren werk — ALWAYS visible when set */}
                        {item.omschrijving ? (
                          <View style={styles.werkOmschrijvingBox}>
                            <View style={styles.werkOmschrijvingHeader}>
                              <Ionicons name="clipboard-outline" size={14} color="#1A1A2E" />
                              <Text style={styles.werkOmschrijvingTitle}>Uit te voeren werk</Text>
                            </View>
                            <Text style={styles.werkOmschrijvingText}>{item.omschrijving}</Text>
                          </View>
                        ) : null}

                        {/* Aandachtspunt — highlighted if set */}
                        {item.opmerking_aandachtspunt ? (
                          <View style={styles.aandachtBox}>
                            <View style={styles.aandachtHeader}>
                              <Ionicons name="warning-outline" size={14} color="#856404" />
                              <Text style={styles.aandachtTitle}>Aandachtspunt</Text>
                            </View>
                            <Text style={styles.aandachtText}>{item.opmerking_aandachtspunt}</Text>
                          </View>
                        ) : null}

                        {/* Materiaal preview (up to 3 items) */}
                        {materiaalItems.length > 0 && (
                          <View style={styles.materiaalPreview}>
                            <Ionicons name="cube-outline" size={13} color="#6c757d" />
                            <Text style={styles.materiaalPreviewText} numberOfLines={1}>
                              {materiaalItems.slice(0, 3).join(' • ')}{materiaalItems.length > 3 ? ` +${materiaalItems.length - 3}` : ''}
                            </Text>
                          </View>
                        )}

                        {/* Footer: confirm + detail button */}
                        <View style={styles.taskFooter}>
                          {isBevestigd ? (
                            <View style={styles.confirmedBadge}>
                              <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                              <Text style={styles.confirmedText}>Bevestigd</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.confirmBtn}
                              onPress={() => bevestigPlanning(item)}
                              disabled={bevestigingLoading === item.id}
                            >
                              {bevestigingLoading === item.id
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                              }
                              <Text style={styles.confirmBtnText}>Bevestigen</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity style={styles.detailBtn} onPress={() => openDetail(item)}>
                            <Text style={styles.detailBtnText}>Details</Text>
                            <Ionicons name="chevron-forward" size={14} color="#3498db" />
                          </TouchableOpacity>
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

      {/* ============ DETAIL MODAL ============ */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailVisible(false)}>
        {selectedItem && (
          <SafeAreaView style={styles.detailContainer} edges={['top', 'bottom']}>
            {/* Modal header */}
            <View style={styles.detailHeader}>
              <TouchableOpacity style={styles.detailCloseBtn} onPress={() => setDetailVisible(false)}>
                <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle} numberOfLines={1}>{selectedItem.klant_naam}</Text>
                <Text style={styles.detailSubtitle}>{selectedItem.dag} • Week {selectedItem.week_nummer}</Text>
              </View>
              {selectedItem.belangrijk && (
                <View style={styles.detailBelangrijkBadge}>
                  <Ionicons name="warning" size={14} color="#fff" />
                  <Text style={styles.detailBelangrijkText}>BELANGRIJK</Text>
                </View>
              )}
            </View>

            <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {/* Belangrijk banner */}
              {selectedItem.belangrijk && (
                <View style={styles.detailBelangrijkBanner}>
                  <Ionicons name="warning" size={20} color="#dc3545" />
                  <Text style={styles.detailBelangrijkBannerText}>
                    Dit is een BELANGRIJKE taak — extra aandacht en voorzichtigheid vereist
                  </Text>
                </View>
              )}

              {/* === WANNEER === */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>📅 Wanneer</Text>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={18} color="#3498db" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>{selectedItem.dag.charAt(0).toUpperCase() + selectedItem.dag.slice(1)}</Text>
                    {selectedItem.datum ? <Text style={styles.detailSubValue}>{selectedItem.datum}</Text> : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_KLEUREN[selectedItem.status] || '#6c757d') + '20' }]}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_KLEUREN[selectedItem.status] || '#6c757d' }]} />
                    <Text style={[styles.statusText, { color: STATUS_KLEUREN[selectedItem.status] || '#6c757d' }]}>{selectedItem.status}</Text>
                  </View>
                </View>
                {(selectedItem.start_uur || selectedItem.eind_uur) && (
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color="#3498db" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailLabel}>
                        {selectedItem.start_uur || '?'} → {selectedItem.eind_uur || '?'}
                      </Text>
                      {selectedItem.voorziene_uur && (
                        <Text style={styles.detailSubValue}>Voorziene duur: {selectedItem.voorziene_uur}</Text>
                      )}
                    </View>
                  </View>
                )}
                {!selectedItem.start_uur && (selectedItem.voorziene_uur || selectedItem.geschatte_duur) && (
                  <View style={styles.detailRow}>
                    <Ionicons name="hourglass-outline" size={18} color="#6c757d" />
                    <Text style={styles.detailLabel}>{selectedItem.voorziene_uur || selectedItem.geschatte_duur}</Text>
                  </View>
                )}
              </View>

              {/* === LOCATIE === */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>📍 Locatie</Text>
                <View style={styles.detailRow}>
                  <Ionicons name="briefcase-outline" size={18} color="#6c757d" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>{selectedItem.klant_naam}</Text>
                    <Text style={styles.detailSubValue}>Klant / Bedrijf</Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={18} color="#6c757d" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>{selectedItem.werf_naam}</Text>
                    <Text style={styles.detailSubValue}>Werf</Text>
                  </View>
                </View>
                {selectedItem.werf_adres ? (
                  <TouchableOpacity style={styles.navigateBtnLarge} onPress={() => openNavigation(selectedItem.werf_adres!)}>
                    <Ionicons name="navigate" size={18} color="#fff" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.navigateBtnText}>{selectedItem.werf_adres}</Text>
                      <Text style={styles.navigateBtnSub}>Tik om te navigeren</Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* === TEAM === */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>👷 Team</Text>
                {selectedItem.werknemer_namen.map((naam, i) => (
                  <View key={i} style={styles.workerRow}>
                    <View style={styles.workerAvatar}>
                      <Text style={styles.workerAvatarText}>{naam?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.workerName}>{naam}</Text>
                    {user?.id === selectedItem.werknemer_ids[i] && (
                      <View style={styles.jijBadge}><Text style={styles.jijBadgeText}>JIJ</Text></View>
                    )}
                  </View>
                ))}
              </View>

              {/* === UIT TE VOEREN WERK === */}
              {selectedItem.omschrijving ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>📋 Uit te voeren werk</Text>
                  <View style={styles.werkBox}>
                    <Text style={styles.werkBoxText}>{selectedItem.omschrijving}</Text>
                  </View>
                </View>
              ) : null}

              {/* === NODIGE MATERIAAL === */}
              {(selectedItem.nodige_materiaal || (selectedItem.materiaallijst?.length > 0)) ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>📦 Nodige materiaal</Text>
                  <View style={styles.materiaalBox}>
                    {(selectedItem.nodige_materiaal
                      ? selectedItem.nodige_materiaal.split('\n').filter(Boolean)
                      : selectedItem.materiaallijst
                    ).map((m, i) => (
                      <View key={i} style={styles.materiaalItem}>
                        <View style={styles.materiaalDot} />
                        <Text style={styles.materiaalText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* === OPMERKING / AANDACHTSPUNT === */}
              {selectedItem.opmerking_aandachtspunt ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>⚠️ Opmerking / Aandachtspunt</Text>
                  <View style={styles.aandachtBoxLarge}>
                    <Text style={styles.aandachtBoxText}>{selectedItem.opmerking_aandachtspunt}</Text>
                  </View>
                </View>
              ) : null}

              {/* Confirm button */}
              <View style={styles.detailConfirmSection}>
                {user?.id && selectedItem.bevestigd_door.includes(user.id) ? (
                  <View style={styles.detailConfirmedRow}>
                    <Ionicons name="checkmark-circle" size={22} color="#28a745" />
                    <Text style={styles.detailConfirmedText}>U heeft deze taak bevestigd</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.detailConfirmBtn}
                    onPress={() => bevestigPlanning(selectedItem)}
                    disabled={bevestigingLoading === selectedItem.id}
                  >
                    {bevestigingLoading === selectedItem.id
                      ? <ActivityIndicator color="#fff" />
                      : <>
                        <Ionicons name="checkmark-circle" size={22} color="#fff" />
                        <Text style={styles.detailConfirmBtnText}>Taak bevestigen</Text>
                      </>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row', alignItems: 'center',
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
  weekYear: { fontSize: 11, color: '#6c757d', marginTop: 2 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6c757d' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 400 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },

  scrollView: { flex: 1 },

  dagSection: { marginTop: 12, paddingHorizontal: 16 },
  dagHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4, marginBottom: 4,
  },
  dagHeaderToday: {},
  dagIconBadge: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  dagIconBadgeToday: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  dagIconText: { fontSize: 13, fontWeight: '700', color: '#6c757d' },
  dagNaam: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  dagNaamToday: { color: '#F5A623' },
  todayLabel: { fontSize: 10, color: '#F5A623', fontWeight: '600', marginTop: 2 },
  dagCountBadge: {
    backgroundColor: '#F5A62320', width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  dagCount: { fontSize: 12, fontWeight: '700', color: '#F5A623' },

  // Task Card
  taskCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14,
    marginBottom: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E8E9ED',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  taskCardBelangrijk: { borderColor: '#dc3545', borderWidth: 1.5 },
  priorityBar: { width: 5 },
  taskContent: { flex: 1, padding: 14, gap: 7 },
  taskTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3498db10', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  timeText: { fontSize: 11, fontWeight: '600', color: '#3498db' },
  taskKlant: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskWerf: { fontSize: 14, color: '#6c757d', flex: 1 },
  taskWorkers: { fontSize: 13, color: '#3498db', flex: 1 },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#3498db10', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#3498db30',
  },
  navigateText: { flex: 1, fontSize: 12, color: '#3498db' },

  // Werk omschrijving on card (always visible)
  werkOmschrijvingBox: {
    backgroundColor: '#F0F7FF', borderRadius: 10, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#3498db',
  },
  werkOmschrijvingHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  werkOmschrijvingTitle: { fontSize: 12, fontWeight: '700', color: '#1A1A2E' },
  werkOmschrijvingText: { fontSize: 13, color: '#1A1A2E', lineHeight: 18 },

  // Aandachtspunt on card
  aandachtBox: {
    backgroundColor: '#FFF9ED', borderRadius: 10, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#F5A623',
  },
  aandachtHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  aandachtTitle: { fontSize: 12, fontWeight: '700', color: '#856404' },
  aandachtText: { fontSize: 13, color: '#856404', lineHeight: 18 },

  // Materiaal preview
  materiaalPreview: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  materiaalPreviewText: { fontSize: 12, color: '#6c757d', flex: 1 },

  // Belangrijk banner on card
  belangrijkBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#dc3545', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  belangrijkBannerText: { fontSize: 12, fontWeight: '700', color: '#fff', flex: 1 },

  taskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5F6FA' },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 13, color: '#28a745', fontWeight: '600' },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5A623', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  confirmBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailBtnText: { fontSize: 13, color: '#3498db', fontWeight: '500' },

  // ============ DETAIL MODAL ============
  detailContainer: { flex: 1, backgroundColor: '#F5F6FA' },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  detailCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center',
  },
  detailTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  detailSubtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  detailBelangrijkBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#dc3545', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
  },
  detailBelangrijkText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  detailScroll: { flex: 1 },

  detailBelangrijkBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FDECEA', margin: 16, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#dc354530',
  },
  detailBelangrijkBannerText: { fontSize: 14, fontWeight: '600', color: '#dc3545', flex: 1, lineHeight: 20 },

  detailSection: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, padding: 16, gap: 10,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  detailSectionTitle: { fontSize: 14, fontWeight: '700', color: '#6c757d', marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  detailSubValue: { fontSize: 12, color: '#6c757d', marginTop: 2 },

  navigateBtnLarge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#3498db', borderRadius: 12, padding: 14, marginTop: 4,
  },
  navigateBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', flex: 1 },
  navigateBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  workerAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#F5A62320', alignItems: 'center', justifyContent: 'center',
  },
  workerAvatarText: { fontSize: 14, fontWeight: '700', color: '#F5A623' },
  workerName: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', flex: 1 },
  jijBadge: { backgroundColor: '#F5A623', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  jijBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  werkBox: { backgroundColor: '#F0F7FF', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#3498db' },
  werkBoxText: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },

  materiaalBox: { gap: 6 },
  materiaalItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  materiaalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F5A623' },
  materiaalText: { fontSize: 14, color: '#1A1A2E', flex: 1 },

  aandachtBoxLarge: { backgroundColor: '#FFF9ED', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#F5A623' },
  aandachtBoxText: { fontSize: 15, color: '#856404', lineHeight: 22 },

  detailConfirmSection: { margin: 16, marginTop: 20 },
  detailConfirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#28a74510', padding: 16, borderRadius: 12 },
  detailConfirmedText: { fontSize: 15, fontWeight: '600', color: '#28a745' },
  detailConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#F5A623', padding: 18, borderRadius: 14,
  },
  detailConfirmBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
