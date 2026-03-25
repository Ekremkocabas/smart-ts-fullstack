import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, apiClient } from '../../context/AuthContext';

interface Document {
  id: string;
  naam: string;
  bestandsnaam: string;
  type: string;
  file_id: string;
  uploaded_by_naam: string;
  beschrijving?: string;
  created_at: string;
}

export default function DocumentenTab() {
  const { user } = useAuth();
  const [documenten, setDocumenten] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDocumenten = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await apiClient.get('/api/mijn-documenten');
      setDocumenten(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error fetching documenten:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchDocumenten(); }, [fetchDocumenten]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDocumenten();
    setRefreshing(false);
  };

  const openDocument = async (doc: Document) => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const url = `${baseUrl}/api/files/${doc.file_id}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert('Fout', 'Kan document niet openen');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
    } catch { return dateStr; }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Mijn Documenten</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mijn Documenten</Text>
          <Text style={styles.subtitle}>
            {documenten.length > 0 ? `${documenten.length} document${documenten.length !== 1 ? 'en' : ''}` : 'Geen documenten'}
          </Text>
        </View>
      </View>

      {documenten.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F5A623']} tintColor="#F5A623" />}
        >
          <Ionicons name="folder-open-outline" size={64} color="#E8E9ED" />
          <Text style={styles.emptyTitle}>Geen documenten</Text>
          <Text style={styles.emptySubtitle}>Documenten die u ontvangt verschijnen hier</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F5A623']} tintColor="#F5A623" />}
        >
          {documenten.map(doc => (
            <TouchableOpacity key={doc.id} style={styles.docCard} onPress={() => openDocument(doc)}>
              <View style={styles.iconContainer}>
                <Ionicons
                  name={doc.type?.includes('pdf') ? 'document-text' : doc.type?.includes('image') ? 'image' : 'document'}
                  size={28}
                  color="#F5A623"
                />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docName} numberOfLines={1}>{doc.naam || doc.bestandsnaam}</Text>
                {doc.beschrijving ? (
                  <Text style={styles.docDesc} numberOfLines={1}>{doc.beschrijving}</Text>
                ) : null}
                <Text style={styles.docMeta}>
                  Van: {doc.uploaded_by_naam || 'Onbekend'} • {formatDate(doc.created_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C4C4C4" />
            </TouchableOpacity>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },
  list: { flex: 1 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#FFF8E7', justifyContent: 'center', alignItems: 'center',
  },
  docInfo: { flex: 1 },
  docName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  docDesc: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  docMeta: { fontSize: 12, color: '#adb5bd', marginTop: 4 },
});
