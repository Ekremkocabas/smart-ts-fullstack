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
import { useAppStore, Klant, Werf, Team, UrenRegel, KmRegel, WeekDates } from '../../store/appStore';
import { useAuth } from '../../context/AuthContext';
import { showAlert } from '../../utils/alerts';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const AFKORTINGEN = ['', 'Z', 'V', 'BV', 'BF'];
const AFKORTING_LABELS: { [key: string]: string } = {
  '': '-',
  'Z': 'Ziek',
  'V': 'Verlof',
  'BV': 'Bet. Verlof',
  'BF': 'Bet. Feestdag',
};

function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil((diff + start.getDay() * 24 * 60 * 60 * 1000) / oneWeek);
}

const createEmptyUrenRegel = (naam: string = ''): UrenRegel => ({
  teamlid_naam: naam,
  maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0,
  afkorting_ma: '', afkorting_di: '', afkorting_wo: '', afkorting_do: '',
  afkorting_vr: '', afkorting_za: '', afkorting_zo: '',
});

const createEmptyKmRegel = (): KmRegel => ({
  maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0,
});

export default function NieuweWerkbonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    klanten, werven, teams,
    fetchKlanten, fetchWerven, fetchTeams, fetchWervenByKlant, fetchWeekDates,
    createWerkbon,
  } = useAppStore();

  const [weekNummer, setWeekNummer] = useState(getCurrentWeekNumber());
  const [jaar] = useState(new Date().getFullYear());
  const [weekDates, setWeekDates] = useState<WeekDates | null>(null);
  const [selectedKlant, setSelectedKlant] = useState<Klant | null>(null);
  const [klantWerven, setKlantWerven] = useState<Werf[]>([]);
  const [selectedWerf, setSelectedWerf] = useState<Werf | null>(null);
  const [urenRegels, setUrenRegels] = useState<UrenRegel[]>([]);
  const [kmAfstand, setKmAfstand] = useState<KmRegel>(createEmptyKmRegel());
  const [uitgevoerdeWerken, setUitgevoerdeWerken] = useState('');
  const [extraMaterialen, setExtraMaterialen] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAfkortingPicker, setShowAfkortingPicker] = useState<{index: number, dag: string} | null>(null);
  const [gpsOpPdf, setGpsOpPdf] = useState(false);

  // Planning suggestions
  const [planningItems, setPlanningItems] = useState<any[]>([]);
  const [showPlanningSuggesties, setShowPlanningSuggesties] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadWeekDates();
  }, [weekNummer, jaar]);

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([fetchKlanten(), fetchWerven(), fetchTeams()]);
    setIsLoading(false);
    // Fetch planning for current week after data loads
    if (user?.id) {
      fetchPlanning();
    }
  };

  const fetchPlanning = async () => {
    try {
      const res = await fetch(`${API_URL}/api/planning/werknemer/${user?.id}?week_nummer=${weekNummer}&jaar=${jaar}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPlanningItems(data);
        }
      }
    } catch (e) {
      console.error('Planning fetch error:', e);
    }
  };

  const applyPlanningItem = async (item: any) => {
    // Find klant from klanten list
    const klant = klanten.find(k => k.id === item.klant_id);
    if (klant) {
      setSelectedKlant(klant);
      const wervenData = await fetchWervenByKlant(klant.id);
      setKlantWerven(wervenData);
      // Find werf
      const werf = wervenData.find((w: Werf) => w.id === item.werf_id);
      if (werf) {
        setSelectedWerf(werf);
      }
    }
    // Pre-fill team members from planning
    if (item.werknemer_namen && item.werknemer_namen.length > 0) {
      const regels = item.werknemer_namen.map((naam: string) => createEmptyUrenRegel(naam));
      setUrenRegels(regels);
    }
    setShowPlanningSuggesties(false);
    showAlert('Planning geladen', `${item.klant_naam} — ${item.werf_naam} is automatisch ingevuld.`);
  };

  const loadWeekDates = async () => {
    try {
      const dates = await fetchWeekDates(jaar, weekNummer);
      setWeekDates(dates);
    } catch (error) {
      console.error('Error loading week dates:', error);
    }
  };

  useEffect(() => {
    // Initialize with user's team if assigned
    if (user?.team_id && teams.length > 0) {
      const userTeam = teams.find(t => t.id === user.team_id);
      if (userTeam && userTeam.leden.length > 0 && urenRegels.length === 0) {
        const regels = userTeam.leden.map(naam => createEmptyUrenRegel(naam));
        setUrenRegels(regels);
      }
    } else if (urenRegels.length === 0 && user?.naam) {
      // Start with user's own name pre-filled
      setUrenRegels([createEmptyUrenRegel(user.naam)]);
    } else if (urenRegels.length === 0) {
      // Fallback: Start with one empty row
      setUrenRegels([createEmptyUrenRegel()]);
    }
  }, [teams, user]);

  const handleKlantSelect = async (klant: Klant) => {
    setSelectedKlant(klant);
    setSelectedWerf(null);
    const wervenData = await fetchWervenByKlant(klant.id);
    setKlantWerven(wervenData);
  };

  const updateUren = (index: number, dag: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const updatedRegels = [...urenRegels];
    updatedRegels[index] = { ...updatedRegels[index], [dag]: numValue };
    setUrenRegels(updatedRegels);
  };

  const updateAfkorting = (index: number, dag: string, value: string) => {
    const afkortingKey = `afkorting_${dag.substring(0, 2)}` as keyof UrenRegel;
    const updatedRegels = [...urenRegels];
    updatedRegels[index] = { ...updatedRegels[index], [afkortingKey]: value };
    // Clear hours if afkorting is set
    if (value) {
      updatedRegels[index] = { ...updatedRegels[index], [dag]: 0 };
    }
    setUrenRegels(updatedRegels);
    setShowAfkortingPicker(null);
  };

  const updateKm = (dag: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setKmAfstand({ ...kmAfstand, [dag]: numValue });
  };

  const addTeamlid = () => {
    setUrenRegels([...urenRegels, createEmptyUrenRegel()]);
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

  const calculateRowTotal = (regel: UrenRegel): number => {
    return regel.maandag + regel.dinsdag + regel.woensdag + 
           regel.donderdag + regel.vrijdag + regel.zaterdag + regel.zondag;
  };

  const calculateGrandTotal = (): number => {
    return urenRegels.reduce((sum, regel) => sum + calculateRowTotal(regel), 0);
  };

  const calculateKmTotal = (): number => {
    return kmAfstand.maandag + kmAfstand.dinsdag + kmAfstand.woensdag +
           kmAfstand.donderdag + kmAfstand.vrijdag + kmAfstand.zaterdag + kmAfstand.zondag;
  };

  const handleSave = async () => {
    if (!selectedKlant || !selectedWerf) {
      showAlert('Fout', 'Selecteer een klant en werf');
      return;
    }

    const validRegels = urenRegels.filter(r => r.teamlid_naam.trim());
    if (validRegels.length === 0) {
      showAlert('Fout', 'Voeg minstens één teamlid toe');
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
          km_afstand: kmAfstand,
          uitgevoerde_werken: uitgevoerdeWerken,
          extra_materialen: extraMaterialen,
          gps_op_pdf: gpsOpPdf,
        },
        user?.id || '',
        user?.naam || ''
      );
      router.replace(`/werkbon/${werkbon.id}`);
    } catch (error: any) {
      showAlert('Fout', error.message || 'Kon werkbon niet opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  const getDateForDay = (dag: string): string => {
    if (!weekDates) return '';
    const key = `datum_${dag}` as keyof WeekDates;
    return weekDates[key] || '';
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
          <TouchableOpacity testID="werkbon-create-back-button" onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Nieuwe Werkbon</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Planning Suggestions Banner */}
          {planningItems.length > 0 && showPlanningSuggesties && (
            <View style={styles.planningBanner}>
              <View style={styles.planningBannerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar-outline" size={18} color="#3498db" />
                  <Text style={styles.planningBannerTitle}>Planning suggesties (week {weekNummer})</Text>
                </View>
                <TouchableOpacity onPress={() => setShowPlanningSuggesties(false)}>
                  <Ionicons name="close" size={20} color="#6c757d" />
                </TouchableOpacity>
              </View>
              <Text style={styles.planningBannerSubtitle}>Tik op een planning om klant, werf en teamleden automatisch in te vullen</Text>
              {planningItems.map((item, idx) => (
                <TouchableOpacity
                  key={item.id || idx}
                  style={styles.planningItem}
                  onPress={() => applyPlanningItem(item)}
                >
                  <View style={styles.planningItemLeft}>
                    <View style={styles.planningDagBadge}>
                      <Text style={styles.planningDagText}>{item.dag?.substring(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planningItemKlant}>{item.klant_naam}</Text>
                      <Text style={styles.planningItemWerf}>{item.werf_naam}</Text>
                      {item.werknemer_namen && item.werknemer_namen.length > 0 && (
                        <Text style={styles.planningItemWerknemers}>
                          👥 {item.werknemer_namen.slice(0, 3).join(', ')}{item.werknemer_namen.length > 3 ? '...' : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={24} color="#3498db" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Week Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Week</Text>
            <View style={styles.weekSelector}>
              <TouchableOpacity
                testID="week-decrement-button"
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
                testID="week-increment-button"
                style={styles.weekButton}
                onPress={() => setWeekNummer(Math.min(52, weekNummer + 1))}
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {/* Week dates display */}
            {weekDates && (
              <View style={styles.datesRow}>
                {DAGEN_KORT.map((dag, i) => (
                  <View key={dag} style={styles.dateCell}>
                    <Text style={styles.dateText}>{dag}</Text>
                    <Text style={styles.dateValue}>{getDateForDay(DAGEN[i])}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Klant Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Klant</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.optionList}>
                {klanten.map((klant) => (
                  <TouchableOpacity
                    testID={`klant-select-button-${klant.id}`}
                    key={klant.id}
                    style={[styles.optionButton, selectedKlant?.id === klant.id && styles.optionButtonActive]}
                    onPress={() => handleKlantSelect(klant)}
                  >
                    <Text style={[styles.optionText, selectedKlant?.id === klant.id && styles.optionTextActive]}>
                      {klant.naam}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {klanten.length === 0 && (
              <Text style={styles.emptyText}>Geen klanten. Admin moet eerst klanten toevoegen.</Text>
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
                      testID={`werf-select-button-${werf.id}`}
                      key={werf.id}
                      style={[styles.optionButton, selectedWerf?.id === werf.id && styles.optionButtonActive]}
                      onPress={() => setSelectedWerf(werf)}
                    >
                      <Text style={[styles.optionText, selectedWerf?.id === werf.id && styles.optionTextActive]}>
                        {werf.naam}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {klantWerven.length === 0 && (
                <Text style={styles.emptyText}>Geen werven voor deze klant.</Text>
              )}
            </View>
          )}

          {/* Effectief Gewerkte Uren */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Effectief Gewerkte Uren</Text>
              <TouchableOpacity testID="teamlid-add-button" style={styles.addButton} onPress={addTeamlid}>
                <Ionicons name="add" size={18} color="#000" />
                <Text style={styles.addButtonText}>Toevoegen</Text>
              </TouchableOpacity>
            </View>

            {/* Table Header */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tableHeader}>
                  <View style={styles.nameColumnWide}>
                    <Text style={styles.headerText}>Werknemer</Text>
                  </View>
                  {DAGEN_KORT.map((dag) => (
                    <View key={dag} style={styles.dayColumnSmall}>
                      <Text style={styles.headerText}>{dag}</Text>
                    </View>
                  ))}
                  <View style={styles.totalColumn}>
                    <Text style={styles.headerText}>Tot</Text>
                  </View>
                </View>

                {/* Table Rows */}
                {urenRegels.map((regel, index) => (
                  <View key={index} style={styles.tableRow}>
                    <View style={styles.nameColumnWide}>
                      <TextInput
                        testID={`teamlid-name-input-${index}`}
                        style={styles.nameInput}
                        value={regel.teamlid_naam}
                        onChangeText={(text) => updateTeamlidNaam(index, text)}
                        placeholder="Naam"
                        placeholderTextColor="#6c757d"
                      />
                      <TouchableOpacity testID={`teamlid-remove-button-${index}`} style={styles.removeButton} onPress={() => removeTeamlid(index)}>
                        <Ionicons name="close-circle" size={18} color="#dc3545" />
                      </TouchableOpacity>
                    </View>
                    {DAGEN.map((dag, dayIndex) => {
                      const afkortingKey = `afkorting_${dag.substring(0, 2)}` as keyof UrenRegel;
                      const afkorting = regel[afkortingKey] as string;
                      return (
                        <View key={dag} style={styles.dayColumnSmall}>
                          {afkorting ? (
                            <TouchableOpacity
                              style={styles.afkortingBadge}
                              onPress={() => setShowAfkortingPicker({ index, dag })}
                            >
                              <Text style={styles.afkortingText}>{afkorting}</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.urenInputContainer}>
                              <TextInput
                                style={styles.urenInput}
                                value={regel[dag as keyof UrenRegel]?.toString() || ''}
                                onChangeText={(text) => updateUren(index, dag, text)}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#6c757d"
                              />
                              <TouchableOpacity
                                style={styles.afkortingTrigger}
                                onPress={() => setShowAfkortingPicker({ index, dag })}
                              >
                                <Ionicons name="ellipsis-horizontal" size={12} color="#6c757d" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <View style={styles.totalColumn}>
                      <Text style={styles.totalText}>{calculateRowTotal(regel)}</Text>
                    </View>
                  </View>
                ))}

                {/* Grand Total Row */}
                <View style={styles.grandTotalRow}>
                  <View style={styles.nameColumnWide}>
                    <Text style={styles.grandTotalLabel}>Totaal Uren</Text>
                  </View>
                  {DAGEN.map((dag) => (
                    <View key={dag} style={styles.dayColumnSmall}>
                      <Text style={styles.dayTotalText}>
                        {urenRegels.reduce((sum, r) => sum + (r[dag as keyof UrenRegel] as number || 0), 0)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.totalColumn}>
                    <Text style={styles.grandTotalValue}>{calculateGrandTotal()}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Afkorting Legend */}
            <View style={styles.legendContainer}>
              <Text style={styles.legendTitle}>Afkortingen:</Text>
              <View style={styles.legendItems}>
                {AFKORTINGEN.filter(a => a).map(afk => (
                  <Text key={afk} style={styles.legendItem}>{afk}: {AFKORTING_LABELS[afk]}</Text>
                ))}
              </View>
            </View>
          </View>

          {/* KM Afstand */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>KM Afstand (per dag)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.kmRow}>
                {DAGEN.map((dag, i) => (
                  <View key={dag} style={styles.kmCell}>
                    <Text style={styles.kmLabel}>{DAGEN_KORT[i]}</Text>
                    <TextInput
                      style={styles.kmInput}
                      value={kmAfstand[dag as keyof KmRegel]?.toString() || ''}
                      onChangeText={(text) => updateKm(dag, text)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#6c757d"
                    />
                  </View>
                ))}
                <View style={styles.kmCell}>
                  <Text style={styles.kmLabel}>Tot</Text>
                  <View style={styles.kmTotalBox}>
                    <Text style={styles.kmTotalText}>{calculateKmTotal()}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Uitgevoerde Werken */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uitgevoerde Werken</Text>
            <TextInput
              style={styles.textArea}
              value={uitgevoerdeWerken}
              onChangeText={setUitgevoerdeWerken}
              placeholder="Beschrijf de uitgevoerde werkzaamheden..."
              placeholderTextColor="#6c757d"
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Extra Materialen */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gebruikte Extra Materialen</Text>
            <TextInput
              style={styles.textArea}
              value={extraMaterialen}
              onChangeText={setExtraMaterialen}
              placeholder="Lijst van extra gebruikte materialen (indien van toepassing)..."
              placeholderTextColor="#6c757d"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* GPS Toggle */}
          <View style={styles.section}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1.5, borderColor: gpsOpPdf ? '#3498db' : '#E8E9ED' }}
              onPress={() => setGpsOpPdf(!gpsOpPdf)}
            >
              <Ionicons name={gpsOpPdf ? 'location' : 'location-outline'} size={22} color={gpsOpPdf ? '#3498db' : '#6c757d'} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: '#1A1A2E', fontWeight: '500' }}>GPS locatie op PDF tonen</Text>
                <Text style={{ fontSize: 12, color: '#6c757d', marginTop: 2 }}>Locatiegegevens worden aan de PDF toegevoegd</Text>
              </View>
              <View style={{ width: 48, height: 26, borderRadius: 13, backgroundColor: gpsOpPdf ? '#3498db' : '#E8E9ED', padding: 2, justifyContent: 'center' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: gpsOpPdf ? 'flex-end' : 'flex-start' }} />
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Afkorting Picker Modal */}
        {showAfkortingPicker && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>Selecteer Afkorting</Text>
              {AFKORTINGEN.map(afk => (
                <TouchableOpacity
                  key={afk || 'none'}
                  style={styles.pickerOption}
                  onPress={() => updateAfkorting(showAfkortingPicker.index, showAfkortingPicker.dag, afk)}
                >
                  <Text style={styles.pickerOptionText}>
                    {afk ? `${afk} - ${AFKORTING_LABELS[afk]}` : 'Geen (uren invoeren)'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.pickerCancel}
                onPress={() => setShowAfkortingPicker(null)}
              >
                <Text style={styles.pickerCancelText}>Annuleren</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            testID="werkbon-create-save-button"
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#000" />
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
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 24, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  weekSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  weekButton: { width: 44, height: 44, backgroundColor: '#F5A623', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  weekDisplay: { alignItems: 'center' },
  weekNumber: { fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' },
  weekYear: { fontSize: 14, color: '#6c757d' },
  datesRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, backgroundColor: '#F7F8FA', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  dateCell: { alignItems: 'center' },
  dateText: { fontSize: 12, color: '#6c757d', fontWeight: '600' },
  dateValue: { fontSize: 12, color: '#1A1A2E', marginTop: 2 },
  optionList: { flexDirection: 'row', gap: 8 },
  optionButton: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED' },
  optionButtonActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  optionText: { color: '#4D5560', fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#000' },
  emptyText: { color: '#6c757d', fontSize: 14, textAlign: 'center', marginTop: 8 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5A623', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: '#000', fontSize: 14, fontWeight: '500' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F1F3F6', borderRadius: 10, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E8E9ED' },
  headerText: { color: '#4D5560', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  tableRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 8, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  nameColumnWide: { width: 120, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayColumnSmall: { width: 40, alignItems: 'center' },
  totalColumn: { width: 45, alignItems: 'center' },
  nameInput: { flex: 1, color: '#1A1A2E', fontSize: 12, padding: 2 },
  removeButton: { padding: 4 },
  urenInputContainer: { position: 'relative' },
  urenInput: { color: '#1A1A2E', fontSize: 12, textAlign: 'center', backgroundColor: '#F7F8FA', borderRadius: 4, width: 32, height: 32, padding: 4, borderWidth: 1, borderColor: '#E8E9ED' },
  afkortingTrigger: { position: 'absolute', bottom: -2, right: -2 },
  afkortingBadge: { backgroundColor: '#F5A623', borderRadius: 4, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  afkortingText: { color: '#000', fontSize: 10, fontWeight: '700' },
  totalText: { color: '#F5A623', fontSize: 14, fontWeight: '600' },
  grandTotalRow: { flexDirection: 'row', backgroundColor: '#F1F3F6', borderRadius: 10, padding: 8, marginTop: 4, borderWidth: 1, borderColor: '#E8E9ED' },
  grandTotalLabel: { color: '#1A1A2E', fontSize: 12, fontWeight: '600' },
  dayTotalText: { color: '#4D5560', fontSize: 12 },
  grandTotalValue: { color: '#F5A623', fontSize: 16, fontWeight: 'bold' },
  legendContainer: { marginTop: 12, backgroundColor: '#F7F8FA', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  legendTitle: { color: '#4D5560', fontSize: 12, marginBottom: 4 },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { color: '#6c757d', fontSize: 11 },
  kmRow: { flexDirection: 'row', gap: 8 },
  kmCell: { alignItems: 'center' },
  kmLabel: { color: '#4D5560', fontSize: 12, marginBottom: 4 },
  kmInput: { color: '#1A1A2E', fontSize: 14, textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, width: 50, height: 40, borderWidth: 1, borderColor: '#E8E9ED' },
  kmTotalBox: { backgroundColor: '#F5A623', borderRadius: 8, width: 50, height: 40, alignItems: 'center', justifyContent: 'center' },
  kmTotalText: { color: '#000', fontSize: 14, fontWeight: '600' },
  textArea: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, color: '#1A1A2E', fontSize: 14, borderWidth: 1, borderColor: '#E8E9ED', minHeight: 100, textAlignVertical: 'top' },
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 300 },
  pickerTitle: { color: '#1A1A2E', fontSize: 18, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  pickerOption: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  pickerOptionText: { color: '#1A1A2E', fontSize: 16 },
  pickerCancel: { padding: 16, marginTop: 8 },
  pickerCancelText: { color: '#dc3545', fontSize: 16, textAlign: 'center' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E8E9ED', backgroundColor: '#FFFFFF' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5A623', padding: 16, borderRadius: 12 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#000', fontSize: 16, fontWeight: '600' },
  // Planning suggestions
  planningBanner: { backgroundColor: '#EBF5FB', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: '#3498db30' },
  planningBannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planningBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  planningBannerSubtitle: { fontSize: 12, color: '#6c757d', marginBottom: 12 },
  planningItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#3498db20', justifyContent: 'space-between' },
  planningItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  planningDagBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3498db15', alignItems: 'center', justifyContent: 'center' },
  planningDagText: { fontSize: 11, fontWeight: '700', color: '#3498db' },
  planningItemKlant: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  planningItemWerf: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  planningItemWerknemers: { fontSize: 11, color: '#3498db', marginTop: 2 },
});
