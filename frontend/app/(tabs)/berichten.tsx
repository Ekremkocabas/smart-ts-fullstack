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
  Image,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, apiClient } from '../../context/AuthContext';

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
  bijlagen?: { naam: string; type: string; data?: string; file_id?: string }[];
}

interface Document {
  id: string;
  filename: string;
  url: string;
  type: string;
  uploaded_at: string;
  uploaded_by: string;
}

export default function BerichtenTab() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'berichten' | 'documenten'>('berichten');
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [documenten, setDocumenten] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBericht, setSelectedBericht] = useState<Bericht | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch personal documents from the new API
  const fetchMijnDocumenten = useCallback(async () => {
    if (!user?.id) return [];
    try {
      const res = await apiClient.get('/api/mijn-documenten');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      return (res.data || []).map((doc: any) => ({
        id: doc.id,
        filename: doc.naam || doc.bestandsnaam,
        url: `${API_URL}/api/files/${doc.file_id}`,
        type: doc.type,
        uploaded_at: doc.created_at,
        uploaded_by: doc.uploaded_by_naam,
        beschrijving: doc.beschrijving,
        isPersonalDoc: true,  // Mark as personal document
      }));
    } catch (e) {
      console.error('Error fetching personal documents:', e);
      return [];
    }
  }, [user?.id]);

  const fetchBerichten = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [berichtenRes, unreadRes, personalDocs] = await Promise.all([
        apiClient.get(`/api/berichten?user_id=${user.id}`),
        apiClient.get(`/api/berichten/ongelezen?user_id=${user.id}`),
        fetchMijnDocumenten(),
      ]);
      setBerichten(Array.isArray(berichtenRes.data) ? berichtenRes.data : []);
      setUnreadCount(unreadRes.data?.count || unreadRes.data?.ongelezen || 0);
      
      // Extract documents from berichten with bijlagen (attachments)
      const berichtDocs: Document[] = [];
      (berichtenRes.data || []).forEach((b: Bericht) => {
        if (b.bijlagen && b.bijlagen.length > 0) {
          b.bijlagen.forEach(att => {
            // Build URL: if file_id exists, use GridFS endpoint; otherwise use data URL
            let url = '';
            if (att.file_id) {
              const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
              url = `${API_URL}/api/files/${att.file_id}`;
            } else if (att.data) {
              const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;
              url = `data:${att.type || 'application/octet-stream'};base64,${base64Data}`;
            }
            
            berichtDocs.push({
              id: `${b.id}-${att.naam}`,
              filename: att.naam,
              url: url,
              type: att.type || 'application/octet-stream',
              uploaded_at: b.created_at,
              uploaded_by: b.van_naam,
            });
          });
        }
      });
      
      // Combine personal documents + bericht attachments
      // Personal docs first (they are more important)
      setDocumenten([...personalDocs, ...berichtDocs]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user?.id, fetchMijnDocumenten]);

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
        await apiClient.post(`/api/berichten/${bericht.id}/gelezen?user_id=${user.id}`);
        fetchBerichten();
      } catch (e) { console.error(e); }
    }
  };

  const openDocument = async (doc: Document) => {
    try {
      await Linking.openURL(doc.url);
    } catch (e) {
      Alert.alert('Fout', 'Kan document niet openen');
    }
  };

  const deleteDocument = async (doc: Document) => {
    Alert.alert(
      'Document verwijderen',
      `Weet je zeker dat je "${doc.filename}" wilt verwijderen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove from local state for now (backend deletion can be added later)
              setDocumenten(prev => prev.filter(d => d.id !== doc.id));
            } catch (e) {
              Alert.alert('Fout', 'Kan document niet verwijderen');
            }
          },
        },
      ]
    );
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

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'berichten' && styles.tabActive]}
          onPress={() => setActiveTab('berichten')}
        >
          <Ionicons name="mail-outline" size={18} color={activeTab === 'berichten' ? '#F5A623' : '#6c757d'} />
          <Text style={[styles.tabText, activeTab === 'berichten' && styles.tabTextActive]}>Berichten</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'documenten' && styles.tabActive]}
          onPress={() => setActiveTab('documenten')}
        >
          <Ionicons name="folder-outline" size={18} color={activeTab === 'documenten' ? '#F5A623' : '#6c757d'} />
          <Text style={[styles.tabText, activeTab === 'documenten' && styles.tabTextActive]}>Mijn Documenten</Text>
          {documenten.length > 0 && (
            <View style={styles.docBadge}>
              <Text style={styles.docBadgeText}>{documenten.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : activeTab === 'documenten' ? (
        /* Mijn Documenten Tab */
        documenten.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F5A623']} />}
          >
            <Ionicons name="folder-open-outline" size={64} color="#E8E9ED" />
            <Text style={styles.emptyTitle}>Geen documenten</Text>
            <Text style={styles.emptySubtitle}>Documenten die je ontvangt verschijnen hier</Text>
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.listContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F5A623']} />}
          >
            {documenten.map(doc => (
              <View key={doc.id} style={styles.docCard}>
                <TouchableOpacity style={styles.docInfo} onPress={() => openDocument(doc)}>
                  <Ionicons 
                    name={doc.type?.includes('pdf') ? 'document-text-outline' : 'image-outline'} 
                    size={32} 
                    color="#F5A623" 
                  />
                  <View style={styles.docDetails}>
                    <Text style={styles.docName} numberOfLines={1}>{doc.filename}</Text>
                    <Text style={styles.docMeta}>Van: {doc.uploaded_by} • {formatDate(doc.uploaded_at)}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.docDelete} onPress={() => deleteDocument(doc)}>
                  <Ionicons name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )
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
                  
                  {/* Attachments / Bijlagen */}
                  {selectedBericht.bijlagen && selectedBericht.bijlagen.length > 0 && (
                    <View style={styles.attachmentsContainer}>
                      <Text style={styles.attachmentsTitle}>Bijlagen ({selectedBericht.bijlagen.length})</Text>
                      {selectedBericht.bijlagen.map((att, index) => {
                        // Build URL for opening
                        let url = '';
                        if (att.file_id) {
                          const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
                          url = `${API_URL}/api/files/${att.file_id}`;
                        } else if (att.data) {
                          const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;
                          url = `data:${att.type || 'application/octet-stream'};base64,${base64Data}`;
                        }
                        
                        return (
                          <TouchableOpacity 
                            key={index} 
                            style={styles.attachmentItem}
                            onPress={() => {
                              if (url) {
                                Linking.openURL(url).catch(e => 
                                  Alert.alert('Fout', 'Kan bijlage niet openen')
                                );
                              } else {
                                Alert.alert('Fout', 'Bijlage URL niet beschikbaar');
                              }
                            }}
                          >
                            <Ionicons 
                              name={att.type?.includes('pdf') ? 'document-text-outline' : 'image-outline'} 
                              size={24} 
                              color="#F5A623" 
                            />
                            <Text style={styles.attachmentName} numberOfLines={1}>{att.naam}</Text>
                            <Ionicons name="download-outline" size={20} color="#6c757d" />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
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

  // Tab Selector Styles
  tabSelector: {
    flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#F5A623' },
  tabText: { fontSize: 14, color: '#6c757d', fontWeight: '500' },
  tabTextActive: { color: '#F5A623', fontWeight: '600' },
  docBadge: {
    backgroundColor: '#F5A623', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4,
  },
  docBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Document Styles
  listContainer: { flex: 1, padding: 16 },
  emptySubtitle: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },
  docCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  docInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  docDetails: { flex: 1 },
  docName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  docMeta: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  docDelete: { padding: 8 },

  // Attachment Styles
  attachmentsContainer: { marginTop: 20, paddingHorizontal: 20, paddingBottom: 20 },
  attachmentsTitle: { fontSize: 14, fontWeight: '600', color: '#6c757d', marginBottom: 12 },
  attachmentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F5F6FA', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  attachmentName: { flex: 1, fontSize: 14, color: '#1A1A2E' },
});
