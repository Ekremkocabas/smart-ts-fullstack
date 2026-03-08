import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Klant, Werf, TeamLid, UrenRegel } from '../../store/appStore';
import { useAuth } from '../../context/AuthContext';

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil((diff + start.getDay() * 24 * 60 * 60 * 1000) / oneWeek);
}

export default function NieuweWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    klanten, werven, teamleden,
    fetchKlanten, fetchWerven, fetchTeamleden, fetchWervenByKlant,
    createWerkbon,
  } = useAppStore();

  const [weekNummer, setWeekNummer] = useState(getCurrentWeekNumber());
  const [jaar] = useState(new Date().getFullYear());
  const [selectedKlant, setSelectedKlant] = useState<Klant | null>(null);
  const [klantWerven, setKlantWerven] = useState<Werf[]>([]);
  const [selectedWerf, setSelectedWerf] = useState<Werf | null>(null);
  const [urenRegels, setUrenRegels] = useState<UrenRegel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([fetchKlanten(), fetchWerven(), fetchTeamleden()]);
    setIsLoading(false);
  };

  useEffect(() => {
    // Initialize uren regels with team members
    if (teamleden.length > 0 && urenRegels.length === 0) {
      const regels = teamleden.map(lid => ({
        teamlid_naam: lid.naam,
        maandag: 0,
        dinsdag: 0,
        woensdag: 0,
        donderdag: 0,
        vrijdag: 0,
        zaterdag: 0,
        zondag: 0,
      }));
      setUrenRegels(regels);
    }
  }, [teamleden]);

  const handleKlantSelect = async (klant: Klant) => {
    setSelectedKlant(klant);
    setSelectedWerf(null);
    const wervenData = await fetchWervenByKlant(klant.id);
    setKlantWerven(wervenData);
  };

  const updateUren = (index: number, dag: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const updatedRegels = [...urenRegels];
    updatedRegels[index] = {
      ...updatedRegels[index],
      [dag]: numValue,
    };
    setUrenRegels(updatedRegels);
  };

  const addTeamlid = () => {
    setUrenRegels([
      ...urenRegels,
      {
        teamlid_naam: '',
        maandag: 0,
        dinsdag: 0,
        woensdag: 0,
        donderdag: 0,
        vrijdag: 0,
        zaterdag: 0,
        zondag: 0,
      },
    ]);
  };

  const removeTeamlid = (index: number) => {
    const updated = urenRegels.filter((_, i) => i !== index);
    setUrenRegels(updated);
  };

  const updateTeamlidNaam = (index: number, naam: string) => {
    const updated = [...urenRegels];
    updated[index] = { ...updated[index], teamlid_naam: naam };
    setUrenRegels(updated);
  };

  const handleSave = async () => {
    if (!selectedKlant || !selectedWerf) {
      Alert.alert('Fout', 'Selecteer een klant en werf');
      return;
    }

    const validRegels = urenRegels.filter(r => r.teamlid_naam.trim());
    if (validRegels.length === 0) {
      Alert.alert('Fout', 'Voeg minstens één teamlid toe');
      return;
    }

    setIsSaving(true);
    try {
      const werkbon = await createWerkbon(
        {
          week_nummer: weekNummer,
          jaar,
          klant_id: selectedKlant.id,
          werf_id: selectedWerf.id,
          uren: validRegels,
        },
        user?.id || '',
        user?.naam || ''
      );
      router.replace(`/werkbon/${werkbon.id}`);
    } catch (error: any) {
      Alert.alert('Fout', error.message || 'Kon werkbon niet opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Nieuwe Werkbon</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Week Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Week</Text>
            <View style={styles.weekSelector}>
              <TouchableOpacity
                style={styles.weekButton}
                onPress={() => setWeekNummer(Math.max(1, weekNummer - 1))}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={styles.weekDisplay}>
                <Text style={styles.weekNumber}>Week {weekNummer}</Text>
                <Text style={styles.weekYear}>{jaar}</Text>
              </View>
              <TouchableOpacity
                style={styles.weekButton}
                onPress={() => setWeekNummer(Math.min(52, weekNummer + 1))}
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Klant Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Klant</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.optionList}>
                {klanten.map((klant) => (
                  <TouchableOpacity
                    key={klant.id}
                    style={[
                      styles.optionButton,
                      selectedKlant?.id === klant.id && styles.optionButtonActive
                    ]}
                    onPress={() => handleKlantSelect(klant)}
                  >
                    <Text style={[
                      styles.optionText,
                      selectedKlant?.id === klant.id && styles.optionTextActive
                    ]}>
                      {klant.naam}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {klanten.length === 0 && (
              <Text style={styles.emptyText}>Geen klanten gevonden. Voeg eerst een klant toe in Beheer.</Text>
            )}
          </View>

          {/* Werf Selection */}
          {selectedKlant && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Werf</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.optionList}>
                  {klantWerven.map((werf) => (
                    <TouchableOpacity
                      key={werf.id}
                      style={[
                        styles.optionButton,
                        selectedWerf?.id === werf.id && styles.optionButtonActive
                      ]}
                      onPress={() => setSelectedWerf(werf)}
                    >
                      <Text style={[
                        styles.optionText,
                        selectedWerf?.id === werf.id && styles.optionTextActive
                      ]}>
                        {werf.naam}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {klantWerven.length === 0 && (
                <Text style={styles.emptyText}>Geen werven voor deze klant. Voeg eerst een werf toe.</Text>
              )}
            </View>
          )}

          {/* Uren Table */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Uren</Text>
              <TouchableOpacity style={styles.addButton} onPress={addTeamlid}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addButtonText}>Toevoegen</Text>
              </TouchableOpacity>
            </View>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <View style={styles.nameColumn}>
                <Text style={styles.headerText}>Naam</Text>
              </View>
              {DAGEN_KORT.map((dag) => (
                <View key={dag} style={styles.dayColumn}>
                  <Text style={styles.headerText}>{dag}</Text>
                </View>
              ))}
            </View>

            {/* Table Rows */}
            {urenRegels.map((regel, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.nameColumn}>
                  <TextInput
                    style={styles.nameInput}
                    value={regel.teamlid_naam}
                    onChangeText={(text) => updateTeamlidNaam(index, text)}
                    placeholder="Naam"
                    placeholderTextColor="#6c757d"
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeTeamlid(index)}
                  >
                    <Ionicons name="close-circle" size={18} color="#dc3545" />
                  </TouchableOpacity>
                </View>
                {DAGEN.map((dag) => (
                  <View key={dag} style={styles.dayColumn}>
                    <TextInput
                      style={styles.urenInput}
                      value={regel[dag as keyof UrenRegel]?.toString() || ''}
                      onChangeText={(text) => updateUren(index, dag, text)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#6c757d"
                    />
                  </View>
                ))}
              </View>
            ))}

            {urenRegels.length === 0 && (
              <Text style={styles.emptyText}>Voeg teamleden toe</Text>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Opslaan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  weekButton: {
    width: 44,
    height: 44,
    backgroundColor: '#16213e',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDisplay: {
    alignItems: 'center',
  },
  weekNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  weekYear: {
    fontSize: 14,
    color: '#6c757d',
  },
  optionList: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  optionButtonActive: {
    backgroundColor: '#F5A623',
    borderColor: '#F5A623',
  },
  optionText: {
    color: '#a0a0a0',
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#fff',
  },
  emptyText: {
    color: '#6c757d',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5A623',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  headerText: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  nameColumn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 4,
  },
  removeButton: {
    padding: 4,
  },
  urenInput: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#2d3a5f',
    borderRadius: 4,
    width: 32,
    height: 32,
    padding: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5f',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5A623',
    padding: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
