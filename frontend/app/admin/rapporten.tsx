import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
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

interface UrenData {
  naam: string;
  totaalUren: number;
  werkbonnen: number;
}

interface StatusData {
  status: string;
  count: number;
  percentage: number;
}

export default function RapportenAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'werknemer' | 'team' | 'werf' | 'klant' | 'status'>('werknemer');
  const [urenPerWerknemer, setUrenPerWerknemer] = useState<UrenData[]>([]);
  const [urenPerTeam, setUrenPerTeam] = useState<UrenData[]>([]);
  const [urenPerWerf, setUrenPerWerf] = useState<UrenData[]>([]);
  const [urenPerKlant, setUrenPerKlant] = useState<UrenData[]>([]);
  const [statusOverzicht, setStatusOverzicht] = useState<StatusData[]>([]);
  const [totaalUren, setTotaalUren] = useState(0);
  const [totaalWerkbonnen, setTotaalWerkbonnen] = useState(0);
  const [actieveWerknemers, setActieveWerknemers] = useState(0);
  const [actieveWerven, setActieveWerven] = useState(0);

  const allowedRoles = ['beheerder', 'admin', 'manager', 'master_admin'];

  useEffect(() => {
    if (Platform.OS === 'web' && allowedRoles.includes(user?.rol || '')) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [werkbonnenRes, werknemersRes, teamsRes, wervenRes] = await Promise.all([
        fetch(`${API_URL}/api/werkbonnen?user_id=admin-001&is_admin=true`),
        fetch(`${API_URL}/api/auth/users`),
        fetch(`${API_URL}/api/teams`),
        fetch(`${API_URL}/api/werven`),
      ]);

      const werkbonnen = await werkbonnenRes.json();
      const werknemers = await werknemersRes.json();
      const teams = await teamsRes.json();
      const werven = await wervenRes.json();

      const werkbonnenList = Array.isArray(werkbonnen) ? werkbonnen : [];
      const werknemersList = Array.isArray(werknemers) ? werknemers : [];
      const teamsList = Array.isArray(teams) ? teams : [];
      const wervenList = Array.isArray(werven) ? werven : [];

      // Count active werknemers (workers and onderaannemers, excluding admins)
      const activeWorkers = werknemersList.filter((w: any) => 
        w.actief !== false && (w.rol === 'worker' || w.rol === 'werknemer' || w.rol === 'onderaannemer')
      ).length;
      setActieveWerknemers(activeWorkers);

      // Count all werven
      setActieveWerven(wervenList.length);

      setTotaalWerkbonnen(werkbonnenList.length);

      // Calculate total hours from a werkbon
      const calcUren = (wb: any) => {
        return wb.uren?.reduce((sum: number, u: any) => {
          return sum + (u.maandag || 0) + (u.dinsdag || 0) + (u.woensdag || 0) +
            (u.donderdag || 0) + (u.vrijdag || 0) + (u.zaterdag || 0) + (u.zondag || 0);
        }, 0) || 0;
      };

      // Total hours
      const totalUren = werkbonnenList.reduce((acc: number, wb: any) => acc + calcUren(wb), 0);
      setTotaalUren(totalUren);

      // Uren per werknemer
      const werknemerMap: { [key: string]: { uren: number; count: number } } = {};
      werkbonnenList.forEach((wb: any) => {
        const naam = wb.created_by_naam || 'Onbekend';
        if (!werknemerMap[naam]) werknemerMap[naam] = { uren: 0, count: 0 };
        werknemerMap[naam].uren += calcUren(wb);
        werknemerMap[naam].count += 1;
      });
      const werknemerData = Object.entries(werknemerMap)
        .map(([naam, data]) => ({ naam, totaalUren: data.uren, werkbonnen: data.count }))
        .sort((a, b) => b.totaalUren - a.totaalUren);
      setUrenPerWerknemer(werknemerData);

      // Uren per team
      const teamMap: { [key: string]: { uren: number; count: number } } = {};
      werkbonnenList.forEach((wb: any) => {
        const teamNaam = wb.team_naam || 'Geen team';
        if (!teamMap[teamNaam]) teamMap[teamNaam] = { uren: 0, count: 0 };
        teamMap[teamNaam].uren += calcUren(wb);
        teamMap[teamNaam].count += 1;
      });
      const teamData = Object.entries(teamMap)
        .map(([naam, data]) => ({ naam, totaalUren: data.uren, werkbonnen: data.count }))
        .sort((a, b) => b.totaalUren - a.totaalUren);
      setUrenPerTeam(teamData);

      // Uren per werf
      const werfMap: { [key: string]: { uren: number; count: number } } = {};
      werkbonnenList.forEach((wb: any) => {
        const werfNaam = wb.werf_naam || 'Onbekend';
        if (!werfMap[werfNaam]) werfMap[werfNaam] = { uren: 0, count: 0 };
        werfMap[werfNaam].uren += calcUren(wb);
        werfMap[werfNaam].count += 1;
      });
      const werfData = Object.entries(werfMap)
        .map(([naam, data]) => ({ naam, totaalUren: data.uren, werkbonnen: data.count }))
        .sort((a, b) => b.totaalUren - a.totaalUren);
      setUrenPerWerf(werfData);

      // Uren per klant
      const klantMap: { [key: string]: { uren: number; count: number } } = {};
      werkbonnenList.forEach((wb: any) => {
        const klantNaam = wb.klant_naam || 'Onbekend';
        if (!klantMap[klantNaam]) klantMap[klantNaam] = { uren: 0, count: 0 };
        klantMap[klantNaam].uren += calcUren(wb);
        klantMap[klantNaam].count += 1;
      });
      const klantData = Object.entries(klantMap)
        .map(([naam, data]) => ({ naam, totaalUren: data.uren, werkbonnen: data.count }))
        .sort((a, b) => b.totaalUren - a.totaalUren);
      setUrenPerKlant(klantData);

      // Status overzicht
      const statusMap: { [key: string]: number } = {};
      werkbonnenList.forEach((wb: any) => {
        const status = wb.status || 'concept';
        statusMap[status] = (statusMap[status] || 0) + 1;
      });
      const total = werkbonnenList.length || 1;
      const statusData = Object.entries(statusMap)
        .map(([status, count]) => ({ status, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);
      setStatusOverzicht(statusData);

    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = async () => {
    try {
      const res = await fetch(`${API_URL}/api/werkbonnen?user_id=admin-001&is_admin=true`);
      const werkbonnen = await res.json();
      const werkbonnenList = Array.isArray(werkbonnen) ? werkbonnen : [];

      // CSV headers
      const headers = ['Datum', 'Week', 'Jaar', 'Werknemer', 'Team', 'Klant', 'Werf', 'Type', 'Uren', 'Status', 'Handtekening', 'Opmerkingen'];
      
      // CSV rows
      const rows = werkbonnenList.flatMap((wb: any) => {
        const baseData = {
          datum: wb.created_at ? new Date(wb.created_at).toLocaleDateString('nl-BE') : '',
          week: wb.week_nummer || '',
          jaar: wb.jaar || '',
          werknemer: wb.created_by_naam || '',
          team: wb.team_naam || '',
          klant: wb.klant_naam || '',
          werf: wb.werf_naam || '',
          status: wb.status || 'concept',
          handtekening: wb.handtekening_data ? 'Ja' : 'Nee',
        };

        // Create one row per uren entry (per day type)
        if (wb.uren && wb.uren.length > 0) {
          return wb.uren.map((u: any) => {
            const totalUren = (u.maandag || 0) + (u.dinsdag || 0) + (u.woensdag || 0) +
              (u.donderdag || 0) + (u.vrijdag || 0) + (u.zaterdag || 0) + (u.zondag || 0);
            return [
              baseData.datum,
              baseData.week,
              baseData.jaar,
              baseData.werknemer,
              baseData.team,
              baseData.klant,
              baseData.werf,
              u.type || 'Normaal',
              totalUren.toString(),
              baseData.status,
              baseData.handtekening,
              (u.opmerking || '').replace(/[\n\r,]/g, ' '),
            ].join(',');
          });
        }
        
        return [[
          baseData.datum,
          baseData.week,
          baseData.jaar,
          baseData.werknemer,
          baseData.team,
          baseData.klant,
          baseData.werf,
          '',
          '0',
          baseData.status,
          baseData.handtekening,
          '',
        ].join(',')];
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `werkbonnen_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Fout bij exporteren');
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept': return '#ffc107';
      case 'ondertekend': return '#28a745';
      case 'verzonden': return '#F5A623';
      default: return '#6c757d';
    }
  };

  const tabs = [
    { key: 'werknemer', label: 'Per werknemer', icon: 'person' },
    { key: 'team', label: 'Per team', icon: 'people' },
    { key: 'werf', label: 'Per werf', icon: 'business' },
    { key: 'klant', label: 'Per klant', icon: 'briefcase' },
    { key: 'status', label: 'Status overzicht', icon: 'pie-chart' },
  ];

  const renderTable = (data: UrenData[], title: string) => (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>{title}</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Werkbonnen</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Uren</Text>
      </View>
      {data.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>Geen data beschikbaar</Text>
        </View>
      ) : (
        data.map((item, index) => (
          <View key={index} style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, { flex: 2, fontWeight: '500' }]}>{item.naam}</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{item.werkbonnen}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View style={styles.urenBadge}>
                <Text style={styles.urenBadgeText}>{item.totaalUren} uur</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderStatusTable = () => (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Status</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Aantal</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Percentage</Text>
      </View>
      {statusOverzicht.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>Geen data beschikbaar</Text>
        </View>
      ) : (
        statusOverzicht.map((item, index) => (
          <View key={index} style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}>
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.tableCell, { fontWeight: '500' }]}>{item.status}</Text>
            </View>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{item.count}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View style={styles.percentBar}>
                <View style={[styles.percentFill, { width: `${item.percentage}%`, backgroundColor: getStatusColor(item.status) }]} />
              </View>
              <Text style={styles.percentText}>{item.percentage}%</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Rapporten</Text>
          <Text style={styles.subtitle}>Overzicht van uren en werkbonnen</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <Ionicons name="download-outline" size={20} color="#fff" />
          <Text style={styles.exportBtnText}>Exporteer CSV</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginVertical: 40 }} />
      ) : (
        <>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Ionicons name="timer-outline" size={28} color="#F5A623" />
              <Text style={styles.summaryValue}>{totaalUren}</Text>
              <Text style={styles.summaryLabel}>Totaal uren</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="document-text-outline" size={28} color="#3498db" />
              <Text style={styles.summaryValue}>{totaalWerkbonnen}</Text>
              <Text style={styles.summaryLabel}>Totaal werkbonnen</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="people-outline" size={28} color="#9b59b6" />
              <Text style={styles.summaryValue}>{actieveWerknemers}</Text>
              <Text style={styles.summaryLabel}>Actieve werknemers</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="business-outline" size={28} color="#e67e22" />
              <Text style={styles.summaryValue}>{actieveWerven}</Text>
              <Text style={styles.summaryLabel}>Actieve werven</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <Ionicons name={tab.icon as any} size={18} color={activeTab === tab.key ? '#F5A623' : '#6c757d'} />
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <View style={styles.content}>
            {activeTab === 'werknemer' && renderTable(urenPerWerknemer, 'Werknemer')}
            {activeTab === 'team' && renderTable(urenPerTeam, 'Team')}
            {activeTab === 'werf' && renderTable(urenPerWerf, 'Werf')}
            {activeTab === 'klant' && renderTable(urenPerKlant, 'Klant')}
            {activeTab === 'status' && renderStatusTable()}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#28a745',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  exportBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#F5A62315',
  },
  tabText: {
    fontSize: 13,
    color: '#6c757d',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#F5A623',
    fontWeight: '600',
  },
  content: {
    marginBottom: 40,
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6c757d',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tableCell: {
    fontSize: 14,
    color: '#1A1A2E',
  },
  urenBadge: {
    backgroundColor: '#F5A62315',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  urenBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F5A623',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  percentBar: {
    width: 60,
    height: 6,
    backgroundColor: '#E8E9ED',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  percentFill: {
    height: '100%',
    borderRadius: 3,
  },
  percentText: {
    fontSize: 12,
    color: '#6c757d',
  },
  emptyRow: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
  },
  noAccess: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAccessText: {
    fontSize: 20,
    color: '#1A1A2E',
    marginTop: 16,
  },
});
