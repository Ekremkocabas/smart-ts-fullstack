import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, apiClient } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface BillitSettings {
  billit_api_key: string;
  billit_party_id: string;
  billit_omschrijving_template: string;
  billit_referentie_veld: string;
  billit_actief: boolean;
  billit_auto_versturen: boolean;
}

const DEFAULT_SETTINGS: BillitSettings = {
  billit_api_key: '',
  billit_party_id: '',
  billit_omschrijving_template: 'Werkzaamheden week {week} - {werf}',
  billit_referentie_veld: 'Reference',
  billit_actief: false,
  billit_auto_versturen: false,
};

const REFERENTIE_OPTIONS = [
  { value: 'Reference', label: 'Reference (PO nummer veld)' },
  { value: 'OrderTitle', label: 'OrderTitle (Titel veld)' },
];

export default function BillitKoppelingScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [settings, setSettings] = useState<BillitSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [referentieOpen, setReferentieOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/api/instellingen/facturatie');
      const data = res.data;
      setSettings({
        billit_api_key: data.billit_api_key || '',
        billit_party_id: data.billit_party_id || '',
        billit_omschrijving_template: data.billit_omschrijving_template || DEFAULT_SETTINGS.billit_omschrijving_template,
        billit_referentie_veld: data.billit_referentie_veld || 'Reference',
        billit_actief: data.billit_actief ?? false,
        billit_auto_versturen: data.billit_auto_versturen ?? false,
      });
    } catch (e) {
      console.error('Fout bij laden Billit instellingen:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings.billit_api_key.trim()) {
      alert('Vul een Billit API Key in.');
      return;
    }
    if (!settings.billit_omschrijving_template.trim()) {
      alert('Vul een omschrijving template in.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put('/api/instellingen/facturatie', {
        billit_api_key: settings.billit_api_key.trim(),
        billit_party_id: settings.billit_party_id.trim() ? parseInt(settings.billit_party_id.trim(), 10) : null,
        billit_omschrijving_template: settings.billit_omschrijving_template.trim(),
        billit_referentie_veld: settings.billit_referentie_veld,
        billit_actief: settings.billit_actief,
        billit_auto_versturen: settings.billit_auto_versturen,
      });
      if (typeof window !== 'undefined') {
        alert('Billit koppeling opgeslagen!');
      }
    } catch (e: any) {
      console.error('Fout bij opslaan:', e);
      alert('Fout bij opslaan: ' + (e?.response?.data?.detail || e?.message || 'Onbekende fout'));
    } finally {
      setSaving(false);
    }
  };

  const disconnectBillit = async () => {
    if (!confirm('Weet u zeker dat u de Billit koppeling wil verwijderen?')) return;
    setSaving(true);
    try {
      await apiClient.put('/api/instellingen/facturatie', {
        billit_api_key: null,
        billit_actief: false,
        billit_auto_versturen: false,
      });
      setSettings({ ...settings, billit_api_key: '', billit_actief: false, billit_auto_versturen: false });
    } catch (e: any) {
      alert('Fout bij verwijderen: ' + (e?.message || 'Onbekende fout'));
    } finally {
      setSaving(false);
    }
  };

  if (Platform.OS !== 'web') return null;

  const canAccess = ['beheerder', 'admin', 'master_admin'].includes(user?.rol || '');
  if (!canAccess) {
    return (
      <View style={styles.noAccess}>
        <Ionicons name="lock-closed-outline" size={48} color="#6c757d" />
        <Text style={styles.noAccessText}>Geen toegang</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#0066CC" />
      </View>
    );
  }

  const selectedRef = REFERENTIE_OPTIONS.find(o => o.value === settings.billit_referentie_veld) || REFERENTIE_OPTIONS[0];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/admin/facturatie-koppeling' as any)}>
          <Ionicons name="arrow-back" size={22} color={theme.primaryColor || '#22C55E'} />
        </TouchableOpacity>
        <View style={styles.headerIcon}>
          <Text style={styles.headerLetter}>B</Text>
        </View>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: theme.secondaryColor || '#0F172A' }]}>Billit Koppeling</Text>
          <Text style={styles.subtitle}>Facturatie integratie instellen</Text>
        </View>
        {settings.billit_actief && (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#28a745" />
            <Text style={styles.activeBadgeText}>Actief</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* API Key section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Verbinding</Text>

          <Text style={styles.label}>Billit API Key *</Text>
          <View style={styles.apiKeyRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={settings.billit_api_key}
              onChangeText={(v) => setSettings({ ...settings, billit_api_key: v })}
              placeholder="Plak hier uw Billit API Key"
              placeholderTextColor="#6c757d"
              secureTextEntry={!showApiKey}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowApiKey(!showApiKey)}>
              <Ionicons name={showApiKey ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6c757d" />
            </TouchableOpacity>
          </View>
          <View style={styles.helpBox}>
            <Ionicons name="information-circle-outline" size={16} color="#0066CC" />
            <Text style={styles.helpText}>
              Te vinden in MyBillit → Rechtsboven op uw naam klikken → Mijn profiel → onderaan de pagina bij "API" sectie. Klik op het oogje om de key te tonen en kopieer deze volledig.
            </Text>
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Party ID</Text>
          <TextInput
            style={styles.input}
            value={settings.billit_party_id}
            onChangeText={(v) => setSettings({ ...settings, billit_party_id: v.replace(/[^0-9]/g, '') })}
            placeholder="bijv. 12345"
            placeholderTextColor="#6c757d"
            keyboardType="numeric"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.helpBox}>
            <Ionicons name="information-circle-outline" size={16} color="#0066CC" />
            <Text style={styles.helpText}>
              Te vinden in de URL van MyBillit wanneer u ingelogd bent. Ga naar Mijn bedrijf en kijk in de adresbalk van uw browser: my.billit.be/Manage/XXXXXXX/CompanyEdit — het getal tussen /Manage/ en /CompanyEdit is uw Party ID.
            </Text>
          </View>
        </View>

        {/* Factuur instellingen */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Factuur instellingen</Text>

          <Text style={styles.label}>Omschrijving op factuur *</Text>
          <TextInput
            style={styles.input}
            value={settings.billit_omschrijving_template}
            onChangeText={(v) => setSettings({ ...settings, billit_omschrijving_template: v })}
            placeholder="Werkzaamheden week {week} - {werf}"
            placeholderTextColor="#6c757d"
          />
          <View style={styles.helpBox}>
            <Ionicons name="information-circle-outline" size={16} color="#0066CC" />
            <Text style={styles.helpText}>
              Deze tekst verschijnt als omschrijving op de factuur. U kunt variabelen gebruiken: <Text style={styles.tag}>{'{week}'}</Text> = weeknummer, <Text style={styles.tag}>{'{jaar}'}</Text> = jaar, <Text style={styles.tag}>{'{werf}'}</Text> = werfnaam, <Text style={styles.tag}>{'{klant}'}</Text> = klantnaam. Voorbeeld: "Werkzaamheden week {'{week}'} - {'{werf}'}"
            </Text>
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Werkbon nr plaatsen in *</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setReferentieOpen(!referentieOpen)}
          >
            <Text style={styles.dropdownText}>{selectedRef.label}</Text>
            <Ionicons name={referentieOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#6c757d" />
          </TouchableOpacity>
          {referentieOpen && (
            <View style={styles.dropdownMenu}>
              {REFERENTIE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.dropdownItem, settings.billit_referentie_veld === opt.value && styles.dropdownItemActive]}
                  onPress={() => {
                    setSettings({ ...settings, billit_referentie_veld: opt.value });
                    setReferentieOpen(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, settings.billit_referentie_veld === opt.value && styles.dropdownItemTextActive]}>
                    {opt.label}
                  </Text>
                  {settings.billit_referentie_veld === opt.value && (
                    <Ionicons name="checkmark" size={16} color="#0066CC" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={[styles.helpBox, { marginTop: 8 }]}>
            <Ionicons name="information-circle-outline" size={16} color="#0066CC" />
            <Text style={styles.helpText}>
              Reference = het PO-nummer veld op de factuur. OrderTitle = het titel veld. Kies wat uw klant verwacht te zien als werkbon referentie.
            </Text>
          </View>
        </View>

        {/* Versturen opties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verstuur opties</Text>

          {/* Koppeling actief toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Billit koppeling activeren</Text>
              <Text style={styles.toggleDesc}>Schakel de koppeling met Billit in of uit</Text>
            </View>
            <Switch
              value={settings.billit_actief}
              onValueChange={(v) => setSettings({ ...settings, billit_actief: v, billit_auto_versturen: v ? settings.billit_auto_versturen : false })}
              trackColor={{ false: '#E8E9ED', true: '#0066CC' }}
              thumbColor="#fff"
            />
          </View>

          {/* Auto versturen toggle */}
          <View style={[styles.toggleRow, !settings.billit_actief && styles.toggleRowDisabled]}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleLabel, !settings.billit_actief && styles.textDisabled]}>
                Werkbon automatisch naar Billit sturen na verzenden
              </Text>
              <Text style={[styles.toggleDesc, !settings.billit_actief && styles.textDisabled]}>
                Aan: werkbon wordt automatisch naar Billit gestuurd na verzenden. Uit: er verschijnt een handmatig verstuur-icoon naast elke werkbon op de werkbonnen pagina.
              </Text>
            </View>
            <Switch
              value={settings.billit_auto_versturen}
              onValueChange={(v) => setSettings({ ...settings, billit_auto_versturen: v })}
              disabled={!settings.billit_actief}
              trackColor={{ false: '#E8E9ED', true: '#0066CC' }}
              thumbColor="#fff"
            />
          </View>

          {/* Info over handmatig */}
          {settings.billit_actief && !settings.billit_auto_versturen && (
            <View style={[styles.helpBox, { marginTop: 12 }]}>
              <Ionicons name="hand-left-outline" size={16} color={theme.primaryColor || '#22C55E'} />
              <Text style={[styles.helpText, { color: '#7A5200' }]}>
                Handmatige modus: naast elke verzonden werkbon verschijnt een Billit-icoon waarmee u de werkbon apart naar Billit kunt sturen.
              </Text>
            </View>
          )}
        </View>

        {/* Save button */}
        <TouchableOpacity style={styles.saveBtn} onPress={saveSettings} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Koppeling Opslaan</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Disconnect button */}
        {settings.billit_actief && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectBillit} disabled={saving}>
            <Ionicons name="unlink-outline" size={18} color="#dc3545" />
            <Text style={styles.disconnectText}>Koppeling verwijderen</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#0F172A', marginTop: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E6F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerLetter: { fontSize: 20, fontWeight: '800', color: '#0066CC' },
  headerCenter: { flex: 1 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#6c757d' },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  activeBadgeText: { fontSize: 12, fontWeight: '600', color: '#28a745' },

  // Content
  content: { padding: 16, maxWidth: 700, alignSelf: 'center', width: '100%' },

  // Section
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A', marginBottom: 16 },

  // Form
  label: { fontSize: 13, fontWeight: '600', color: '#0F172A', marginBottom: 6 },
  input: {
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  apiKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },

  // Help box
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  helpText: { flex: 1, fontSize: 12, color: '#0F172A', lineHeight: 18 },
  helpLink: { color: '#0066CC', fontWeight: '600' },
  tag: {
    backgroundColor: '#E0E8FF',
    color: '#0044AA',
    fontFamily: 'monospace',
    fontSize: 11,
    paddingHorizontal: 4,
    borderRadius: 3,
  },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  dropdownText: { fontSize: 15, color: '#0F172A' },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
  },
  dropdownItemActive: { backgroundColor: '#F0F7FF' },
  dropdownItemText: { fontSize: 14, color: '#0F172A' },
  dropdownItemTextActive: { color: '#0066CC', fontWeight: '600' },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
    gap: 12,
  },
  toggleRowDisabled: { opacity: 0.5 },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  toggleDesc: { fontSize: 12, color: '#6c757d', marginTop: 2, lineHeight: 17 },
  textDisabled: { color: '#adb5bd' },

  // Save button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0066CC',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Disconnect
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dc3545',
    marginBottom: 40,
  },
  disconnectText: { color: '#dc3545', fontSize: 14, fontWeight: '600' },
});
