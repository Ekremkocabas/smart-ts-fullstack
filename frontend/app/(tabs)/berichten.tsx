import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Bericht {
  id: string;
  van_id: string;
  van_naam: string;
  naar_id?: string;
  naar_naam?: string;
  is_broadcast: boolean;
  onderwerp: string;
  inhoud: string;
  vastgepind: boolean;
  gelezen_door: string[];
  created_at: string;
}

export default function BerichtenTab() {
  const { user } = useAuth();
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBericht, setSelectedBericht] = useState<Bericht | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchBerichten = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [berichtenRes, unreadRes] = await Promise.all([
        fetch(`${API_URL}/api/berichten?user_id=${user.id}`),
        fetch(`${API_URL}/api/berichten/ongelezen?user_id=${user.id}`),
      ]);
      const data = await berichtenRes.json();
      const unread = await unreadRes.json();
      setBerichten(Array.isArray(data) ? data : []);
      setUnreadCount(unread?.count || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { fetchBerichten(); }, [fetchBerichten]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBerichten();
    setRefreshing(false);
  };

  const openBericht = async (bericht: Bericht) => {
    setSelectedBericht(bericht);
    // Mark as read
    if (user?.id && !bericht.gelezen_door.includes(user.id)) {
      try {
        await fetch(`${API_URL}/api/berichten/${bericht.id}/gelezen?user_id=${user.id}`, { method: 'POST' });
        fetchBerichten();
      } catch (e) { console.error(e); }
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m geleden`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}u geleden`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d geleden`;
      return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
    } catch { return dateStr; }
  };

  const isUnread = (bericht: Bericht) => user?.id ? !bericht.gelezen_door.includes(user.id) : false;

  // Sort: pinned first, then by date
  const sorted = [...berichten].sort((a, b) => {
    if (a.vastgepind && !b.vastgepind) return -1;
    if (!a.vastgepind && b.vastgepind) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Berichten</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0 ? `${unreadCount} ongelezen` : 'Alle berichten gelezen'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : berichten.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />}
        >
          <Ionicons name="chatbubbles-outline" size={64} color="#E8E9ED" />
          <Text style={styles.emptyTitle}>Geen berichten</Text>
          <Text style={styles.emptySubtext}>U heeft nog geen berichten ontvangen</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />}
        >
          {sorted.map(bericht => {
            const unread = isUnread(bericht);
            return (
              <TouchableOpacity
                key={bericht.id}
                style={[styles.berichtCard, unread && styles.berichtUnread, bericht.vastgepind && styles.berichtPinned]}
                activeOpacity={0.7}
                onPress={() => openBericht(bericht)}
              >
                <View style={styles.berichtHeader}>
                  <View style={[styles.berichtAvatar, unread && { backgroundColor: '#F5A623' }]}>
                    <Text style={[styles.berichtAvatarText, unread && { color: '#fff' }]}>{bericht.van_naam?.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.berichtNameRow}>
                      <Text style={[styles.berichtFrom, unread && { fontWeight: '700' }]}>{bericht.van_naam}</Text>
                      {bericht.vastgepind && <Ionicons name="pin" size={14} color="#F5A623" />}
                      {unread && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.berichtTime}>{formatDate(bericht.created_at)}</Text>
                  </View>
                </View>
                <Text style={[styles.berichtSubject, unread && { fontWeight: '700' }]} numberOfLines={1}>{bericht.onderwerp}</Text>
                <Text style={styles.berichtPreview} numberOfLines={2}>{bericht.inhoud}</Text>
                {bericht.is_broadcast && (
                  <View style={styles.broadcastBadge}>
                    <Ionicons name="megaphone-outline" size={12} color="#3498db" />
                    <Text style={styles.broadcastText}>Alle werknemers</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!selectedBericht} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedBericht && (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedBericht(null)}>
                    <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle} numberOfLines={1}>Bericht</Text>
                </View>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.detailMeta}>
                    <View style={styles.detailAvatar}>
                      <Text style={styles.detailAvatarText}>{selectedBericht.van_naam?.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailFrom}>{selectedBericht.van_naam}</Text>
                      <Text style={styles.detailDate}>{formatDate(selectedBericht.created_at)}</Text>
                    </View>
                  </View>
                  <Text style={styles.detailSubject}>{selectedBericht.onderwerp}</Text>
                  <Text style={styles.detailInhoud}>{selectedBericht.inhoud}</Text>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  unreadBadge: {
    backgroundColor: '#dc3545', width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 400 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },

  scrollView: { flex: 1, padding: 16 },

  berichtCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  berichtUnread: { borderLeftWidth: 3, borderLeftColor: '#F5A623' },
  berichtPinned: { borderColor: '#F5A62350', backgroundColor: '#FFFCF5' },
  berichtHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  berichtAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F5A62320', alignItems: 'center', justifyContent: 'center',
  },
  berichtAvatarText: { fontSize: 16, fontWeight: '600', color: '#F5A623' },
  berichtNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  berichtFrom: { fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  berichtTime: { fontSize: 12, color: '#999', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F5A623' },
  berichtSubject: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  berichtPreview: { fontSize: 14, color: '#6c757d', lineHeight: 20 },
  broadcastBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#3498db10', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, alignSelf: 'flex-start', marginTop: 8,
  },
  broadcastText: { fontSize: 11, color: '#3498db', fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: '#F5F6FA' },
  modalContent: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  modalCloseBtn: { padding: 4 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', flex: 1 },

  detailMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingBottom: 12 },
  detailAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#F5A62320', alignItems: 'center', justifyContent: 'center',
  },
  detailAvatarText: { fontSize: 20, fontWeight: '600', color: '#F5A623' },
  detailFrom: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  detailDate: { fontSize: 13, color: '#999', marginTop: 2 },
  detailSubject: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', paddingHorizontal: 20, marginBottom: 12 },
  detailInhoud: { fontSize: 16, color: '#1A1A2E', lineHeight: 24, paddingHorizontal: 20 },
});
