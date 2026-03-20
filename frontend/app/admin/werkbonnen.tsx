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
import { useAuth, apiClient } from '../../context/AuthContext';
import Constants from 'expo-constants';

// Determine API URL - prioritize window.location.origin for production web deployments
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
    }
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

interface Werkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  klant_naam: string;
  werf_naam: string;
  status: string;
  created_by_naam?: string;
  created_by?: string;
  team_naam?: string;
  handtekening_data?: string;
  uren?: any[];
  created_at?: string;
}

interface ProductieWerkbon {
  id: string;
  datum: string;
  klant_naam: string;
  werf_naam: string;
  werknemer_naam: string;
  ingevuld_door_naam: string;
  totaal_m2: number;
  status: string;
  email_verzonden: boolean;
  handtekening?: string;
  created_at?: string;
}

interface Werknemer { id: string; naam: string; }
interface Team { id: string; naam: string; }
interface Klant { id: string; naam: string; }
interface Werf { id: string; naam: string; }

export default function WerkbonnenAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'werkbonnen' | 'productie' | 'oplevering' | 'project'>('werkbonnen');
  const [werkbonnen, setWerkbonnen] = useState<Werkbon[]>([]);
  const [productieWerkbonnen, setProductieWerkbonnen] = useState<ProductieWerkbon[]>([]);
  const [opleveringWerkbonnen, setOpleveringWerkbonnen] = useState<any[]>([]);
  const [projectWerkbonnen, setProjectWerkbonnen] = useState<any[]>([]);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [werven, setWerven] = useState<Werf[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterWeek, setFilterWeek] = useState<number | null>(null);
  const [filterWerknemer, setFilterWerknemer] = useState<string | null>(null);
  const [filterKlant, setFilterKlant] = useState<string | null>(null);
  const [filterWerf, setFilterWerf] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { 
    if (Platform.OS === 'web' && ['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
      fetchData(); 
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const userId = user?.id || 'admin-001';
      const [werkbonnenRes, werknemersRes, teamsRes, klantenRes, wervenRes, productieRes, opleveringRes, projectRes] = await Promise.all([
        fetch(`${API_URL}/api/werkbonnen?user_id=${userId}&is_admin=true`),
        fetch(`${API_URL}/api/auth/users`),
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/klanten`),
        fetch(`${API_URL}/api/werven`),
        fetch(`${API_URL}/api/productie-werkbonnen?user_id=${userId}&is_admin=true`),
        fetch(`${API_URL}/api/oplevering-werkbonnen?user_id=${userId}&is_admin=true`),
        fetch(`${API_URL}/api/project-werkbonnen?user_id=${userId}&is_admin=true`),
      ]);
      const data = await werkbonnenRes.json();
      setWerkbonnen(Array.isArray(data) ? data.sort((a: Werkbon, b: Werkbon) => b.week_nummer - a.week_nummer) : []);
      const werknemersData = await werknemersRes.json();
      setWerknemers(Array.isArray(werknemersData) ? werknemersData : []);
      const teamsData = await teamsRes.json();
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      const klantenData = await klantenRes.json();
      setKlanten(Array.isArray(klantenData) ? klantenData : []);
      const wervenData = await wervenRes.json();
      setWerven(Array.isArray(wervenData) ? wervenData : []);
      const productieData = await productieRes.json();
      setProductieWerkbonnen(Array.isArray(productieData) ? productieData.sort((a: ProductieWerkbon, b: ProductieWerkbon) => new Date(b.datum).getTime() - new Date(a.datum).getTime()) : []);
      const opleveringData = await opleveringRes.json();
      setOpleveringWerkbonnen(Array.isArray(opleveringData) ? opleveringData : []);
      const projectData = await projectRes.json();
      setProjectWerkbonnen(Array.isArray(projectData) ? projectData : []);
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

  const downloadProductiePdf = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/productie-werkbonnen/${id}/pdf`);
      const data = await res.json();
      if (data.pdf_base64) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.pdf_base64}`;
        link.download = `productie-werkbon_${id}.pdf`;
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

  const resendProductieEmail = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/productie-werkbonnen/${id}/verzenden`, { method: 'POST' });
      alert('E-mail opnieuw verzonden!');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const deleteProductieWerkbon = async (id: string) => {
    if (!confirm('Productie werkbon verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/productie-werkbonnen/${id}`, { method: 'DELETE' });
      setProductieWerkbonnen(prev => prev.filter(wb => wb.id !== id));
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

  if (Platform.OS !== 'web') return null;
  
  // Show loading indicator while auth is loading
  if (authLoading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#F5A623" />
        <Text style={{ marginTop: 16, color: '#6c757d' }}>Laden...</Text>
      </View>
    );
  }
  
  // Allow access for admin roles
  const allowedRoles = ['beheerder', 'admin', 'manager', 'master_admin'];
  if (!allowedRoles.includes(user?.rol || '')) {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
        </View>
      </View>
    );
  }

  // Filter for regular werkbonnen
  let filtered = werkbonnen;
  if (search) {
    filtered = filtered.filter(wb =>
      wb.klant_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.werf_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.created_by_naam?.toLowerCase().includes(search.toLowerCase())
    );
  }
  if (filterStatus) filtered = filtered.filter(wb => wb.status === filterStatus);
  if (filterWeek) filtered = filtered.filter(wb => wb.week_nummer === filterWeek);
  if (filterWerknemer) filtered = filtered.filter(wb => wb.created_by_naam === filterWerknemer);
  if (filterKlant) filtered = filtered.filter(wb => wb.klant_naam === filterKlant);
  if (filterWerf) filtered = filtered.filter(wb => wb.werf_naam === filterWerf);

  // Filter for productie werkbonnen
  let filteredProductie = productieWerkbonnen;
  if (search) {
    filteredProductie = filteredProductie.filter(wb =>
      wb.klant_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.werf_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.werknemer_naam?.toLowerCase().includes(search.toLowerCase()) ||
      wb.ingevuld_door_naam?.toLowerCase().includes(search.toLowerCase())
    );
  }
  if (filterStatus) filteredProductie = filteredProductie.filter(wb => wb.status === filterStatus);
  if (filterKlant) filteredProductie = filteredProductie.filter(wb => wb.klant_naam === filterKlant);
  if (filterWerf) filteredProductie = filteredProductie.filter(wb => wb.werf_naam === filterWerf);

  const statusOptions = ['concept', 'ondertekend', 'verzonden'];
  const weekOptions = [...new Set(werkbonnen.map(wb => wb.week_nummer))].sort((a, b) => b - a).slice(0, 12);
  const werknemerOptions: string[] = [...new Set(werkbonnen.map(wb => wb.created_by_naam).filter(Boolean) as string[])];
  const klantOptions = [...new Set([
    ...werkbonnen.map(wb => wb.klant_naam),
    ...productieWerkbonnen.map(wb => wb.klant_naam)
  ].filter(Boolean))];
  const werfOptions = [...new Set([
    ...werkbonnen.map(wb => wb.werf_naam),
    ...productieWerkbonnen.map(wb => wb.werf_naam)
  ].filter(Boolean))];

  const activeFiltersCount = [filterStatus, filterWeek, filterWerknemer, filterKlant, filterWerf].filter(Boolean).length;

  const exportWerkbonnen = (format: 'csv' | 'pdf') => {
    const data = filtered;
    if (format === 'csv') {
      const headers = ['Week', 'Jaar', 'Klant', 'Werf', 'Werknemer', 'Team', 'Status', 'Totaal Uren'];
      const rows = data.map(wb => {
        const totaalUren = wb.uren?.reduce((sum: number, u: any) => {
          return sum + (u.maandag || 0) + (u.dinsdag || 0) + (u.woensdag || 0) +
            (u.donderdag || 0) + (u.vrijdag || 0) + (u.zaterdag || 0) + (u.zondag || 0);
        }, 0) || 0;
        return [wb.week_nummer, wb.jaar, wb.klant_naam, wb.werf_naam, wb.created_by_naam || '', wb.team_naam || '', wb.status, totaalUren]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Werkbonnen_Export.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } else {
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;margin:20px;color:#1A1A2E}
        h1{color:#F5A623;font-size:22px;border-bottom:2px solid #F5A623;padding-bottom:8px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
        th{background:#1A1A2E;color:#fff;padding:8px 10px;text-align:left}
        td{padding:6px 10px;border-bottom:1px solid #E8E9ED}
        tr:nth-child(even){background:#F5F6FA}
        .meta{color:#6c757d;font-size:12px}
        .footer{margin-top:20px;text-align:center;color:#999;font-size:10px;border-top:1px solid #E8E9ED;padding-top:8px}
      </style></head><body>
      <h1>Smart-Tech BV - Werkbonnen Overzicht</h1>
      <p class="meta">${data.length} werkbonnen | Gegenereerd: ${new Date().toLocaleDateString('nl-BE')}</p>
      <table><tr><th>Week</th><th>Jaar</th><th>Klant</th><th>Werf</th><th>Werknemer</th><th>Team</th><th>Status</th><th>Uren</th></tr>`;
      data.forEach(wb => {
        const totaalUren = wb.uren?.reduce((sum: number, u: any) => sum + (u.maandag||0) + (u.dinsdag||0) + (u.woensdag||0) + (u.donderdag||0) + (u.vrijdag||0) + (u.zaterdag||0) + (u.zondag||0), 0) || 0;
        html += `<tr><td>W${wb.week_nummer}</td><td>${wb.jaar}</td><td><strong>${wb.klant_naam}</strong></td><td>${wb.werf_naam}</td><td>${wb.created_by_naam||'-'}</td><td>${wb.team_naam||'-'}</td><td>${wb.status}</td><td>${totaalUren}</td></tr>`;
      });
      html += `</table><div class="footer">Smart-Tech BV - ${new Date().toLocaleString('nl-BE')}</div></body></html>`;
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    }
  };

  const exportProductie = (format: 'csv' | 'pdf') => {
    const data = filteredProductie;
    if (format === 'csv') {
      const headers = ['Datum', 'Klant', 'Werf', 'Monteur', 'Totaal M²', 'Status'];
      const rows = data.map(wb =>
        [wb.datum, wb.klant_naam, wb.werf_naam, wb.werknemer_naam || wb.ingevuld_door_naam, wb.totaal_m2, wb.status]
          .map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ProductieWerkbonnen_Export.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } else {
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;margin:20px;color:#1A1A2E}
        h1{color:#F5A623;font-size:22px;border-bottom:2px solid #F5A623;padding-bottom:8px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
        th{background:#1A1A2E;color:#fff;padding:8px 10px;text-align:left}
        td{padding:6px 10px;border-bottom:1px solid #E8E9ED}
        tr:nth-child(even){background:#F5F6FA}
      </style></head><body>
      <h1>Smart-Tech BV - Productie Werkbonnen</h1>
      <table><tr><th>Datum</th><th>Klant</th><th>Werf</th><th>Monteur</th><th>M²</th><th>Status</th></tr>`;
      data.forEach(wb => {
        html += `<tr><td>${wb.datum}</td><td><strong>${wb.klant_naam}</strong></td><td>${wb.werf_naam}</td><td>${wb.werknemer_naam || wb.ingevuld_door_naam || '-'}</td><td>${wb.totaal_m2} m²</td><td>${wb.status}</td></tr>`;
      });
      html += `</table></body></html>`;
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Werkbonnen</Text>
          <Text style={styles.subtitle}>
            {activeTab === 'werkbonnen'
              ? `${werkbonnen.length} totaal, ${filtered.length} gefilterd`
              : `${productieWerkbonnen.length} productie, ${filteredProductie.length} gefilterd`
            }
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#27ae60', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => activeTab === 'werkbonnen' ? exportWerkbonnen('csv') : exportProductie('csv')}>
            <Ionicons name="document-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1A1A2E', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => activeTab === 'werkbonnen' ? exportWerkbonnen('pdf') : exportProductie('pdf')}>
            <Ionicons name="print-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'werkbonnen' && styles.tabActive]}
          onPress={() => setActiveTab('werkbonnen')}
        >
          <Ionicons name="time-outline" size={16} color={activeTab === 'werkbonnen' ? '#fff' : '#6c757d'} />
          <Text style={[styles.tabText, activeTab === 'werkbonnen' && styles.tabTextActive]}>
            Uren ({werkbonnen.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'productie' && styles.tabActive]}
          onPress={() => setActiveTab('productie')}
        >
          <Ionicons name="construct-outline" size={16} color={activeTab === 'productie' ? '#fff' : '#6c757d'} />
          <Text style={[styles.tabText, activeTab === 'productie' && styles.tabTextActive]}>
            Productie ({productieWerkbonnen.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Filter Toggle */}
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6c757d" />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'werkbonnen' ? 'Zoek klant, werf of werknemer...' : 'Zoek klant, werf of monteur...'}
            placeholderTextColor="#6c757d"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={[styles.filterToggle, showFilters && styles.filterToggleActive]} onPress={() => setShowFilters(!showFilters)}>
          <Ionicons name="options-outline" size={20} color={showFilters ? '#fff' : '#6c757d'} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Expanded Filters */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                <TouchableOpacity style={[styles.filterChip, !filterStatus && styles.filterChipActive]} onPress={() => setFilterStatus(null)}>
                  <Text style={[styles.filterChipText, !filterStatus && styles.filterChipTextActive]}>Alle</Text>
                </TouchableOpacity>
                {statusOptions.map((s) => (
                  <TouchableOpacity key={s} style={[styles.filterChip, filterStatus === s && styles.filterChipActive]} onPress={() => setFilterStatus(filterStatus === s ? null : s)}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(s) }]} />
                    <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {activeTab === 'werkbonnen' && (
            <>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Week</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterRow}>
                    <TouchableOpacity style={[styles.filterChip, !filterWeek && styles.filterChipActive]} onPress={() => setFilterWeek(null)}>
                      <Text style={[styles.filterChipText, !filterWeek && styles.filterChipTextActive]}>Alle</Text>
                    </TouchableOpacity>
                    {weekOptions.map((w) => (
                      <TouchableOpacity key={w} style={[styles.filterChip, filterWeek === w && styles.filterChipActive]} onPress={() => setFilterWeek(filterWeek === w ? null : w)}>
                        <Text style={[styles.filterChipText, filterWeek === w && styles.filterChipTextActive]}>Week {w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Werknemer</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterRow}>
                    <TouchableOpacity style={[styles.filterChip, !filterWerknemer && styles.filterChipActive]} onPress={() => setFilterWerknemer(null)}>
                      <Text style={[styles.filterChipText, !filterWerknemer && styles.filterChipTextActive]}>Alle</Text>
                    </TouchableOpacity>
                    {werknemerOptions.map((w) => (
                      <TouchableOpacity key={w} style={[styles.filterChip, filterWerknemer === w && styles.filterChipActive]} onPress={() => setFilterWerknemer(filterWerknemer === w ? null : w)}>
                        <Text style={[styles.filterChipText, filterWerknemer === w && styles.filterChipTextActive]}>{w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          )}

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Klant</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                <TouchableOpacity style={[styles.filterChip, !filterKlant && styles.filterChipActive]} onPress={() => setFilterKlant(null)}>
                  <Text style={[styles.filterChipText, !filterKlant && styles.filterChipTextActive]}>Alle</Text>
                </TouchableOpacity>
                {klantOptions.map((k) => (
                  <TouchableOpacity key={k} style={[styles.filterChip, filterKlant === k && styles.filterChipActive]} onPress={() => setFilterKlant(filterKlant === k ? null : k)}>
                    <Text style={[styles.filterChipText, filterKlant === k && styles.filterChipTextActive]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Werf</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                <TouchableOpacity style={[styles.filterChip, !filterWerf && styles.filterChipActive]} onPress={() => setFilterWerf(null)}>
                  <Text style={[styles.filterChipText, !filterWerf && styles.filterChipTextActive]}>Alle</Text>
                </TouchableOpacity>
                {werfOptions.map((w) => (
                  <TouchableOpacity key={w} style={[styles.filterChip, filterWerf === w && styles.filterChipActive]} onPress={() => setFilterWerf(filterWerf === w ? null : w)}>
                    <Text style={[styles.filterChipText, filterWerf === w && styles.filterChipTextActive]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => { setFilterStatus(null); setFilterWeek(null); setFilterWerknemer(null); setFilterKlant(null); setFilterWerf(null); }}>
            <Ionicons name="close-circle-outline" size={18} color="#dc3545" />
            <Text style={styles.clearFiltersText}>Wis alle filters</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : activeTab === 'werkbonnen' ? (
        <View style={styles.tableContainer}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>Week</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Klant / Werf</Text>
            <Text style={styles.tableHeaderCell}>Werknemer</Text>
            <Text style={styles.tableHeaderCell}>Uren</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={styles.tableHeaderCell}>Handtek.</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'center' }]}>Acties</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen werkbonnen gevonden</Text>
            </View>
          ) : (
            filtered.map((wb, index) => (
              <TouchableOpacity
                key={wb.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
                onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}
              >
                <View style={styles.tableCell}>
                  <View style={styles.weekBadge}>
                    <Text style={styles.weekText}>W{wb.week_nummer}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, { flex: 1.5 }]}>
                  <Text style={styles.klantText}>{wb.klant_naam}</Text>
                  <Text style={styles.werfText}>{wb.werf_naam}</Text>
                </View>
                <Text style={styles.tableCell}>{wb.created_by_naam || '-'}</Text>
                <View style={styles.tableCell}>
                  <Text style={styles.urenText}>{calcTotalUren(wb)} u</Text>
                </View>
                <View style={styles.tableCell}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wb.status) }]}>
                    <Text style={styles.statusText}>{wb.status}</Text>
                  </View>
                </View>
                <View style={styles.tableCell}>
                  <Ionicons name={wb.handtekening_data ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={wb.handtekening_data ? '#28a745' : '#adb5bd'} />
                </View>
                <View style={[styles.tableCell, { flex: 0.8, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); downloadPdf(wb.id); }}>
                    <Ionicons name="download-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={(e) => { e.stopPropagation(); resendEmail(wb.id); }}>
                    <Ionicons name="mail-outline" size={18} color="#F5A623" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : (
        /* Productie Werkbonnen Table */
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>Datum</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Klant / Werf</Text>
            <Text style={styles.tableHeaderCell}>Monteur</Text>
            <Text style={styles.tableHeaderCell}>M²</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'center' }]}>Acties</Text>
          </View>

          {filteredProductie.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="construct-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen productie werkbonnen gevonden</Text>
              <Text style={styles.emptySubText}>Werknemers kunnen productie werkbonnen aanmaken via de app</Text>
            </View>
          ) : (
            filteredProductie.map((wb, index) => (
              <View
                key={wb.id}
                style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}
              >
                <View style={styles.tableCell}>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateText}>{wb.datum}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, { flex: 1.5 }]}>
                  <Text style={styles.klantText}>{wb.klant_naam}</Text>
                  <Text style={styles.werfText}>{wb.werf_naam}</Text>
                </View>
                <Text style={styles.tableCell}>{wb.werknemer_naam || wb.ingevuld_door_naam || '-'}</Text>
                <View style={styles.tableCell}>
                  <Text style={styles.urenText}>{wb.totaal_m2} m²</Text>
                </View>
                <View style={styles.tableCell}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wb.status) }]}>
                    <Text style={styles.statusText}>{wb.status}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, { flex: 0.8, flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => downloadProductiePdf(wb.id)}>
                    <Ionicons name="download-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => resendProductieEmail(wb.id)}>
                    <Ionicons name="mail-outline" size={18} color="#F5A623" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => deleteProductieWerkbon(wb.id)}>
                    <Ionicons name="trash-outline" size={18} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#E8E9ED', gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#1A1A2E' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6c757d' },
  tabTextActive: { color: '#fff' },
  filterBar: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  searchInput: { flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 15, color: '#1A1A2E' },
  filterToggle: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E9ED', position: 'relative' },
  filterToggleActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  filterBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#dc3545', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  filtersPanel: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  filterSection: { marginBottom: 16 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: '#6c757d', marginBottom: 8, textTransform: 'uppercase' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F6FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E8E9ED' },
  filterChipActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  filterChipText: { fontSize: 13, color: '#6c757d' },
  filterChipTextActive: { color: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E8E9ED', marginTop: 8 },
  clearFiltersText: { fontSize: 13, color: '#dc3545', fontWeight: '500' },
  tableContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden', marginBottom: 40 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableHeaderCell: { flex: 1, fontSize: 11, fontWeight: '600', color: '#6c757d', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1 },
  weekBadge: { backgroundColor: '#F5A62315', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, alignSelf: 'flex-start' },
  weekText: { fontSize: 13, fontWeight: '700', color: '#F5A623' },
  dateBadge: { backgroundColor: '#3498db15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, alignSelf: 'flex-start' },
  dateText: { fontSize: 12, fontWeight: '700', color: '#3498db' },
  klantText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  werfText: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  urenText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'uppercase' },
  actionIcon: { padding: 6 },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubText: { fontSize: 13, color: '#6c757d', marginTop: 8, textAlign: 'center' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
});
