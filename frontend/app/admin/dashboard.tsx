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
import { router } from 'expo-router';
import { useAppStore } from '../../store/appStore';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface DashboardStats {
  totaalWerknemers: number;
  totaalWerven: number;
  werkbonnenDezeWeek: number;
  werkbonnenWachtend: number;
  totaalUrenDezeWeek: number;
}

export default function AdminDashboard() {
  const { user } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Only render on web
  if (Platform.OS !== 'web') {
    return null;
  }

  // Check if user is admin
  if (user?.role !== 'beheerder') {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
          <Text style={styles.noAccessSub}>Dit portaal is alleen voor beheerders</Text>
        </View>
      </View>
    );
  }

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      // Get current week
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const currentWeek = Math.ceil((days + startOfYear.getDay() + 1) / 7);

      const [werknemersRes, wervenRes, werkbonnenRes] = await Promise.all([
        fetch(`${API_URL}/api/werknemers`),
        fetch(`${API_URL}/api/werven`),
        fetch(`${API_URL}/api/werkbonnen`),
      ]);

      const werknemers = await werknemersRes.json();
      const werven = await wervenRes.json();
      const werkbonnen = await werkbonnenRes.json();

      const werkbonnenDezeWeek = werkbonnen.filter(
        (wb: any) => wb.week_nummer === currentWeek && wb.jaar === now.getFullYear()
      );

      const werkbonnenWachtend = werkbonnen.filter(
        (wb: any) => wb.status === 'concept'
      );

      const totaalUren = werkbonnenDezeWeek.reduce((acc: number, wb: any) => {
        const wbUren = wb.uren?.reduce((sum: number, uren: any) => {
          return sum + (uren.maandag || 0) + (uren.dinsdag || 0) + (uren.woensdag || 0) +
            (uren.donderdag || 0) + (uren.vrijdag || 0) + (uren.zaterdag || 0) + (uren.zondag || 0);
        }, 0) || 0;
        return acc + wbUren;
      }, 0);

      setStats({
        totaalWerknemers: werknemers.filter((w: any) => w.actief).length,
        totaalWerven: werven.filter((w: any) => w.actief).length,
        werkbonnenDezeWeek: werkbonnenDezeWeek.length,
        werkbonnenWachtend: werkbonnenWachtend.length,
        totaalUrenDezeWeek: totaalUren,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    { icon: 'people', label: 'Werknemers', route: '/admin/werknemers', color: '#3498db' },
    { icon: 'git-branch', label: 'Teams', route: '/admin/teams', color: '#9b59b6' },
    { icon: 'business', label: 'Werven', route: '/admin/werven', color: '#e67e22' },
    { icon: 'briefcase', label: 'Klanten', route: '/admin/klanten', color: '#1abc9c' },
    { icon: 'document-text', label: 'Werkbonnen', route: '/admin/werkbonnen', color: '#F5A623' },
    { icon: 'settings', label: 'Instellingen', route: '/admin/instellingen', color: '#6c757d' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>Smart-Tech BV Beheerportaal</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Cards */}
        <Text style={styles.sectionTitle}>Overzicht</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#F5A623" style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderLeftColor: '#3498db' }]}>
              <Ionicons name="people" size={28} color="#3498db" />
              <Text style={styles.statValue}>{stats?.totaalWerknemers || 0}</Text>
              <Text style={styles.statLabel}>Werknemers</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#e67e22' }]}>
              <Ionicons name="business" size={28} color="#e67e22" />
              <Text style={styles.statValue}>{stats?.totaalWerven || 0}</Text>
              <Text style={styles.statLabel}>Werven</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#F5A623' }]}>
              <Ionicons name="document-text" size={28} color="#F5A623" />
              <Text style={styles.statValue}>{stats?.werkbonnenDezeWeek || 0}</Text>
              <Text style={styles.statLabel}>Werkbonnen deze week</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#ffc107' }]}>
              <Ionicons name="time" size={28} color="#ffc107" />
              <Text style={styles.statValue}>{stats?.werkbonnenWachtend || 0}</Text>
              <Text style={styles.statLabel}>Wachtend op handtekening</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#28a745' }]}>
              <Ionicons name="timer" size={28} color="#28a745" />
              <Text style={styles.statValue}>{stats?.totaalUrenDezeWeek || 0}</Text>
              <Text style={styles.statLabel}>Totaal uren deze week</Text>
            </View>
          </View>
        )}

        {/* Quick Menu */}
        <Text style={styles.sectionTitle}>Snelle navigatie</Text>
        <View style={styles.menuGrid}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuCard}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}15` }]}>
                <Ionicons name={item.icon as any} size={28} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color="#6c757d" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A2E',
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F5F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 16,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    minWidth: 160,
    flex: 1,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 4,
  },
  menuGrid: {
    gap: 10,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A2E',
  },
  noAccess: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noAccessText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1A2E',
    marginTop: 16,
  },
  noAccessSub: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
  },
});
