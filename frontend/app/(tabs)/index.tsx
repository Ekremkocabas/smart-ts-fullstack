import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Werkbon } from '../../store/appStore';
import { useAuth } from '../../context/AuthContext';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'concept':
      return '#ffc107';
    case 'ondertekend':
      return '#28a745';
    case 'verzonden':
      return '#F5A623';
    default:
      return '#6c757d';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'concept':
      return 'Concept';
    case 'ondertekend':
      return 'Ondertekend';
    case 'verzonden':
      return 'Verzonden';
    default:
      return status;
  }
};

export default function WerkbonnenScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { werkbonnen, fetchWerkbonnen, isLoading } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchWerkbonnen();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWerkbonnen();
    setRefreshing(false);
  };

  const renderWerkbon = ({ item }: { item: Werkbon }) => {
    const totalUren = item.uren.reduce((sum, regel) => {
      return sum + regel.maandag + regel.dinsdag + regel.woensdag + 
             regel.donderdag + regel.vrijdag + regel.zaterdag + regel.zondag;
    }, 0);

    return (
      <TouchableOpacity
        testID="werkbon-card"
        style={styles.werkbonCard}
        onPress={() => router.push(`/werkbon/${item.id}`)}
      >
        <View style={styles.werkbonHeader}>
          <View style={styles.weekBadge}>
            <Text style={styles.weekText}>Week {item.week_nummer}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
        <Text style={styles.klantNaam}>{item.klant_naam}</Text>
        <Text style={styles.werfNaam}>{item.werf_naam}</Text>
        <View style={styles.werkbonFooter}>
          <View style={styles.infoItem}>
            <Ionicons name="people-outline" size={16} color="#6c757d" />
            <Text style={styles.infoText}>{item.uren.length} personen</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={16} color="#6c757d" />
            <Text style={styles.infoText}>{totalUren} uur</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Werkbonnen</Text>
        <TouchableOpacity
          testID="werkbon-add-button"
          style={styles.addButton}
          onPress={() => router.push('/werkbon/nieuw')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading && werkbonnen.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : werkbonnen.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#6c757d" />
          <Text style={styles.emptyText}>Nog geen werkbonnen</Text>
          <Text style={styles.emptySubtext}>Maak een nieuwe werkbon aan</Text>
          <TouchableOpacity
            testID="empty-state-werkbon-add-button"
            style={styles.emptyButton}
            onPress={() => router.push('/werkbon/nieuw')}
          >
            <Text style={styles.emptyButtonText}>Nieuwe Werkbon</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={werkbonnen}
          renderItem={renderWerkbon}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F5A623"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#F5A623',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
  },
  emptyButton: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  werkbonCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  werkbonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekBadge: {
    backgroundColor: '#2d3a5f',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  weekText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  klantNaam: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  werfNaam: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  werkbonFooter: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#6c757d',
  },
});
