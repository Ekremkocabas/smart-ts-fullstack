import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAG_KORT = { maandag: 'Ma', dinsdag: 'Di', woensdag: 'Wo', donderdag: 'Do', vrijdag: 'Vr', zaterdag: 'Za', zondag: 'Zo' };
const PRIORITEIT_KLEUREN: Record<string, string> = { laag: '#28a745', normaal: '#3498db', hoog: '#F5A623', urgent: '#dc3545' };
const STATUS_KLEUREN: Record<string, string> = { gepland: '#6c757d', onderweg: '#3498db', bezig: '#F5A623', afgerond: '#28a745' };
const STATUS_OPTIES = ['gepland', 'onderweg', 'bezig', 'afgerond'];
const PRIORITEIT_OPTIES = ['laag', 'normaal', 'hoog', 'urgent'];

interface PlanningItem {
  id: string;
  week_nummer: number;
  jaar: number;
  dag: string;
  datum: string;
  werknemer_ids: string[];
  werknemer_namen: string[];
  team_id?: string;
  team_naam?: string;
  klant_id: string;
  klant_naam: string;
  werf_id: string;
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

interface Werknemer { id: string; naam: string; rol: string; actief: boolean; team_id?: string; }
interface Team { id: string; naam: string; }
interface Klant { id: string; naam: string; actief: boolean; }
interface Werf { id: string; naam: string; klant_id: string; adres?: string; actief: boolean; }

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeekDates(year: number, week: number): Record<string, string> {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const isoWeekStart = simple;
  if (dow <= 4) isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  const dates: Record<string, string> = {};
  DAGEN.forEach((dag, i) => {
    const d = new Date(isoWeekStart);
    d.setDate(d.getDate() + i);
    dates[dag] = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  });
  return dates;
}

export default function PlanningAdmin() {
  const { user } = useAuth();
  const now = new Date();
  const [weekNummer, setWeekNummer] = useState(getISOWeek(now));
  const [jaar, setJaar] = useState(now.getFullYear());
  const [planning, setPlanning] = useState<PlanningItem[]>([]);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [werven, setWerven] = useState<Werf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlanningItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [waarschuwingen, setWaarschuwingen] = useState<string[]>([]);

  const [form, setForm] = useState({
    dag: 'maandag',
    werknemer_ids: [] as string[],
    team_id: '',
    klant_id: '',
    werf_id: '',
    omschrijving: '',
    materiaallijst: '',
    geschatte_duur: '',
    prioriteit: 'normaal',
    notities: '',
  });

  const weekDates = getWeekDates(jaar, weekNummer);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [planRes, usersRes, teamsRes, klantenRes, wervenRes] = await Promise.all([
        fetch(`${API_URL}/api/planning?week_nummer=${weekNummer}&jaar=${jaar}`),
        fetch(`${API_URL}/api/auth/users`),
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/klanten`),
        fetch(`${API_URL}/api/werven`),
      ]);
      const [planData, usersData, teamsData, klantenData, wervenData] = await Promise.all([
        planRes.json(), usersRes.json(), teamsRes.json(), klantenRes.json(), wervenRes.json(),
      ]);
      setPlanning(Array.isArray(planData) ? planData : []);
      setWerknemers(Array.isArray(usersData) ? usersData.filter((u: any) => u.actief && u.rol !== 'beheerder' && u.rol !== 'admin') : []);
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      setKlanten(Array.isArray(klantenData) ? klantenData.filter((k: any) => k.actief) : []);
      setWerven(Array.isArray(wervenData) ? wervenData.filter((w: any) => w.actief) : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [weekNummer, jaar]);

  useEffect(() => {
    if (Platform.OS === 'web') fetchData();
  }, [fetchData]);

  const changeWeek = (dir: number) => {
    let newWeek = weekNummer + dir;
    let newYear = jaar;
    if (newWeek < 1) { newYear--; newWeek = 52; }
    if (newWeek > 52) { newYear++; newWeek = 1; }
    setWeekNummer(newWeek);
    setJaar(newYear);
  };

  const openCreateModal = (dag?: string) => {
    setForm({
      dag: dag || 'maandag', werknemer_ids: [], team_id: '', klant_id: '', werf_id: '',
      omschrijving: '', materiaallijst: '', geschatte_duur: '', prioriteit: 'normaal', notities: '',
    });
    setWaarschuwingen([]);
    setShowModal(true);
  };

  const openDetail = (item: PlanningItem) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const toggleWorker = (id: string) => {
    setForm(prev => ({
      ...prev,
      werknemer_ids: prev.werknemer_ids.includes(id)
        ? prev.werknemer_ids.filter(w => w !== id)
        : [...prev.werknemer_ids, id],
    }));
  };

  const savePlanning = async () => {
    if (!form.klant_id || !form.werf_id) {
      alert('Selecteer een klant en werf');
      return;
    }
    if (form.werknemer_ids.length === 0) {
      alert('Selecteer minimaal één werknemer');
      return;
    }
    setSaving(true);
    setWaarschuwingen([]);
    try {
      const body = {
        week_nummer: weekNummer,
        jaar: jaar,
        dag: form.dag,
        datum: weekDates[form.dag] || '',
        werknemer_ids: form.werknemer_ids,
        werknemer_namen: [],
        team_id: form.team_id || null,
        klant_id: form.klant_id,
        werf_id: form.werf_id,
        omschrijving: form.omschrijving,
        materiaallijst: form.materiaallijst.split(',').map(m => m.trim()).filter(Boolean),
        geschatte_duur: form.geschatte_duur,
        prioriteit: form.prioriteit,
        notities: form.notities,
      };
      const res = await fetch(`${API_URL}/api/planning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.waarschuwingen && result.waarschuwingen.length > 0) {
        setWaarschuwingen(result.waarschuwingen);
      }
      setShowModal(false);
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij opslaan'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (itemId: string, newStatus: string) => {
    try {
      await fetch(`${API_URL}/api/planning/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const deletePlanningItem = async (itemId: string) => {
    if (!confirm('Weet u zeker dat u dit item wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/planning/${itemId}`, { method: 'DELETE' });
      setShowDetailModal(false);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const filteredWerven = form.klant_id ? werven.filter(w => w.klant_id === form.klant_id) : werven;

  if (Platform.OS !== 'web') return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Planning</Text>
          <Text style={styles.subtitle}>Weekoverzicht en taaktoewijzing</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openCreateModal()}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Nieuwe taak</Text>
        </TouchableOpacity>
      </View>

      {/* Week Selector */}
      <View style={styles.weekSelector}>
        <TouchableOpacity style={styles.weekArrow} onPress={() => changeWeek(-1)}>
          <Ionicons name="chevron-back" size={22} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.weekInfo}>
          <Text style={styles.weekTitle}>Week {weekNummer}</Text>
          <Text style={styles.weekYear}>{jaar}</Text>
        </View>
        <TouchableOpacity style={styles.weekArrow} onPress={() => changeWeek(1)}>
          <Ionicons name="chevron-forward" size={22} color="#1A1A2E" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.todayBtn} onPress={() => { setWeekNummer(getISOWeek(new Date())); setJaar(new Date().getFullYear()); }}>
          <Ionicons name="today-outline" size={18} color="#F5A623" />
          <Text style={styles.todayBtnText}>Vandaag</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Totaal', value: planning.length, color: '#3498db', icon: 'calendar-outline' },
          { label: 'Gepland', value: planning.filter(p => p.status === 'gepland').length, color: '#6c757d', icon: 'time-outline' },
          { label: 'Bezig', value: planning.filter(p => p.status === 'bezig' || p.status === 'onderweg').length, color: '#F5A623', icon: 'construct-outline' },
          { label: 'Afgerond', value: planning.filter(p => p.status === 'afgerond').length, color: '#28a745', icon: 'checkmark-circle-outline' },
        ].map((stat, i) => (
          <View key={i} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}>
              <Ionicons name={stat.icon as any} size={20} color={stat.color} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        /* Week Grid */
        <View style={styles.weekGrid}>
          {DAGEN.map(dag => {
            const dagItems = planning.filter(p => p.dag === dag);
            const datum = weekDates[dag];
            const isWeekend = dag === 'zaterdag' || dag === 'zondag';
            return (
              <View key={dag} style={[styles.dagColumn, isWeekend && styles.dagColumnWeekend]}>
                {/* Day Header */}
                <View style={[styles.dagHeader, isWeekend && styles.dagHeaderWeekend]}>
                  <Text style={styles.dagNaam}>{(DAG_KORT as any)[dag]}</Text>
                  <Text style={styles.dagDatum}>{datum}</Text>
                  <TouchableOpacity style={styles.dagAddBtn} onPress={() => openCreateModal(dag)}>
                    <Ionicons name="add-circle" size={20} color="#F5A623" />
                  </TouchableOpacity>
                </View>

                {/* Day Items */}
                <View style={styles.dagContent}>
                  {dagItems.length === 0 ? (
                    <View style={styles.emptyDay}>
                      <Text style={styles.emptyDayText}>Geen taken</Text>
                    </View>
                  ) : dagItems.map(item => (
                    <TouchableOpacity key={item.id} style={styles.planCard} onPress={() => openDetail(item)} activeOpacity={0.7}>
                      {/* Priority strip */}
                      <View style={[styles.priorityStrip, { backgroundColor: PRIORITEIT_KLEUREN[item.prioriteit] || '#3498db' }]} />
                      <View style={styles.planCardContent}>
                        {/* Status */}
                        <View style={[styles.statusBadge, { backgroundColor: (STATUS_KLEUREN[item.status] || '#6c757d') + '20' }]}>
                          <View style={[styles.statusDot, { backgroundColor: STATUS_KLEUREN[item.status] || '#6c757d' }]} />
                          <Text style={[styles.statusText, { color: STATUS_KLEUREN[item.status] || '#6c757d' }]}>{item.status}</Text>
                        </View>
                        {/* Client & Site */}
                        <Text style={styles.planKlant} numberOfLines={1}>{item.klant_naam}</Text>
                        <View style={styles.planWerfRow}>
                          <Ionicons name="location-outline" size={12} color="#6c757d" />
                          <Text style={styles.planWerf} numberOfLines={1}>{item.werf_naam}</Text>
                        </View>
                        {/* Workers */}
                        <View style={styles.planWorkersRow}>
                          <Ionicons name="people-outline" size={12} color="#3498db" />
                          <Text style={styles.planWorkers} numberOfLines={1}>{item.werknemer_namen.join(', ') || 'Geen werknemers'}</Text>
                        </View>
                        {/* Duration */}
                        {item.geschatte_duur ? (
                          <View style={styles.planDuurRow}>
                            <Ionicons name="time-outline" size={12} color="#6c757d" />
                            <Text style={styles.planDuur}>{item.geschatte_duur}</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Warning Toast */}
      {waarschuwingen.length > 0 && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={20} color="#F5A623" />
          <View style={{ flex: 1 }}>
            {waarschuwingen.map((w, i) => (
              <Text key={i} style={styles.warningText}>{w}</Text>
            ))}
          </View>
          <TouchableOpacity onPress={() => setWaarschuwingen([])}>
            <Ionicons name="close" size={20} color="#F5A623" />
          </TouchableOpacity>
        </View>
      )}

      {/* ============ CREATE MODAL ============ */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nieuwe taak plannen</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 600 }}>
              {/* Dag */}
              <Text style={styles.label}>Dag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {DAGEN.map(dag => (
                    <TouchableOpacity key={dag} style={[styles.chip, form.dag === dag && styles.chipActive]} onPress={() => setForm({ ...form, dag })}>
                      <Text style={[styles.chipText, form.dag === dag && styles.chipTextActive]}>{(DAG_KORT as any)[dag]} {weekDates[dag]?.substring(0, 5)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Klant */}
              <Text style={styles.label}>Klant *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {klanten.map(k => (
                    <TouchableOpacity key={k.id} style={[styles.chip, form.klant_id === k.id && styles.chipActiveGreen]}
                      onPress={() => setForm({ ...form, klant_id: k.id, werf_id: '' })}>
                      <Text style={[styles.chipText, form.klant_id === k.id && styles.chipTextActive]}>{k.naam}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Werf */}
              <Text style={styles.label}>Werf *</Text>
              {filteredWerven.length === 0 ? (
                <Text style={styles.noItemsText}>{form.klant_id ? 'Geen werven voor deze klant' : 'Selecteer eerst een klant'}</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {filteredWerven.map(w => (
                      <TouchableOpacity key={w.id} style={[styles.chip, form.werf_id === w.id && styles.chipActiveBlue]}
                        onPress={() => setForm({ ...form, werf_id: w.id })}>
                        <Text style={[styles.chipText, form.werf_id === w.id && styles.chipTextActive]}>{w.naam}</Text>
                        {w.adres ? <Text style={styles.chipSub}>{w.adres}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}

              {/* Werknemers */}
              <Text style={styles.label}>Werknemers *</Text>
              <View style={styles.workerGrid}>
                {werknemers.map(w => {
                  const isSelected = form.werknemer_ids.includes(w.id);
                  return (
                    <TouchableOpacity key={w.id} style={[styles.workerChip, isSelected && styles.workerChipActive]}
                      onPress={() => toggleWorker(w.id)}>
                      <View style={[styles.workerAvatar, isSelected && { backgroundColor: '#F5A623' }]}>
                        <Text style={[styles.workerAvatarText, isSelected && { color: '#fff' }]}>{w.naam?.charAt(0)}</Text>
                      </View>
                      <Text style={[styles.workerName, isSelected && { color: '#F5A623', fontWeight: '600' }]} numberOfLines={1}>{w.naam}</Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color="#F5A623" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Omschrijving */}
              <Text style={styles.label}>Omschrijving</Text>
              <TextInput style={[styles.input, { minHeight: 80 }]} value={form.omschrijving} onChangeText={v => setForm({ ...form, omschrijving: v })}
                placeholder="Wat moet er gedaan worden?" placeholderTextColor="#999" multiline />

              {/* Materiaallijst */}
              <Text style={styles.label}>Materiaallijst</Text>
              <TextInput style={styles.input} value={form.materiaallijst} onChangeText={v => setForm({ ...form, materiaallijst: v })}
                placeholder="Materiaal 1, Materiaal 2, ..." placeholderTextColor="#999" />

              {/* Geschatte duur */}
              <Text style={styles.label}>Geschatte duur</Text>
              <TextInput style={styles.input} value={form.geschatte_duur} onChangeText={v => setForm({ ...form, geschatte_duur: v })}
                placeholder="bijv. 4 uur, hele dag" placeholderTextColor="#999" />

              {/* Prioriteit */}
              <Text style={styles.label}>Prioriteit</Text>
              <View style={styles.chipRow}>
                {PRIORITEIT_OPTIES.map(p => (
                  <TouchableOpacity key={p} style={[styles.chip, form.prioriteit === p && { backgroundColor: PRIORITEIT_KLEUREN[p], borderColor: PRIORITEIT_KLEUREN[p] }]}
                    onPress={() => setForm({ ...form, prioriteit: p })}>
                    <Text style={[styles.chipText, form.prioriteit === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notities */}
              <Text style={styles.label}>Notities</Text>
              <TextInput style={[styles.input, { minHeight: 60 }]} value={form.notities} onChangeText={v => setForm({ ...form, notities: v })}
                placeholder="Extra notities..." placeholderTextColor="#999" multiline />
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={savePlanning} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Inplannen</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============ DETAIL MODAL ============ */}
      <Modal visible={showDetailModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedItem && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Taak details</Text>
                  <TouchableOpacity onPress={() => setShowDetailModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Status Selector */}
                  <Text style={styles.label}>Status</Text>
                  <View style={styles.chipRow}>
                    {STATUS_OPTIES.map(s => (
                      <TouchableOpacity key={s}
                        style={[styles.chip, selectedItem.status === s && { backgroundColor: STATUS_KLEUREN[s], borderColor: STATUS_KLEUREN[s] }]}
                        onPress={() => { updateStatus(selectedItem.id, s); setSelectedItem({ ...selectedItem, status: s }); }}>
                        <Text style={[styles.chipText, selectedItem.status === s && styles.chipTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Priority */}
                  <View style={styles.detailRow}>
                    <Ionicons name="flag-outline" size={18} color={PRIORITEIT_KLEUREN[selectedItem.prioriteit]} />
                    <Text style={styles.detailLabel}>Prioriteit:</Text>
                    <View style={[styles.priorityBadge, { backgroundColor: (PRIORITEIT_KLEUREN[selectedItem.prioriteit] || '#3498db') + '20' }]}>
                      <Text style={[styles.priorityBadgeText, { color: PRIORITEIT_KLEUREN[selectedItem.prioriteit] }]}>{selectedItem.prioriteit}</Text>
                    </View>
                  </View>

                  {/* Day & Date */}
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={18} color="#3498db" />
                    <Text style={styles.detailLabel}>Dag:</Text>
                    <Text style={styles.detailValue}>{selectedItem.dag} ({selectedItem.datum})</Text>
                  </View>

                  {/* Client */}
                  <View style={styles.detailRow}>
                    <Ionicons name="briefcase-outline" size={18} color="#6c757d" />
                    <Text style={styles.detailLabel}>Klant:</Text>
                    <Text style={styles.detailValue}>{selectedItem.klant_naam}</Text>
                  </View>

                  {/* Site */}
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={18} color="#6c757d" />
                    <Text style={styles.detailLabel}>Werf:</Text>
                    <Text style={styles.detailValue}>{selectedItem.werf_naam}</Text>
                  </View>
                  {selectedItem.werf_adres ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="navigate-outline" size={18} color="#3498db" />
                      <Text style={[styles.detailValue, { color: '#3498db', flex: 1 }]}>{selectedItem.werf_adres}</Text>
                    </View>
                  ) : null}

                  {/* Workers */}
                  <Text style={[styles.label, { marginTop: 16 }]}>Werknemers</Text>
                  <View style={{ gap: 6 }}>
                    {selectedItem.werknemer_namen.map((naam, i) => {
                      const wId = selectedItem.werknemer_ids[i];
                      const bevestigd = selectedItem.bevestigd_door.includes(wId);
                      return (
                        <View key={i} style={styles.workerDetailRow}>
                          <View style={styles.workerAvatarSmall}><Text style={styles.workerAvatarTextSmall}>{naam?.charAt(0)}</Text></View>
                          <Text style={styles.workerDetailName}>{naam}</Text>
                          <View style={[styles.bevestigBadge, { backgroundColor: bevestigd ? '#28a74520' : '#F5A62320' }]}>
                            <Ionicons name={bevestigd ? 'checkmark-circle' : 'time'} size={14} color={bevestigd ? '#28a745' : '#F5A623'} />
                            <Text style={{ fontSize: 11, color: bevestigd ? '#28a745' : '#F5A623', fontWeight: '600' }}>{bevestigd ? 'Bevestigd' : 'Wacht'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* Description */}
                  {selectedItem.omschrijving ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Omschrijving</Text>
                      <Text style={styles.detailSectionText}>{selectedItem.omschrijving}</Text>
                    </View>
                  ) : null}

                  {/* Materials */}
                  {selectedItem.materiaallijst.length > 0 ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Materiaallijst</Text>
                      {selectedItem.materiaallijst.map((m, i) => (
                        <View key={i} style={styles.materialRow}>
                          <View style={styles.materialDot} />
                          <Text style={styles.materialText}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Duration */}
                  {selectedItem.geschatte_duur ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={18} color="#6c757d" />
                      <Text style={styles.detailLabel}>Geschatte duur:</Text>
                      <Text style={styles.detailValue}>{selectedItem.geschatte_duur}</Text>
                    </View>
                  ) : null}

                  {/* Notes */}
                  {selectedItem.notities ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Notities</Text>
                      <Text style={styles.detailSectionText}>{selectedItem.notities}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Actions */}
                <View style={styles.detailActions}>
                  <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: '#dc354515' }]} onPress={() => deletePlanningItem(selectedItem.id)}>
                    <Ionicons name="trash-outline" size={18} color="#dc3545" />
                    <Text style={{ color: '#dc3545', fontWeight: '600', fontSize: 14 }}>Verwijderen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: '#F5A623', flex: 1 }]} onPress={() => setShowDetailModal(false)}>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Sluiten</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5A623', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  weekSelector: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#E8E9ED' },
  weekArrow: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center' },
  weekInfo: { flex: 1, alignItems: 'center' },
  weekTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  weekYear: { fontSize: 13, color: '#6c757d' },
  todayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F5A62310', borderWidth: 1, borderColor: '#F5A62330' },
  todayBtnText: { fontSize: 13, fontWeight: '600', color: '#F5A623' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  statLabel: { fontSize: 11, color: '#6c757d', marginTop: 2 },

  weekGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dagColumn: { flex: 1, minWidth: 160, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden' },
  dagColumnWeekend: { backgroundColor: '#FAFAFA' },
  dagHeader: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#E8E9ED', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6FA' },
  dagHeaderWeekend: { backgroundColor: '#F0F0F2' },
  dagNaam: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  dagDatum: { fontSize: 11, color: '#6c757d', flex: 1 },
  dagAddBtn: { padding: 2 },
  dagContent: { padding: 8, gap: 8, minHeight: 120 },
  emptyDay: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  emptyDayText: { fontSize: 12, color: '#ccc' },

  planCard: { borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden', flexDirection: 'row' },
  priorityStrip: { width: 4 },
  planCardContent: { flex: 1, padding: 10, gap: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },
  planKlant: { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  planWerfRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planWerf: { fontSize: 11, color: '#6c757d', flex: 1 },
  planWorkersRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  planWorkers: { fontSize: 11, color: '#3498db', flex: 1 },
  planDuurRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planDuur: { fontSize: 10, color: '#6c757d' },

  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF3CD', borderRadius: 10, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#F5A62330' },
  warningText: { fontSize: 13, color: '#856404' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 8, marginTop: 16, fontWeight: '500' },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  noItemsText: { fontSize: 13, color: '#999', fontStyle: 'italic', padding: 10 },

  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F6FA', borderWidth: 1.5, borderColor: '#E8E9ED' },
  chipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  chipActiveGreen: { backgroundColor: '#27ae60', borderColor: '#27ae60' },
  chipActiveBlue: { backgroundColor: '#3498db', borderColor: '#3498db' },
  chipText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  chipSub: { fontSize: 10, color: '#ffffff90', marginTop: 2 },

  workerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workerChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6FA', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E8E9ED', minWidth: '30%' },
  workerChipActive: { borderColor: '#F5A623', backgroundColor: '#F5A62310' },
  workerAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E8E9ED', alignItems: 'center', justifyContent: 'center' },
  workerAvatarText: { fontSize: 12, fontWeight: '600', color: '#6c757d' },
  workerName: { flex: 1, fontSize: 13, color: '#1A1A2E' },

  saveBtn: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F6FA' },
  detailLabel: { fontSize: 14, color: '#6c757d', width: 100 },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  priorityBadgeText: { fontSize: 12, fontWeight: '600' },

  workerDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F5F6FA', borderRadius: 8 },
  workerAvatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5A62320', alignItems: 'center', justifyContent: 'center' },
  workerAvatarTextSmall: { fontSize: 13, fontWeight: '600', color: '#F5A623' },
  workerDetailName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  bevestigBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },

  detailSection: { marginTop: 16, backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14 },
  detailSectionTitle: { fontSize: 13, fontWeight: '600', color: '#6c757d', marginBottom: 6 },
  detailSectionText: { fontSize: 14, color: '#1A1A2E', lineHeight: 20 },
  materialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  materialDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5A623' },
  materialText: { fontSize: 13, color: '#1A1A2E' },

  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10 },
});
