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
import * as DocumentPicker from 'expo-document-picker';

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

type TabType = 'werknemers' | 'onderaannemers' | 'archief' | 'per_werknemer';

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
  gearchiveerd?: boolean;
  bijlagen?: Array<{ naam: string; type: string; data?: string; file_id?: string }>;
}

interface BerichtAttachment {
  naam: string;
  type: string;
  data?: string;
  file_id?: string;
}

interface Werknemer {
  id: string;
  naam: string;
  email: string;
  rol: string;
  actief: boolean;
}

export default function BerichtenAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('werknemers');
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [werknemers, setWerknemers] = useState<Werknemer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedBericht, setSelectedBericht] = useState<Bericht | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'alle' | 'vastgepind' | 'ongelezen'>('alle');
  const [selectedWerknemer, setSelectedWerknemer] = useState<Werknemer | null>(null);

  const [form, setForm] = useState({
    naar_ids: [] as string[],
    is_broadcast: false,
    onderwerp: '',
    inhoud: '',
    vastgepind: false,
    ook_email: false,
    ook_sms: false,
    bijlagen: [] as BerichtAttachment[],
    target_group: 'werknemers' as 'werknemers' | 'onderaannemers' | 'beide',
  });

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      
      if (Platform.OS === 'web') {
        const reader = new FileReader();
        const response = await fetch(file.uri);
        const blob = await response.blob();
        
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          const base64Content = base64Data.split(',')[1] || base64Data;
          
          setForm(prev => ({
            ...prev,
            bijlagen: [...prev.bijlagen, {
              naam: file.name,
              type: file.mimeType || 'application/pdf',
              data: base64Content,
            }],
          }));
        };
        reader.readAsDataURL(blob);
      } else {
        const FileSystem = await import('expo-file-system');
        const base64Data = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        setForm(prev => ({
          ...prev,
          bijlagen: [...prev.bijlagen, {
            naam: file.name,
            type: file.mimeType || 'application/pdf',
            data: base64Data,
          }],
        }));
      }
    } catch (error) {
      console.error('Document pick error:', error);
      alert('Fout bij het laden van het bestand');
    }
  };

  const removeAttachment = (index: number) => {
    setForm(prev => ({
      ...prev,
      bijlagen: prev.bijlagen.filter((_, i) => i !== index),
    }));
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id || 'admin-001';
      const [berichtenRes, usersRes] = await Promise.all([
        apiClient.get(`/api/berichten?user_id=${userId}`),
        apiClient.get('/api/auth/users'),
      ]);
      setBerichten(Array.isArray(berichtenRes.data) ? berichtenRes.data : []);
      setWerknemers(Array.isArray(usersRes.data) ? usersRes.data.filter((u: Werknemer) => u.actief && u.rol !== 'beheerder' && u.rol !== 'admin' && u.rol !== 'master_admin') : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (Platform.OS === 'web' && ['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
      fetchData();
    }
  }, [fetchData, user]);

  // Filter werknemers by type
  const werknemersByType = {
    werknemers: werknemers.filter(w => w.rol === 'worker' || w.rol === 'planner' || w.rol === 'manager'),
    onderaannemers: werknemers.filter(w => w.rol === 'onderaannemer'),
  };

  // Get IDs for current tab's workers
  const getTargetWorkerIds = (): string[] => {
    if (activeTab === 'werknemers') return werknemersByType.werknemers.map(w => w.id);
    if (activeTab === 'onderaannemers') return werknemersByType.onderaannemers.map(w => w.id);
    return [];
  };

  // Filter berichten based on active tab
  const getFilteredBerichten = (): Bericht[] => {
    let filtered = berichten;
    
    // Tab filter
    if (activeTab === 'archief') {
      filtered = filtered.filter(b => b.gearchiveerd === true);
    } else {
      filtered = filtered.filter(b => !b.gearchiveerd);
      
      const targetIds = getTargetWorkerIds();
      if (activeTab === 'werknemers') {
        filtered = filtered.filter(b => 
          b.is_broadcast || 
          (b.naar_id && targetIds.includes(b.naar_id)) ||
          targetIds.includes(b.van_id)
        );
      } else if (activeTab === 'onderaannemers') {
        filtered = filtered.filter(b => 
          b.is_broadcast || 
          (b.naar_id && targetIds.includes(b.naar_id)) ||
          targetIds.includes(b.van_id)
        );
      }
    }
    
    // Filter type
    if (filterType === 'vastgepind') {
      filtered = filtered.filter(b => b.vastgepind);
    } else if (filterType === 'ongelezen') {
      filtered = filtered.filter(b => !b.gelezen_door?.includes(user?.id || ''));
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(b => 
        b.onderwerp.toLowerCase().includes(query) ||
        b.inhoud.toLowerCase().includes(query) ||
        b.van_naam.toLowerCase().includes(query) ||
        (b.naar_naam && b.naar_naam.toLowerCase().includes(query))
      );
    }
    
    // Sort by date (newest first), pinned messages first
    return filtered.sort((a, b) => {
      if (a.vastgepind && !b.vastgepind) return -1;
      if (!a.vastgepind && b.vastgepind) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const openAttachment = async (bijlage: { naam: string; type: string; data?: string; file_id?: string }) => {
    try {
      let url: string;
      
      if (bijlage.file_id) {
        // New GridFS format - open file from server
        url = `${API_URL}/api/files/${bijlage.file_id}`;
      } else if (bijlage.data) {
        // Legacy base64 format
        const base64Data = bijlage.data.includes(',') ? bijlage.data.split(',')[1] : bijlage.data;
        const mimeType = bijlage.type || 'application/octet-stream';
        url = `data:${mimeType};base64,${base64Data}`;
      } else {
        alert('Bijlage niet beschikbaar');
        return;
      }
      
      // Open in new tab (web) or use Linking for native
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        // For native, we would use Linking or WebBrowser
        const { Linking } = await import('react-native');
        Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening attachment:', error);
      alert('Kon bijlage niet openen');
    }
  };

  const openNewMessage = (targetGroup: 'werknemers' | 'onderaannemers' | 'beide' = 'werknemers') => {
    const targetIds = targetGroup === 'werknemers' 
      ? werknemersByType.werknemers.map(w => w.id)
      : targetGroup === 'onderaannemers'
        ? werknemersByType.onderaannemers.map(w => w.id)
        : werknemers.map(w => w.id);
    
    setForm({ 
      naar_ids: [], 
      is_broadcast: false, 
      onderwerp: '', 
      inhoud: '', 
      vastgepind: false, 
      ook_email: false, 
      ook_sms: false, 
      bijlagen: [],
      target_group: targetGroup,
    });
    setSelectedBericht(null);
    setShowModal(true);
  };

  const toggleRecipient = (id: string) => {
    setForm(prev => ({
      ...prev,
      is_broadcast: false,
      naar_ids: prev.naar_ids.includes(id) ? prev.naar_ids.filter(x => x !== id) : [...prev.naar_ids, id],
    }));
  };

  const selectAllInGroup = () => {
    const ids = form.target_group === 'werknemers' 
      ? werknemersByType.werknemers.map(w => w.id)
      : form.target_group === 'onderaannemers'
        ? werknemersByType.onderaannemers.map(w => w.id)
        : werknemers.map(w => w.id);
    setForm(prev => ({ ...prev, is_broadcast: true, naar_ids: ids }));
  };

  const sendBericht = async () => {
    if (!form.onderwerp.trim() || !form.inhoud.trim()) {
      alert('Vul onderwerp en bericht in');
      return;
    }
    if (!form.is_broadcast && form.naar_ids.length === 0) {
      alert('Selecteer minimaal één ontvanger');
      return;
    }
    setSaving(true);
    try {
      const userId = user?.id || 'admin-001';
      const userName = user?.naam || 'Admin';
      
      const selectedWorkerEmails: { id: string; email: string; naam: string }[] = [];
      if (form.ook_email) {
        const targetIds = form.is_broadcast ? form.naar_ids : form.naar_ids;
        targetIds.forEach(id => {
          const w = werknemers.find(x => x.id === id);
          if (w && w.email) selectedWorkerEmails.push({ id: w.id, email: w.email, naam: w.naam });
        });
      }

      if (form.is_broadcast) {
        const body = { naar_id: null, is_broadcast: true, onderwerp: form.onderwerp, inhoud: form.inhoud, vastgepind: form.vastgepind, bijlagen: form.bijlagen };
        await fetch(`${API_URL}/api/berichten?van_id=${userId}&van_naam=${encodeURIComponent(userName)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else {
        for (const naarId of form.naar_ids) {
          const body = { naar_id: naarId, is_broadcast: false, onderwerp: form.onderwerp, inhoud: form.inhoud, vastgepind: form.vastgepind, bijlagen: form.bijlagen };
          await fetch(`${API_URL}/api/berichten?van_id=${userId}&van_naam=${encodeURIComponent(userName)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
        }
      }

      if (form.ook_email && selectedWorkerEmails.length > 0) {
        for (const worker of selectedWorkerEmails) {
          try {
            await fetch(`${API_URL}/api/berichten/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to_email: worker.email,
                to_naam: worker.naam,
                onderwerp: form.onderwerp,
                inhoud: form.inhoud,
                van_naam: userName,
              }),
            });
          } catch (emailErr) { console.error('Email send error:', emailErr); }
        }
      }

      setShowModal(false);
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij verzenden'); }
    finally { setSaving(false); }
  };

  const archiveBericht = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/berichten/${id}`, { 
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gearchiveerd: true }),
      });
      setSelectedBericht(null);
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij archiveren'); }
  };

  const unarchiveBericht = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/berichten/${id}`, { 
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gearchiveerd: false }),
      });
      setSelectedBericht(null);
      fetchData();
    } catch (e) { console.error(e); alert('Fout bij herstellen'); }
  };

  const deleteBericht = async (id: string) => {
    if (!confirm('Weet u zeker dat u dit bericht wilt verwijderen?')) return;
    try {
      await fetch(`${API_URL}/api/berichten/${id}`, { method: 'DELETE' });
      setSelectedBericht(null);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const togglePin = async (bericht: Bericht) => {
    try {
      await fetch(`${API_URL}/api/berichten/${bericht.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vastgepind: !bericht.vastgepind }),
      });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 1) return 'Zojuist';
    if (diffHours < 24) return `${Math.floor(diffHours)}u geleden`;
    if (diffHours < 48) return 'Gisteren';
    return date.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
  };

  const getAvailableRecipients = () => {
    if (form.target_group === 'werknemers') return werknemersByType.werknemers;
    if (form.target_group === 'onderaannemers') return werknemersByType.onderaannemers;
    return werknemers;
  };

  if (Platform.OS !== 'web') return null;

  if (authLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.loadingText}>Laden...</Text>
        </View>
      </View>
    );
  }

  if (!['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
        </View>
      </View>
    );
  }

  const filteredBerichten = getFilteredBerichten();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Berichten</Text>
          <Text style={styles.subtitle}>Communicatie met werknemers en onderaannemers</Text>
        </View>
        <TouchableOpacity 
          style={styles.newBtn} 
          onPress={() => openNewMessage(activeTab === 'onderaannemers' ? 'onderaannemers' : 'werknemers')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>Nieuw bericht</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabs}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'werknemers' && styles.tabActive]}
            onPress={() => setActiveTab('werknemers')}
          >
            <Ionicons name="people" size={18} color={activeTab === 'werknemers' ? '#F5A623' : '#6c757d'} />
            <Text style={[styles.tabText, activeTab === 'werknemers' && styles.tabTextActive]}>
              Werknemers
            </Text>
            <View style={[styles.tabBadge, activeTab === 'werknemers' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'werknemers' && styles.tabBadgeTextActive]}>
                {werknemersByType.werknemers.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, activeTab === 'onderaannemers' && styles.tabActive]}
            onPress={() => setActiveTab('onderaannemers')}
          >
            <Ionicons name="construct" size={18} color={activeTab === 'onderaannemers' ? '#F5A623' : '#6c757d'} />
            <Text style={[styles.tabText, activeTab === 'onderaannemers' && styles.tabTextActive]}>
              Onderaannemers
            </Text>
            <View style={[styles.tabBadge, activeTab === 'onderaannemers' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'onderaannemers' && styles.tabBadgeTextActive]}>
                {werknemersByType.onderaannemers.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, activeTab === 'archief' && styles.tabActive]}
            onPress={() => setActiveTab('archief')}
          >
            <Ionicons name="archive" size={18} color={activeTab === 'archief' ? '#F5A623' : '#6c757d'} />
            <Text style={[styles.tabText, activeTab === 'archief' && styles.tabTextActive]}>
              Archief
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, activeTab === 'per_werknemer' && styles.tabActive]}
            onPress={() => { setActiveTab('per_werknemer'); setSelectedWerknemer(null); }}
          >
            <Ionicons name="folder-open" size={18} color={activeTab === 'per_werknemer' ? '#F5A623' : '#6c757d'} />
            <Text style={[styles.tabText, activeTab === 'per_werknemer' && styles.tabTextActive]}>
              Per Werknemer
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters & Search */}
      <View style={styles.filtersRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#6c757d" />
          <TextInput
            style={styles.searchInput}
            placeholder="Zoeken in berichten..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#6c757d" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filterButtons}>
          <TouchableOpacity 
            style={[styles.filterBtn, filterType === 'alle' && styles.filterBtnActive]}
            onPress={() => setFilterType('alle')}
          >
            <Text style={[styles.filterBtnText, filterType === 'alle' && styles.filterBtnTextActive]}>Alle</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterBtn, filterType === 'vastgepind' && styles.filterBtnActive]}
            onPress={() => setFilterType('vastgepind')}
          >
            <Ionicons name="pin" size={14} color={filterType === 'vastgepind' ? '#fff' : '#6c757d'} />
            <Text style={[styles.filterBtnText, filterType === 'vastgepind' && styles.filterBtnTextActive]}>Vastgepind</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterBtn, filterType === 'ongelezen' && styles.filterBtnActive]}
            onPress={() => setFilterType('ongelezen')}
          >
            <Text style={[styles.filterBtnText, filterType === 'ongelezen' && styles.filterBtnTextActive]}>Ongelezen</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {activeTab === 'per_werknemer' ? (
        /* ===== Per Werknemer View ===== */
        <View style={styles.perWerknemerContainer}>
          {/* Left: Worker List */}
          <View style={styles.werknemerListPanel}>
            <Text style={styles.panelTitle}>Werknemers</Text>
            <ScrollView style={styles.werknemerScroll}>
              {werknemers.filter(w => w.actief).map((wn) => {
                const werknemerBerichten = berichten.filter(
                  b => b.naar_id === wn.id || b.van_id === wn.id || b.is_broadcast
                );
                const unreadCount = werknemerBerichten.filter(
                  b => !b.gelezen_door?.includes(wn.id)
                ).length;
                
                return (
                  <TouchableOpacity
                    key={wn.id}
                    style={[
                      styles.werknemerItem,
                      selectedWerknemer?.id === wn.id && styles.werknemerItemActive
                    ]}
                    onPress={() => setSelectedWerknemer(wn)}
                  >
                    <View style={styles.werknemerAvatar}>
                      <Text style={styles.werknemerAvatarText}>{wn.naam.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.werknemerInfo}>
                      <Text style={styles.werknemerName}>{wn.naam}</Text>
                      <Text style={styles.werknemerRole}>{wn.rol}</Text>
                    </View>
                    {unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                      </View>
                    )}
                    <View style={styles.messageCountBadge}>
                      <Text style={styles.messageCountText}>{werknemerBerichten.length}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Right: Messages for selected worker */}
          <View style={styles.werknemerMessagesPanel}>
            {selectedWerknemer ? (
              <>
                <View style={styles.selectedWerknemerHeader}>
                  <Text style={styles.selectedWerknemerName}>{selectedWerknemer.naam}</Text>
                  <TouchableOpacity 
                    style={styles.sendToWerknemerBtn}
                    onPress={() => {
                      setForm(prev => ({ ...prev, naar_ids: [selectedWerknemer.id], is_broadcast: false }));
                      setShowModal(true);
                    }}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.sendToWerknemerBtnText}>Nieuw bericht</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.werknemerMessagesScroll}>
                  {berichten
                    .filter(b => b.naar_id === selectedWerknemer.id || b.van_id === selectedWerknemer.id || b.is_broadcast)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((bericht) => (
                      <TouchableOpacity
                        key={bericht.id}
                        style={[styles.messageCard, selectedBericht?.id === bericht.id && styles.messageCardSelected]}
                        onPress={() => setSelectedBericht(bericht)}
                      >
                        <View style={styles.messageHeader}>
                          <View style={styles.messageFrom}>
                            <View style={styles.avatar}>
                              <Text style={styles.avatarText}>{bericht.van_naam.charAt(0).toUpperCase()}</Text>
                            </View>
                            <View>
                              <Text style={styles.senderName}>{bericht.van_naam}</Text>
                              <Text style={styles.messageTime}>{formatDate(bericht.created_at)}</Text>
                            </View>
                          </View>
                          {bericht.is_broadcast && (
                            <View style={styles.broadcastBadge}>
                              <Ionicons name="megaphone" size={12} color="#3498db" />
                            </View>
                          )}
                        </View>
                        <Text style={styles.messageSubject}>{bericht.onderwerp}</Text>
                        <Text style={styles.messagePreview} numberOfLines={2}>{bericht.inhoud}</Text>
                      </TouchableOpacity>
                    ))
                  }
                  {berichten.filter(b => b.naar_id === selectedWerknemer.id || b.van_id === selectedWerknemer.id || b.is_broadcast).length === 0 && (
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubble-outline" size={48} color="#E8E9ED" />
                      <Text style={styles.emptyTitle}>Geen berichten</Text>
                      <Text style={styles.emptySubtitle}>Nog geen berichten met {selectedWerknemer.naam}</Text>
                    </View>
                  )}
                </ScrollView>
              </>
            ) : (
              <View style={styles.selectWerknemerPrompt}>
                <Ionicons name="person-circle-outline" size={64} color="#E8E9ED" />
                <Text style={styles.selectWerknemerText}>Selecteer een werknemer</Text>
                <Text style={styles.selectWerknemerSubtext}>Kies een werknemer om hun berichten te bekijken</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        /* ===== Regular View (Werknemers/Onderaannemers/Archief) ===== */
        <View style={styles.content}>
        {/* Messages List */}
        <View style={styles.messagesList}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#F5A623" />
            </View>
          ) : filteredBerichten.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name={activeTab === 'archief' ? 'archive-outline' : 'chatbubbles-outline'} size={64} color="#E8E9ED" />
              <Text style={styles.emptyTitle}>
                {activeTab === 'archief' ? 'Geen gearchiveerde berichten' : 'Geen berichten'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'archief' 
                  ? 'Gearchiveerde berichten verschijnen hier'
                  : `Stuur een bericht naar ${activeTab === 'onderaannemers' ? 'onderaannemers' : 'werknemers'}`
                }
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.messagesScroll}>
              {filteredBerichten.map((bericht) => (
                <TouchableOpacity
                  key={bericht.id}
                  style={[
                    styles.messageCard,
                    selectedBericht?.id === bericht.id && styles.messageCardSelected,
                    bericht.vastgepind && styles.messageCardPinned,
                  ]}
                  onPress={() => setSelectedBericht(bericht)}
                >
                  <View style={styles.messageHeader}>
                    <View style={styles.messageFrom}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{bericht.van_naam.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={styles.senderName}>{bericht.van_naam}</Text>
                        <Text style={styles.messageTime}>{formatDate(bericht.created_at)}</Text>
                      </View>
                    </View>
                    <View style={styles.messageBadges}>
                      {bericht.vastgepind && (
                        <View style={styles.pinBadge}>
                          <Ionicons name="pin" size={12} color="#F5A623" />
                        </View>
                      )}
                      {bericht.is_broadcast && (
                        <View style={styles.broadcastBadge}>
                          <Ionicons name="megaphone" size={12} color="#3498db" />
                        </View>
                      )}
                      {bericht.bijlagen && bericht.bijlagen.length > 0 && (
                        <View style={styles.attachBadge}>
                          <Ionicons name="attach" size={12} color="#6c757d" />
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.messageSubject} numberOfLines={1}>{bericht.onderwerp}</Text>
                  <Text style={styles.messagePreview} numberOfLines={2}>{bericht.inhoud}</Text>
                  {bericht.naar_naam && !bericht.is_broadcast && (
                    <Text style={styles.recipientText}>Aan: {bericht.naar_naam}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Message Detail */}
        <View style={styles.messageDetail}>
          {selectedBericht ? (
            <ScrollView style={styles.detailScroll}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailSubject}>{selectedBericht.onderwerp}</Text>
                <View style={styles.detailMeta}>
                  <Text style={styles.detailFrom}>Van: {selectedBericht.van_naam}</Text>
                  {selectedBericht.naar_naam && (
                    <Text style={styles.detailTo}>Aan: {selectedBericht.naar_naam}</Text>
                  )}
                  {selectedBericht.is_broadcast && (
                    <View style={styles.broadcastTag}>
                      <Ionicons name="megaphone" size={14} color="#3498db" />
                      <Text style={styles.broadcastTagText}>Broadcast</Text>
                    </View>
                  )}
                  <Text style={styles.detailDate}>
                    {new Date(selectedBericht.created_at).toLocaleString('nl-BE')}
                  </Text>
                </View>
              </View>
              
              <View style={styles.detailContent}>
                <Text style={styles.detailText}>{selectedBericht.inhoud}</Text>
              </View>

              {selectedBericht.bijlagen && selectedBericht.bijlagen.length > 0 && (
                <View style={styles.detailAttachments}>
                  <Text style={styles.attachmentsTitle}>Bijlagen ({selectedBericht.bijlagen.length})</Text>
                  {selectedBericht.bijlagen.map((bijlage, idx) => (
                    <TouchableOpacity 
                      key={idx} 
                      style={styles.attachmentItem}
                      onPress={() => openAttachment(bijlage)}
                    >
                      <Ionicons 
                        name={bijlage.type?.includes('pdf') ? 'document-text' : 'image'} 
                        size={20} 
                        color="#3498db" 
                      />
                      <Text style={styles.attachmentName}>{bijlage.naam}</Text>
                      <Ionicons name="open-outline" size={18} color="#6c757d" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.detailActions}>
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: '#F5A62320' }]}
                  onPress={() => togglePin(selectedBericht)}
                >
                  <Ionicons name={selectedBericht.vastgepind ? 'pin' : 'pin-outline'} size={18} color="#F5A623" />
                  <Text style={[styles.actionBtnText, { color: '#F5A623' }]}>
                    {selectedBericht.vastgepind ? 'Losmaken' : 'Vastpinnen'}
                  </Text>
                </TouchableOpacity>

                {activeTab === 'archief' ? (
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: '#28a74520' }]}
                    onPress={() => unarchiveBericht(selectedBericht.id)}
                  >
                    <Ionicons name="arrow-undo" size={18} color="#28a745" />
                    <Text style={[styles.actionBtnText, { color: '#28a745' }]}>Herstellen</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: '#6c757d20' }]}
                    onPress={() => archiveBericht(selectedBericht.id)}
                  >
                    <Ionicons name="archive" size={18} color="#6c757d" />
                    <Text style={[styles.actionBtnText, { color: '#6c757d' }]}>Archiveren</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: '#dc354520' }]}
                  onPress={() => deleteBericht(selectedBericht.id)}
                >
                  <Ionicons name="trash" size={18} color="#dc3545" />
                  <Text style={[styles.actionBtnText, { color: '#dc3545' }]}>Verwijderen</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.noSelection}>
              <Ionicons name="mail-open-outline" size={64} color="#E8E9ED" />
              <Text style={styles.noSelectionText}>Selecteer een bericht om te lezen</Text>
            </View>
          )}
        </View>
      </View>
      )}

      {/* New Message Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nieuw bericht</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#6c757d" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Target Group Selection */}
              <Text style={styles.label}>Verzenden naar</Text>
              <View style={styles.targetGroupRow}>
                <TouchableOpacity 
                  style={[styles.targetGroupBtn, form.target_group === 'werknemers' && styles.targetGroupBtnActive]}
                  onPress={() => setForm(prev => ({ ...prev, target_group: 'werknemers', naar_ids: [], is_broadcast: false }))}
                >
                  <Ionicons name="people" size={16} color={form.target_group === 'werknemers' ? '#fff' : '#6c757d'} />
                  <Text style={[styles.targetGroupText, form.target_group === 'werknemers' && styles.targetGroupTextActive]}>
                    Werknemers ({werknemersByType.werknemers.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.targetGroupBtn, form.target_group === 'onderaannemers' && styles.targetGroupBtnActive]}
                  onPress={() => setForm(prev => ({ ...prev, target_group: 'onderaannemers', naar_ids: [], is_broadcast: false }))}
                >
                  <Ionicons name="construct" size={16} color={form.target_group === 'onderaannemers' ? '#fff' : '#6c757d'} />
                  <Text style={[styles.targetGroupText, form.target_group === 'onderaannemers' && styles.targetGroupTextActive]}>
                    Onderaannemers ({werknemersByType.onderaannemers.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.targetGroupBtn, form.target_group === 'beide' && styles.targetGroupBtnActive]}
                  onPress={() => setForm(prev => ({ ...prev, target_group: 'beide', naar_ids: [], is_broadcast: false }))}
                >
                  <Ionicons name="globe" size={16} color={form.target_group === 'beide' ? '#fff' : '#6c757d'} />
                  <Text style={[styles.targetGroupText, form.target_group === 'beide' && styles.targetGroupTextActive]}>
                    Iedereen ({werknemers.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quick Select */}
              <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllInGroup}>
                <Ionicons name="checkmark-done" size={18} color="#3498db" />
                <Text style={styles.selectAllText}>
                  Selecteer alle {form.target_group === 'werknemers' ? 'werknemers' : form.target_group === 'onderaannemers' ? 'onderaannemers' : 'personen'}
                </Text>
              </TouchableOpacity>

              {/* Recipients List */}
              <Text style={styles.label}>Ontvangers *</Text>
              <View style={styles.recipientsList}>
                {getAvailableRecipients().map(w => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.recipientItem, form.naar_ids.includes(w.id) && styles.recipientItemSelected]}
                    onPress={() => toggleRecipient(w.id)}
                  >
                    <View style={[styles.recipientCheckbox, form.naar_ids.includes(w.id) && styles.recipientCheckboxSelected]}>
                      {form.naar_ids.includes(w.id) && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.recipientName}>{w.naam}</Text>
                    <Text style={styles.recipientRole}>{w.rol}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Message Form */}
              <Text style={styles.label}>Onderwerp *</Text>
              <TextInput
                style={styles.input}
                value={form.onderwerp}
                onChangeText={v => setForm(prev => ({ ...prev, onderwerp: v }))}
                placeholder="Onderwerp van het bericht"
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>Bericht *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.inhoud}
                onChangeText={v => setForm(prev => ({ ...prev, inhoud: v }))}
                placeholder="Schrijf uw bericht..."
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
              />

              {/* Attachments */}
              <Text style={styles.label}>Bijlagen</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={handlePickDocument}>
                <Ionicons name="attach" size={20} color="#3498db" />
                <Text style={styles.uploadBtnText}>PDF of afbeelding toevoegen</Text>
              </TouchableOpacity>
              
              {form.bijlagen.length > 0 && (
                <View style={styles.attachmentsList}>
                  {form.bijlagen.map((bijlage, index) => (
                    <View key={index} style={styles.attachmentRow}>
                      <Ionicons name={bijlage.type.includes('pdf') ? 'document-text' : 'image'} size={18} color="#3498db" />
                      <Text style={styles.attachmentFileName} numberOfLines={1}>{bijlage.naam}</Text>
                      <TouchableOpacity onPress={() => removeAttachment(index)}>
                        <Ionicons name="close-circle" size={20} color="#dc3545" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Options */}
              <View style={styles.optionsRow}>
                <TouchableOpacity 
                  style={[styles.optionBtn, form.vastgepind && styles.optionBtnActive]}
                  onPress={() => setForm(prev => ({ ...prev, vastgepind: !prev.vastgepind }))}
                >
                  <Ionicons name="pin" size={18} color={form.vastgepind ? '#F5A623' : '#6c757d'} />
                  <Text style={[styles.optionText, form.vastgepind && styles.optionTextActive]}>Vastpinnen</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.optionBtn, form.ook_email && styles.optionBtnActive]}
                  onPress={() => setForm(prev => ({ ...prev, ook_email: !prev.ook_email }))}
                >
                  <Ionicons name="mail" size={18} color={form.ook_email ? '#3498db' : '#6c757d'} />
                  <Text style={[styles.optionText, form.ook_email && { color: '#3498db' }]}>Ook via e-mail</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendBtn} onPress={sendBericht} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.sendBtnText}>Versturen</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6c757d' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  title: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3498db', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  
  // Tabs
  tabsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tabs: { flexDirection: 'row', paddingHorizontal: 24 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 20, marginRight: 8, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#F5A623' },
  tabText: { fontSize: 15, color: '#6c757d', fontWeight: '500' },
  tabTextActive: { color: '#1A1A2E', fontWeight: '600' },
  tabBadge: { backgroundColor: '#E8E9ED', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tabBadgeActive: { backgroundColor: '#F5A62320' },
  tabBadgeText: { fontSize: 12, color: '#6c757d', fontWeight: '600' },
  tabBadgeTextActive: { color: '#F5A623' },
  
  // Filters
  filtersRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F6FA', borderRadius: 10, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#1A1A2E' },
  filterButtons: { flexDirection: 'row', gap: 8 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F5F6FA' },
  filterBtnActive: { backgroundColor: '#3498db' },
  filterBtnText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
  filterBtnTextActive: { color: '#fff' },
  
  // Content
  content: { flex: 1, flexDirection: 'row' },
  
  // Messages List
  messagesList: { width: 400, borderRightWidth: 1, borderRightColor: '#E8E9ED', backgroundColor: '#fff' },
  messagesScroll: { flex: 1 },
  messageCard: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  messageCardSelected: { backgroundColor: '#3498db10' },
  messageCardPinned: { backgroundColor: '#F5A62308' },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  messageFrom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3498db20', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '600', color: '#3498db' },
  senderName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  messageTime: { fontSize: 12, color: '#6c757d' },
  messageBadges: { flexDirection: 'row', gap: 6 },
  pinBadge: { padding: 4, backgroundColor: '#F5A62320', borderRadius: 4 },
  broadcastBadge: { padding: 4, backgroundColor: '#3498db20', borderRadius: 4 },
  attachBadge: { padding: 4, backgroundColor: '#6c757d20', borderRadius: 4 },
  messageSubject: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', marginBottom: 4 },
  messagePreview: { fontSize: 13, color: '#6c757d', lineHeight: 18 },
  recipientText: { fontSize: 12, color: '#3498db', marginTop: 6 },
  
  // Empty State
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#6c757d', marginTop: 4, textAlign: 'center' },
  
  // Message Detail
  messageDetail: { flex: 1, backgroundColor: '#fff' },
  detailScroll: { flex: 1, padding: 24 },
  detailHeader: { marginBottom: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  detailSubject: { fontSize: 24, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  detailMeta: { gap: 6 },
  detailFrom: { fontSize: 14, color: '#1A1A2E' },
  detailTo: { fontSize: 14, color: '#6c757d' },
  broadcastTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#3498db20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
  broadcastTagText: { fontSize: 12, color: '#3498db', fontWeight: '500' },
  detailDate: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  detailContent: { marginBottom: 24 },
  detailText: { fontSize: 15, color: '#1A1A2E', lineHeight: 24 },
  detailAttachments: { backgroundColor: '#F5F6FA', borderRadius: 12, padding: 16, marginBottom: 24 },
  attachmentsTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  attachmentItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8 },
  attachmentName: { flex: 1, fontSize: 14, color: '#1A1A2E' },
  detailActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  actionBtnText: { fontSize: 14, fontWeight: '500' },
  
  // No Selection
  noSelection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noSelectionText: { fontSize: 16, color: '#6c757d', marginTop: 16 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  modalBody: { padding: 20, maxHeight: 500 },
  modalFooter: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: '#E8E9ED' },
  
  // Form
  label: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  
  // Target Group
  targetGroupRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  targetGroupBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F6FA', borderWidth: 1, borderColor: '#E8E9ED' },
  targetGroupBtnActive: { backgroundColor: '#3498db', borderColor: '#3498db' },
  targetGroupText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
  targetGroupTextActive: { color: '#fff' },
  
  // Select All
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  selectAllText: { fontSize: 14, color: '#3498db', fontWeight: '500' },
  
  // Recipients
  recipientsList: { maxHeight: 200, borderWidth: 1, borderColor: '#E8E9ED', borderRadius: 10, marginTop: 8 },
  recipientItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  recipientItemSelected: { backgroundColor: '#3498db10' },
  recipientCheckbox: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#E8E9ED', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recipientCheckboxSelected: { backgroundColor: '#3498db' },
  recipientName: { flex: 1, fontSize: 14, color: '#1A1A2E' },
  recipientRole: { fontSize: 12, color: '#6c757d', backgroundColor: '#F5F6FA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  
  // Upload
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3498db15', padding: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#3498db50' },
  uploadBtnText: { fontSize: 14, color: '#3498db', fontWeight: '500' },
  attachmentsList: { marginTop: 8, gap: 6 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6FA', padding: 10, borderRadius: 8 },
  attachmentFileName: { flex: 1, fontSize: 13, color: '#1A1A2E' },
  
  // Options
  optionsRow: { flexDirection: 'row', gap: 16, marginTop: 16 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  optionBtnActive: {},
  optionText: { fontSize: 14, color: '#6c757d' },
  optionTextActive: { color: '#F5A623' },
  
  // Buttons
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, color: '#6c757d', fontWeight: '500' },
  sendBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3498db', padding: 14, borderRadius: 10 },
  sendBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },

  // Per Werknemer View
  perWerknemerContainer: { flex: 1, flexDirection: 'row' },
  werknemerListPanel: { width: 280, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#E8E9ED' },
  panelTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  werknemerScroll: { flex: 1 },
  werknemerItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5F6FA' },
  werknemerItemActive: { backgroundColor: '#F5A62310', borderLeftWidth: 3, borderLeftColor: '#F5A623' },
  werknemerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3498db', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  werknemerAvatarText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  werknemerInfo: { flex: 1 },
  werknemerName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  werknemerRole: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  unreadBadge: { backgroundColor: '#dc3545', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  messageCountBadge: { backgroundColor: '#E8E9ED', borderRadius: 10, minWidth: 24, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  messageCountText: { color: '#6c757d', fontSize: 11, fontWeight: '500' },
  werknemerMessagesPanel: { flex: 1, backgroundColor: '#F5F6FA' },
  selectedWerknemerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  selectedWerknemerName: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  sendToWerknemerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#3498db', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  sendToWerknemerBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  werknemerMessagesScroll: { flex: 1, padding: 16 },
  selectWerknemerPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  selectWerknemerText: { fontSize: 18, fontWeight: '600', color: '#6c757d', marginTop: 16 },
  selectWerknemerSubtext: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
});
