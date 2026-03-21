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
import { useAuth, apiClient } from '../../context/AuthContext';
import Constants from 'expo-constants';

// Determine API URL - ALWAYS use window.location.origin for web production
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    // Production - use current origin, NO env variables
    return window.location.origin;
  }
  // Mobile only
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

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
  start_uur?: string;
  eind_uur?: string;
  voorziene_uur?: string;
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPeriode, setExportPeriode] = useState('week');
  const [exportFormaat, setExportFormaat] = useState('csv');
  const [isEditing, setIsEditing] = useState(false);

  const emptyForm = {
    dag: 'maandag',
    werknemer_ids: [] as string[],
    team_id: '',
    klant_id: '',
    werf_id: '',
    start_uur: '',
    eind_uur: '',
    voorziene_uur: '',
    omschrijving: '',
    nodige_materiaal: '',
    opmerking_aandachtspunt: '',
    geschatte_duur: '',
    prioriteit: 'normaal',
    belangrijk: false,
    notities: '',
  };

  const [form, setForm] = useState(emptyForm);

  const weekDates = getWeekDates(jaar, weekNummer);

  // Auto-calculate voorziene_uur from start/eind
  const calcVoorzeineUur = (start: string, eind: string): string => {
    if (!start || !eind) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = eind.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return '';
    const diffMin = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMin <= 0) return '';
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m > 0 ? `${h}u${m < 10 ? '0' : ''}${m}` : `${h} uur`;
  };

  const handleStartUur = (v: string) => {
    const calc = calcVoorzeineUur(v, form.eind_uur);
    setForm(prev => ({ ...prev, start_uur: v, voorziene_uur: calc || prev.voorziene_uur }));
  };

  const handleEindUur = (v: string) => {
    const calc = calcVoorzeineUur(form.start_uur, v);
    setForm(prev => ({ ...prev, eind_uur: v, voorziene_uur: calc || prev.voorziene_uur }));
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [planRes, usersRes, teamsRes, klantenRes, wervenRes] = await Promise.all([
        apiClient.get(`/api/planning?week_nummer=${weekNummer}&jaar=${jaar}`),
        apiClient.get('/api/auth/users'),
        apiClient.get('/api/teams'),
        apiClient.get('/api/klanten'),
        apiClient.get('/api/werven'),
      ]);
      setPlanning(Array.isArray(planRes.data) ? planRes.data : []);
      setWerknemers(Array.isArray(usersRes.data) ? usersRes.data.filter((u: any) => u.actief && u.rol !== 'beheerder' && u.rol !== 'admin') : []);
      setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
      setKlanten(Array.isArray(klantenRes.data) ? klantenRes.data.filter((k: any) => k.actief) : []);
      setWerven(Array.isArray(wervenRes.data) ? wervenRes.data.filter((w: any) => w.actief) : []);
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
    setForm({ ...emptyForm, dag: dag || 'maandag' });
    setWaarschuwingen([]);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (item: PlanningItem) => {
    setForm({
      dag: item.dag,
      werknemer_ids: item.werknemer_ids || [],
      team_id: item.team_id || '',
      klant_id: item.klant_id,
      werf_id: item.werf_id,
      start_uur: item.start_uur || '',
      eind_uur: item.eind_uur || '',
      voorziene_uur: item.voorziene_uur || item.geschatte_duur || '',
      omschrijving: item.omschrijving || '',
      nodige_materiaal: item.nodige_materiaal || item.materiaallijst?.join('\n') || '',
      opmerking_aandachtspunt: item.opmerking_aandachtspunt || '',
      geschatte_duur: item.geschatte_duur || '',
      prioriteit: item.prioriteit || 'normaal',
      belangrijk: item.belangrijk || false,
      notities: item.notities || '',
    });
    setIsEditing(true);
    setShowDetailModal(false);
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
      const materiaalItems = form.nodige_materiaal.split('\n').map(m => m.trim()).filter(Boolean);
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
        start_uur: form.start_uur,
        eind_uur: form.eind_uur,
        voorziene_uur: form.voorziene_uur || calcVoorzeineUur(form.start_uur, form.eind_uur),
        omschrijving: form.omschrijving,
        materiaallijst: materiaalItems,
        nodige_materiaal: form.nodige_materiaal,
        opmerking_aandachtspunt: form.opmerking_aandachtspunt,
        geschatte_duur: form.voorziene_uur || calcVoorzeineUur(form.start_uur, form.eind_uur) || form.geschatte_duur,
        prioriteit: form.prioriteit,
        belangrijk: form.belangrijk,
        notities: form.notities,
      };

      if (isEditing && selectedItem) {
        await fetch(`${API_URL}/api/planning/${selectedItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        const res = await fetch(`${API_URL}/api/planning`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (result.waarschuwingen?.length > 0) {
          setWaarschuwingen(result.waarschuwingen);
        }
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
      if (selectedItem?.id === itemId) setSelectedItem(prev => prev ? { ...prev, status: newStatus } : null);
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

  const werknemerGroups = {
    werknemers: werknemers.filter(w => w.rol !== 'onderaannemer'),
    onderaannemers: werknemers.filter(w => w.rol === 'onderaannemer'),
  };

  // Export function
  const exportPlanning = async () => {
    try {
      let allPlanning: PlanningItem[] = [];
      const now = new Date();
      let weekStart = weekNummer;
      let weekEnd = weekNummer;
      let yearStart = jaar;
      let yearEnd = jaar;
      let periodeLabel = '';

      if (exportPeriode === 'dag') {
        allPlanning = planning;
        periodeLabel = `Week_${weekNummer}_${jaar}`;
      } else if (exportPeriode === 'week') {
        allPlanning = planning;
        periodeLabel = `Week_${weekNummer}_${jaar}`;
      } else if (exportPeriode === 'maand') {
        const weeksInMonth: number[] = [];
        for (let w = weekNummer - 2; w <= weekNummer + 2; w++) weeksInMonth.push(w);
        const promises = weeksInMonth.map(w =>
          fetch(`${API_URL}/api/planning?week_nummer=${w}&jaar=${jaar}`).then(r => r.json())
        );
        const results = await Promise.all(promises);
        allPlanning = results.flat();
        periodeLabel = `Maand_Week${weekNummer - 2}_tot_${weekNummer + 2}_${jaar}`;
      } else if (exportPeriode === '6maanden') {
        const promises = [];
        for (let w = Math.max(1, weekNummer - 13); w <= Math.min(52, weekNummer + 13); w++) {
          promises.push(fetch(`${API_URL}/api/planning?week_nummer=${w}&jaar=${jaar}`).then(r => r.json()));
        }
        const results = await Promise.all(promises);
        allPlanning = results.flat();
        periodeLabel = `6_Maanden_${jaar}`;
      } else if (exportPeriode === 'jaar') {
        const promises = [];
        for (let w = 1; w <= 52; w++) {
          promises.push(fetch(`${API_URL}/api/planning?week_nummer=${w}&jaar=${jaar}`).then(r => r.json()));
        }
        const results = await Promise.all(promises);
        allPlanning = results.flat();
        periodeLabel = `Jaar_${jaar}`;
      }

      if (exportFormaat === 'csv') {
        exportAsCSV(allPlanning, periodeLabel);
      } else {
        exportAsPDF(allPlanning, periodeLabel);
      }
      setShowExportModal(false);
    } catch (e) { console.error(e); alert('Fout bij exporteren'); }
  };

  const exportAsCSV = (data: PlanningItem[], label: string) => {
    const headers = ['Week', 'Dag', 'Datum', 'Klant', 'Werf', 'Adres', 'Werknemers', 'Status', 'Prioriteit', 'Omschrijving', 'Materiaal', 'Geschatte Duur', 'Notities'];
    const rows = data.map(item => [
      item.week_nummer, item.dag, item.datum, item.klant_naam, item.werf_naam,
      item.werf_adres || '', item.werknemer_namen.join('; '), item.status, item.prioriteit,
      item.omschrijving, item.materiaallijst.join('; '), item.geschatte_duur, item.notities,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Planning_${label}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = (data: PlanningItem[], label: string) => {
    const statusSymbols: Record<string, string> = { gepland: '○', onderweg: '◐', bezig: '◑', afgerond: '●' };
    let htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; color: #1A1A2E; }
      h1 { color: #F5A623; font-size: 24px; border-bottom: 2px solid #F5A623; padding-bottom: 8px; }
      h2 { color: #1A1A2E; font-size: 18px; margin-top: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th { background: #1A1A2E; color: #fff; padding: 8px 10px; text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #E8E9ED; }
      tr:nth-child(even) { background: #F5F6FA; }
      .status-gepland { color: #6c757d; } .status-onderweg { color: #3498db; }
      .status-bezig { color: #F5A623; } .status-afgerond { color: #28a745; }
      .header { display: flex; justify-content: space-between; align-items: center; }
      .logo { font-size: 28px; font-weight: bold; color: #F5A623; }
      .meta { color: #6c757d; font-size: 12px; }
      .footer { margin-top: 24px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #E8E9ED; padding-top: 8px; }
    </style></head><body>
    <div class="header"><span class="logo">Smart-Tech BV</span><span class="meta">Planning Export - ${label}<br>${new Date().toLocaleDateString('nl-BE')}</span></div>
    <h1>Planning Overzicht</h1>
    <p class="meta">Totaal: ${data.length} taken | Afgerond: ${data.filter(d => d.status === 'afgerond').length} | Bezig: ${data.filter(d => d.status === 'bezig' || d.status === 'onderweg').length}</p>`;

    // Group by week
    const byWeek: Record<number, PlanningItem[]> = {};
    data.forEach(item => {
      if (!byWeek[item.week_nummer]) byWeek[item.week_nummer] = [];
      byWeek[item.week_nummer].push(item);
    });

    Object.entries(byWeek).sort(([a], [b]) => Number(a) - Number(b)).forEach(([week, items]) => {
      htmlContent += `<h2>Week ${week}</h2>
      <table><tr><th>Dag</th><th>Datum</th><th>Klant</th><th>Werf</th><th>Werknemers</th><th>Status</th><th>Prioriteit</th><th>Omschrijving</th><th>Materiaal</th><th>Duur</th></tr>`;
      items.forEach(item => {
        htmlContent += `<tr>
          <td>${item.dag}</td><td>${item.datum}</td><td><strong>${item.klant_naam}</strong></td>
          <td>${item.werf_naam}</td><td>${item.werknemer_namen.join(', ')}</td>
          <td class="status-${item.status}">${statusSymbols[item.status] || '○'} ${item.status}</td>
          <td>${item.prioriteit}</td><td>${item.omschrijving || '-'}</td>
          <td>${item.materiaallijst.join(', ') || '-'}</td><td>${item.geschatte_duur || '-'}</td></tr>`;
      });
      htmlContent += '</table>';
    });

    htmlContent += `<div class="footer">Gegenereerd door Smart-Tech BV Planning System - ${new Date().toLocaleString('nl-BE')}</div></body></html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  if (Platform.OS !== 'web') return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Planning</Text>
          <Text style={styles.subtitle}>Weekoverzicht en taaktoewijzing</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#1A1A2E' }]} onPress={() => setShowExportModal(true)}>
            <Ionicons name="download-outline" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Exporteren</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => openCreateModal()}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.addBtnText}>Nieuwe taak</Text>
          </TouchableOpacity>
        </View>
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
                    <TouchableOpacity key={item.id} style={[styles.planCard, item.belangrijk && styles.planCardBelangrijk]} onPress={() => openDetail(item)} activeOpacity={0.7}>
                      {/* Priority strip */}
                      <View style={[styles.priorityStrip, { backgroundColor: PRIORITEIT_KLEUREN[item.prioriteit] || '#3498db' }]} />
                      <View style={styles.planCardContent}>
                        {/* Belangrijk banner */}
                        {item.belangrijk && (
                          <View style={styles.planCardBelangrijkBanner}>
                            <Ionicons name="warning" size={12} color="#fff" />
                            <Text style={styles.planCardBelangrijkText}>BELANGRIJK</Text>
                          </View>
                        )}
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
                        {/* Time */}
                        {(item.start_uur || item.voorziene_uur) && (
                          <View style={styles.planDuurRow}>
                            <Ionicons name="time-outline" size={12} color="#3498db" />
                            <Text style={[styles.planDuur, { color: '#3498db' }]}>
                              {item.start_uur && item.eind_uur ? `${item.start_uur} - ${item.eind_uur}` : (item.voorziene_uur || '')}
                            </Text>
                          </View>
                        )}
                        {/* Workers */}
                        <View style={styles.planWorkersRow}>
                          <Ionicons name="people-outline" size={12} color="#3498db" />
                          <Text style={styles.planWorkers} numberOfLines={1}>{item.werknemer_namen.join(', ') || 'Geen werknemers'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
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

      {/* ============ CREATE / EDIT MODAL ============ */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Taak bewerken' : 'Nieuwe taak plannen'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 620 }}>

              {/* === SECTIE 1: WANNEER === */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>📅 Wanneer</Text>

                {/* Dag */}
                <Text style={styles.label}>Dag *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {DAGEN.map(dag => (
                      <TouchableOpacity key={dag} style={[styles.chip, form.dag === dag && styles.chipActive]} onPress={() => setForm({ ...form, dag })}>
                        <Text style={[styles.chipText, form.dag === dag && styles.chipTextActive]}>{(DAG_KORT as any)[dag]} {weekDates[dag]?.substring(0, 5)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Tijden */}
                <View style={styles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Start uur</Text>
                    <TextInput
                      style={styles.input}
                      value={form.start_uur}
                      onChangeText={handleStartUur}
                      placeholder="08:00"
                      placeholderTextColor="#999"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Eind uur</Text>
                    <TextInput
                      style={styles.input}
                      value={form.eind_uur}
                      onChangeText={handleEindUur}
                      placeholder="16:30"
                      placeholderTextColor="#999"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Voorziene uur</Text>
                    <TextInput
                      style={[styles.input, form.voorziene_uur ? { borderColor: '#F5A623' } : {}]}
                      value={form.voorziene_uur}
                      onChangeText={v => setForm({ ...form, voorziene_uur: v })}
                      placeholder="auto"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
              </View>

              {/* === SECTIE 2: LOCATIE === */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>📍 Locatie</Text>

                {/* Klant */}
                <Text style={styles.label}>Klant / Bedrijf *</Text>
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
              </View>

              {/* === SECTIE 3: TEAM === */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>👷 Werknemers *</Text>
                {werknemerGroups.werknemers.length > 0 && (
                  <>
                    <Text style={{ fontSize: 12, color: '#3498db', fontWeight: '600', marginBottom: 6 }}>Werknemers & Ploegbazen</Text>
                    <View style={styles.workerGrid}>
                      {werknemerGroups.werknemers.map(w => {
                        const isSelected = form.werknemer_ids.includes(w.id);
                        return (
                          <TouchableOpacity key={w.id} style={[styles.workerChip, isSelected && styles.workerChipActive]}
                            onPress={() => toggleWorker(w.id)}>
                            <View style={[styles.workerAvatar, isSelected && { backgroundColor: '#F5A623' }]}>
                              <Text style={[styles.workerAvatarText, isSelected && { color: '#fff' }]}>{w.naam?.charAt(0)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.workerName, isSelected && { color: '#F5A623', fontWeight: '600' }]} numberOfLines={1}>{w.naam}</Text>
                              <Text style={{ fontSize: 10, color: '#999' }}>{w.rol}</Text>
                            </View>
                            {isSelected && <Ionicons name="checkmark-circle" size={18} color="#F5A623" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
                {werknemerGroups.onderaannemers.length > 0 && (
                  <>
                    <Text style={{ fontSize: 12, color: '#e67e22', fontWeight: '600', marginBottom: 6, marginTop: 12 }}>Onderaannemers</Text>
                    <View style={styles.workerGrid}>
                      {werknemerGroups.onderaannemers.map(w => {
                        const isSelected = form.werknemer_ids.includes(w.id);
                        return (
                          <TouchableOpacity key={w.id} style={[styles.workerChip, isSelected && { borderColor: '#e67e22', backgroundColor: '#e67e2210' }]}
                            onPress={() => toggleWorker(w.id)}>
                            <View style={[styles.workerAvatar, { backgroundColor: '#e67e2220' }, isSelected && { backgroundColor: '#e67e22' }]}>
                              <Text style={[styles.workerAvatarText, { color: '#e67e22' }, isSelected && { color: '#fff' }]}>{w.naam?.charAt(0)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.workerName, isSelected && { color: '#e67e22', fontWeight: '600' }]} numberOfLines={1}>{w.naam}</Text>
                              <Text style={{ fontSize: 10, color: '#e67e22' }}>onderaannemer</Text>
                            </View>
                            {isSelected && <Ionicons name="checkmark-circle" size={18} color="#e67e22" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>

              {/* === SECTIE 4: WERKINSTRUCTIES === */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>📋 Werkinstructies</Text>

                {/* Uit te voeren werk */}
                <Text style={styles.label}>Uit te voeren werk</Text>
                <TextInput
                  style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                  value={form.omschrijving}
                  onChangeText={v => setForm({ ...form, omschrijving: v })}
                  placeholder="Beschrijf wat er gedaan moet worden..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                />

                {/* Nodige materiaal */}
                <Text style={styles.label}>Nodige materiaal</Text>
                <Text style={{ fontSize: 11, color: '#999', marginTop: -6, marginBottom: 8 }}>Één item per regel</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={form.nodige_materiaal}
                  onChangeText={v => setForm({ ...form, nodige_materiaal: v })}
                  placeholder={"Steigers\nBouten M12\nSiliconen kit wit"}
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                />

                {/* Opmerking / aandachtspunt */}
                <Text style={styles.label}>Opmerking / Aandachtspunt</Text>
                <TextInput
                  style={[styles.input, { minHeight: 70, textAlignVertical: 'top', borderColor: form.opmerking_aandachtspunt ? '#F5A623' : '#E8E9ED' }]}
                  value={form.opmerking_aandachtspunt}
                  onChangeText={v => setForm({ ...form, opmerking_aandachtspunt: v })}
                  placeholder="Risico's, speciale instructies, klantafspraken..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* === SECTIE 5: INSTELLINGEN === */}
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>⚙️ Instellingen</Text>

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

                {/* Belangrijk toggle */}
                <TouchableOpacity
                  style={[styles.belangrijkToggle, form.belangrijk && styles.belangrijkToggleActive]}
                  onPress={() => setForm({ ...form, belangrijk: !form.belangrijk })}
                >
                  <Ionicons name={form.belangrijk ? 'warning' : 'warning-outline'} size={22} color={form.belangrijk ? '#fff' : '#F5A623'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.belangrijkToggleText, form.belangrijk && { color: '#fff' }]}>Markeer als Belangrijk</Text>
                    <Text style={[{ fontSize: 11, color: form.belangrijk ? '#fff' : '#999', marginTop: 2 }]}>Werknemer ziet dit prominent op zijn app</Text>
                  </View>
                  <View style={[styles.toggleSwitch, form.belangrijk && styles.toggleSwitchOn]}>
                    <View style={[styles.toggleThumb, form.belangrijk && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>

                {/* Notities */}
                <Text style={styles.label}>Bijkomende notities</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={form.notities}
                  onChangeText={v => setForm({ ...form, notities: v })}
                  placeholder="Interne notities (niet zichtbaar voor werknemer)..."
                  placeholderTextColor="#999"
                  multiline
                />
              </View>

            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={savePlanning} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={isEditing ? 'save' : 'calendar'} size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>{isEditing ? 'Wijzigingen opslaan' : 'Inplannen'}</Text>
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
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {selectedItem.belangrijk && (
                      <View style={styles.belangrijkBadge}>
                        <Ionicons name="warning" size={14} color="#fff" />
                        <Text style={styles.belangrijkBadgeText}>BELANGRIJK</Text>
                      </View>
                    )}
                    <Text style={styles.modalTitle} numberOfLines={1}>Taak details</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowDetailModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
                </View>

                {/* Belangrijk banner */}
                {selectedItem.belangrijk && (
                  <View style={styles.belangrijkBanner}>
                    <Ionicons name="warning" size={18} color="#dc3545" />
                    <Text style={styles.belangrijkBannerText}>Dit is een BELANGRIJKE taak — extra aandacht vereist</Text>
                  </View>
                )}

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 560 }}>
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

                  {/* Priority + Dag */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <View style={[styles.detailRow, { flex: 1 }]}>
                      <Ionicons name="flag-outline" size={18} color={PRIORITEIT_KLEUREN[selectedItem.prioriteit]} />
                      <Text style={styles.detailLabel}>Prioriteit:</Text>
                      <View style={[styles.priorityBadge, { backgroundColor: (PRIORITEIT_KLEUREN[selectedItem.prioriteit] || '#3498db') + '20' }]}>
                        <Text style={[styles.priorityBadgeText, { color: PRIORITEIT_KLEUREN[selectedItem.prioriteit] }]}>{selectedItem.prioriteit}</Text>
                      </View>
                    </View>
                  </View>

                  {/* When block */}
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailBlockTitle}>📅 Wanneer</Text>
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={18} color="#3498db" />
                      <Text style={styles.detailLabel}>Dag:</Text>
                      <Text style={styles.detailValue}>{selectedItem.dag} ({selectedItem.datum})</Text>
                    </View>
                    {(selectedItem.start_uur || selectedItem.eind_uur) && (
                      <View style={styles.detailRow}>
                        <Ionicons name="time-outline" size={18} color="#3498db" />
                        <Text style={styles.detailLabel}>Tijden:</Text>
                        <Text style={styles.detailValue}>
                          {selectedItem.start_uur || '?'} → {selectedItem.eind_uur || '?'}
                          {selectedItem.voorziene_uur ? `  (${selectedItem.voorziene_uur})` : ''}
                        </Text>
                      </View>
                    )}
                    {selectedItem.voorziene_uur && !selectedItem.start_uur && (
                      <View style={styles.detailRow}>
                        <Ionicons name="hourglass-outline" size={18} color="#6c757d" />
                        <Text style={styles.detailLabel}>Voorziene uur:</Text>
                        <Text style={styles.detailValue}>{selectedItem.voorziene_uur}</Text>
                      </View>
                    )}
                  </View>

                  {/* Location block */}
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailBlockTitle}>📍 Locatie</Text>
                    <View style={styles.detailRow}>
                      <Ionicons name="briefcase-outline" size={18} color="#6c757d" />
                      <Text style={styles.detailLabel}>Klant:</Text>
                      <Text style={styles.detailValue}>{selectedItem.klant_naam}</Text>
                    </View>
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
                  </View>

                  {/* Workers block */}
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailBlockTitle}>👷 Werknemers</Text>
                    <View style={{ gap: 6 }}>
                      {selectedItem.werknemer_namen.map((naam, i) => {
                        const wId = selectedItem.werknemer_ids[i];
                        const bevestigd = selectedItem.bevestigd_door.includes(wId);
                        const bevestiging = (selectedItem.bevestigingen || []).find((b: any) => b.worker_id === wId);
                        const tsLabel = bevestiging?.timestamp
                          ? new Date(bevestiging.timestamp).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : null;
                        return (
                          <View key={i} style={styles.workerDetailRow}>
                            <View style={styles.workerAvatarSmall}><Text style={styles.workerAvatarTextSmall}>{naam?.charAt(0)}</Text></View>
                            <Text style={styles.workerDetailName}>{naam}</Text>
                            <View style={[styles.bevestigBadge, { backgroundColor: bevestigd ? '#28a74520' : '#F5A62320' }]}>
                              <Ionicons name={bevestigd ? 'checkmark-circle' : 'time'} size={14} color={bevestigd ? '#28a745' : '#F5A623'} />
                              <Text style={{ fontSize: 11, color: bevestigd ? '#28a745' : '#F5A623', fontWeight: '600' }}>
                                {bevestigd ? 'BEVESTIGD' : 'Wacht'}
                              </Text>
                              {bevestigd && tsLabel && (
                                <Text style={{ fontSize: 9, color: '#28a745', marginTop: 1 }}>{tsLabel}</Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Work instructions block */}
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailBlockTitle}>📋 Werkinstructies</Text>
                    {selectedItem.omschrijving ? (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Uit te voeren werk</Text>
                        <Text style={styles.detailSectionText}>{selectedItem.omschrijving}</Text>
                      </View>
                    ) : null}

                    {(selectedItem.nodige_materiaal || selectedItem.materiaallijst?.length > 0) ? (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Nodige materiaal</Text>
                        {selectedItem.nodige_materiaal
                          ? selectedItem.nodige_materiaal.split('\n').filter(Boolean).map((m, i) => (
                            <View key={i} style={styles.materialRow}>
                              <View style={styles.materialDot} />
                              <Text style={styles.materialText}>{m}</Text>
                            </View>
                          ))
                          : selectedItem.materiaallijst.map((m, i) => (
                            <View key={i} style={styles.materialRow}>
                              <View style={styles.materialDot} />
                              <Text style={styles.materialText}>{m}</Text>
                            </View>
                          ))
                        }
                      </View>
                    ) : null}

                    {selectedItem.opmerking_aandachtspunt ? (
                      <View style={[styles.detailSection, { backgroundColor: '#FFF3CD', borderLeftWidth: 3, borderLeftColor: '#F5A623' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name="warning-outline" size={14} color="#856404" />
                          <Text style={[styles.detailSectionTitle, { color: '#856404' }]}>Opmerking / Aandachtspunt</Text>
                        </View>
                        <Text style={[styles.detailSectionText, { color: '#856404' }]}>{selectedItem.opmerking_aandachtspunt}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Notes (internal) */}
                  {selectedItem.notities ? (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailBlockTitle}>📝 Interne notities</Text>
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionText}>{selectedItem.notities}</Text>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Actions */}
                <View style={styles.detailActions}>
                  <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: '#dc354515' }]} onPress={() => deletePlanningItem(selectedItem.id)}>
                    <Ionicons name="trash-outline" size={18} color="#dc3545" />
                    <Text style={{ color: '#dc3545', fontWeight: '600', fontSize: 14 }}>Verwijderen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: '#3498db15' }]} onPress={() => openEditModal(selectedItem)}>
                    <Ionicons name="pencil-outline" size={18} color="#3498db" />
                    <Text style={{ color: '#3498db', fontWeight: '600', fontSize: 14 }}>Bewerken</Text>
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

      {/* ============ EXPORT MODAL ============ */}
      <Modal visible={showExportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Planning Exporteren</Text>
              <TouchableOpacity onPress={() => setShowExportModal(false)}><Ionicons name="close" size={24} color="#1A1A2E" /></TouchableOpacity>
            </View>

            <Text style={styles.label}>Periode</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'dag', label: 'Dagelijks' },
                { key: 'week', label: 'Wekelijks' },
                { key: 'maand', label: 'Maandelijks' },
                { key: '6maanden', label: '6 Maanden' },
                { key: 'jaar', label: 'Jaarlijks' },
              ].map(p => (
                <TouchableOpacity key={p.key} style={[styles.chip, exportPeriode === p.key && styles.chipActive]}
                  onPress={() => setExportPeriode(p.key)}>
                  <Text style={[styles.chipText, exportPeriode === p.key && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Formaat</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity style={[styles.chip, exportFormaat === 'csv' && styles.chipActiveGreen, { flex: 1, alignItems: 'center' }]}
                onPress={() => setExportFormaat('csv')}>
                <Ionicons name="document-outline" size={18} color={exportFormaat === 'csv' ? '#fff' : '#6c757d'} />
                <Text style={[styles.chipText, exportFormaat === 'csv' && styles.chipTextActive]}>CSV (Excel)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, exportFormaat === 'pdf' && styles.chipActiveBlue, { flex: 1, alignItems: 'center' }]}
                onPress={() => setExportFormaat('pdf')}>
                <Ionicons name="print-outline" size={18} color={exportFormaat === 'pdf' ? '#fff' : '#6c757d'} />
                <Text style={[styles.chipText, exportFormaat === 'pdf' && styles.chipTextActive]}>PDF (Print)</Text>
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, marginTop: 16 }}>
              <Text style={{ fontSize: 13, color: '#6c757d' }}>
                {exportPeriode === 'dag' ? `Huidige week ${weekNummer} (${jaar})` :
                 exportPeriode === 'week' ? `Week ${weekNummer} (${jaar})` :
                 exportPeriode === 'maand' ? `Week ${weekNummer - 2} t/m ${weekNummer + 2} (${jaar})` :
                 exportPeriode === '6maanden' ? `26 weken rondom week ${weekNummer} (${jaar})` :
                 `Heel ${jaar} (52 weken)`}
              </Text>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={exportPlanning}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="download" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Exporteren</Text>
              </View>
            </TouchableOpacity>
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
  // New form section styles
  formSection: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  formSectionTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  timeRow: { flexDirection: 'row', gap: 10 },
  // Belangrijk toggle
  belangrijkToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF9ED', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1.5, borderColor: '#F5A623' },
  belangrijkToggleActive: { backgroundColor: '#F5A623' },
  belangrijkToggleText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E8E9ED', justifyContent: 'center', padding: 2 },
  toggleSwitchOn: { backgroundColor: '#1A1A2E' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  // Belangrijk card badge
  planCardBelangrijk: { borderColor: '#dc3545', borderWidth: 1.5 },
  planCardBelangrijkBanner: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dc3545', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 4 },
  planCardBelangrijkText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  // Detail block
  detailBlock: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  detailBlockTitle: { fontSize: 13, fontWeight: '700', color: '#6c757d', marginBottom: 8 },
  // Important badges
  belangrijkBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dc3545', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  belangrijkBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  belangrijkBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDECEA', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#dc354530' },
  belangrijkBannerText: { fontSize: 13, fontWeight: '600', color: '#dc3545', flex: 1 },
});
