/**
 * Archived UI: "Recent aangemaakte werkbonnen" block previously shown on the dashboard.
 * Not imported anywhere — kept as reference if you want to restore a recent list elsewhere.
 *
 * Data was driven by GET /api/dashboard/recent-werkbonnen (limit 20).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// Example shape — was used with recentWerkbonnen state from dashboard.tsx
export type ArchivedRecentWerkbon = {
  id: string;
  klant_naam: string;
  werf_naam: string;
  ingevuld_door_naam?: string;
  week_nummer: number;
  status: string;
};

export function ArchivedRecentWerkbonnenSection({ items }: { items: ArchivedRecentWerkbon[] }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept':
        return '#ffc107';
      case 'ondertekend':
        return '#28a745';
      case 'verzonden':
        return '#22C55E';
      default:
        return '#6c757d';
    }
  };

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent aangemaakte werkbonnen</Text>
        <TouchableOpacity onPress={() => router.push('/admin/werkbonnen' as any)}>
          <Text style={styles.viewAllLink}>Bekijk alle</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.recentList}>
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#E8E9ED" />
            <Text style={styles.emptyText}>Geen recente werkbonnen</Text>
          </View>
        ) : (
          items.map((wb) => (
            <TouchableOpacity
              key={wb.id}
              style={styles.recentCard}
              onPress={() => router.push(`/admin/werkbon-detail?id=${wb.id}` as any)}
            >
              <View style={styles.recentCardLeft}>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekBadgeText}>W{wb.week_nummer}</Text>
                </View>
                <View>
                  <Text style={styles.recentKlant}>{wb.klant_naam}</Text>
                  <Text style={styles.recentWerf}>{wb.werf_naam}</Text>
                  <Text style={styles.recentMeta}>{wb.ingevuld_door_naam}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wb.status) }]}>
                <Text style={styles.statusText}>{wb.status}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 16,
  },
  viewAllLink: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '500',
  },
  recentList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    marginBottom: 32,
    overflow: 'hidden',
  },
  recentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  recentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weekBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#22C55E15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
  recentKlant: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  recentWerf: {
    fontSize: 13,
    color: '#6c757d',
  },
  recentMeta: {
    fontSize: 12,
    color: '#adb5bd',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 12,
  },
});
