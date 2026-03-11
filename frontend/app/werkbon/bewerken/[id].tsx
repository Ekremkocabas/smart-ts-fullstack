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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, UrenRegel, KmRegel } from '../../../store/appStore';
import { showAlert } from '../../../utils/alerts';

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

const createEmptyKmRegel = (): KmRegel => ({
  maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0,
});

const createEmptyUrenRegel = (naam = ''): UrenRegel => ({
  teamlid_naam: naam,
  maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0,
  afkorting_ma: '', afkorting_di: '', afkorting_wo: '', afkorting_do: '',
  afkorting_vr: '', afkorting_za: '', afkorting_zo: '',
});

export default function BewerkenWerkbonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { fetchWerkbon, updateWerkbon, lastUpdatedWerkbon } = useAppStore();

  const [werkbon, setWerkbon] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [urenRegels, setUrenRegels] = useState<UrenRegel[]>([]);
  const [kmAfstand, setKmAfstand] = useState<KmRegel>(createEmptyKmRegel());
  const [uitgevoerdeWerken, setUitgevoerdeWerken] = useState('');
  const [extraMaterialen, setExtraMaterialen] = useState('');
  const [showAfkortingPicker, setShowAfkortingPicker] = useState<{ index: number; dag: string } | null>(null);

  useEffect(() => {
    loadWerkbon();
  }, [id]);

  const loadWerkbon = async () => {
    setIsLoading(true);
    try {
      const w = await fetchWerkbon(id);
      const data = w || lastUpdatedWerkbon;
      if (data) {
        setWerkbon(data);
        setUrenRegels(data.uren && data.uren.length > 0 ? data.uren : [createEmptyUrenRegel()]);
        setKmAfstand(data.km_afstand || createEmptyKmRegel());
        setUitgevoerdeWerken(data.uitgevoerde_werken || '');
        setExtraMaterialen(data.extra_materialen || '');
      }
    } catch (e) {
      showAlert('Fout', 'Werkbon kon niet worden geladen');
    } finally {
      setIsLoading(false);
    }
  };

  const updateUren = (index: number, dag: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const updated = [...urenRegels];
    updated[index] = { ...updated[index], [dag]: numValue };
    setUrenRegels(updated);
  };

  const updateAfkorting = (index: number, dag: string, value: string) => {
    const afkortingKey = `afkorting_${dag.substring(0, 2)}` as keyof UrenRegel;
    const updated = [...urenRegels];
    updated[index] = { ...updated[index], [afkortingKey]: value };
    if (value) updated[index] = { ...updated[index], [dag]: 0 };
    setUrenRegels(updated);
    setShowAfkortingPicker(null);
  };

  const updateKm = (dag: string, value: string) => {
    setKmAfstand({ ...kmAfstand, [dag]: parseFloat(value) || 0 });
  };

  const addTeamlid = () => setUrenRegels([...urenRegels, createEmptyUrenRegel()]);

  const removeTeamlid = (index: number) => {
    if (urenRegels.length === 1) return;
    setUrenRegels(urenRegels.filter((_, i) => i !== index));
  };

  const updateTeamlidNaam = (index: number, naam: string) => {
    const updated = [...urenRegels];
    updated[index] = { ...updated[index], teamlid_naam: naam };
    setUrenRegels(updated);
  };

  const calcRowTotal = (r: UrenRegel) =>
    r.maandag + r.dinsdag + r.woensdag + r.donderdag + r.vrijdag + r.zaterdag + r.zondag;

  const calcGrandTotal = () => urenRegels.reduce((s, r) => s + calcRowTotal(r), 0);

  const calcKmTotal = () =>
    kmAfstand.maandag + kmAfstand.dinsdag + kmAfstand.woensdag +
    kmAfstand.donderdag + kmAfstand.vrijdag + kmAfstand.zaterdag + kmAfstand.zondag;

  const handleSave = async () => {
    const validRegels = urenRegels.filter(r => r.teamlid_naam.trim());
    if (validRegels.length === 0) {
      showAlert('Fout', 'Voeg minstens één teamlid toe');
      return;
    }
    setIsSaving(true);
    try {
      await updateWerkbon(id, {
        uren: validRegels,
        km_afstand: kmAfstand,
        uitgevoerde_werken: uitgevoerdeWerken,
        extra_materialen: extraMaterialen,
      });
      router.replace(`/werkbon/${id}`);
    } catch (error: any) {
      showAlert('Fout', error.message || 'Kon werkbon niet opslaan');
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

  if (!werkbon) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: '#fff' }}>Werkbon niet gevonden</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Werkbon Bewerken</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Fixed Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.weekBadge}>
                <Text style={styles.weekText}>Week {werkbon.week_nummer} / {werkbon.jaar}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Ionicons name="lock-closed-outline" size={12} color="#aaa" />
                <Text style={styles.statusText}>Niet bewerkbaar</Text>
              </View>
            </View>
            <Text style={styles.klantText}>{werkbon.klant_naam}</Text>
            <Text style={styles.werfText}>{werkbon.werf_naam}</Text>
          </View>

          {/* Uren Table */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uren</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {/* Header Row */}
                <View style={styles.tableRow}>
                  <View style={styles.nameCell}><Text style={styles.tableHeader}>Naam</Text></View>
                  {DAGEN_KORT.map((dag) => (
                    <View key={dag} style={styles.dayCell}>
                      <Text style={styles.tableHeader}>{dag}</Text>
                    </View>
                  ))}
                  <View style={styles.totalCell}><Text style={styles.tableHeader}>Tot.</Text></View>
                  <View style={styles.actionCell} />
                </View>

                {urenRegels.map((regel, index) => (
                  <View key={index} style={styles.tableRow}>
                    <View style={styles.nameCell}>
                      <TextInput
                        style={styles.nameInput}
                        value={regel.teamlid_naam}
                        onChangeText={(v) => updateTeamlidNaam(index, v)}
                        placeholder="Naam"
                        placeholderTextColor="#555"
                      />
                    </View>
                    {DAGEN.map((dag, dagIdx) => {
                      const afkKey = `afkorting_${dag.substring(0, 2)}` as keyof UrenRegel;
                      const afk = regel[afkKey] as string;
                      return (
                        <View key={dag} style={styles.dayCell}>
                          {afk ? (
                            <TouchableOpacity
                              style={styles.afkortingBadge}
                              onPress={() => setShowAfkortingPicker({ index, dag })}
                            >
                              <Text style={styles.afkortingText}>{afk}</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.dayCellInner}>
                              <TextInput
                                style={styles.urenInput}
                                value={regel[dag as keyof UrenRegel] === 0 ? '' : String(regel[dag as keyof UrenRegel])}
                                onChangeText={(v) => updateUren(index, dag, v)}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor="#555"
                              />
                              <TouchableOpacity
                                style={styles.afkortingBtn}
                                onPress={() => setShowAfkortingPicker({ index, dag })}
                              >
                                <Ionicons name="chevron-down" size={10} color="#666" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <View style={styles.totalCell}>
                      <Text style={styles.totalText}>{calcRowTotal(regel)}</Text>
                    </View>
                    <TouchableOpacity style={styles.actionCell} onPress={() => removeTeamlid(index)}>
                      <Ionicons name="remove-circle" size={20} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Grand Total */}
                <View style={[styles.tableRow, styles.totalRow]}>
                  <View style={styles.nameCell}><Text style={styles.grandTotalLabel}>Totaal</Text></View>
                  {DAGEN.map((dag) => (
                    <View key={dag} style={styles.dayCell}>
                      <Text style={styles.grandTotalValue}>
                        {urenRegels.reduce((s, r) => s + (r[dag as keyof UrenRegel] as number || 0), 0) || ''}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.totalCell}>
                    <Text style={[styles.grandTotalValue, { color: '#F5A623' }]}>{calcGrandTotal()}</Text>
                  </View>
                  <View style={styles.actionCell} />
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.addRowBtn} onPress={addTeamlid}>
              <Ionicons name="add-circle-outline" size={18} color="#F5A623" />
              <Text style={styles.addRowText}>Teamlid toevoegen</Text>
            </TouchableOpacity>
          </View>

          {/* KM */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kilometers (heen en terug)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.tableRow}>
                {DAGEN.map((dag, i) => (
                  <View key={dag} style={styles.kmCell}>
                    <Text style={styles.tableHeader}>{DAGEN_KORT[i]}</Text>
                    <TextInput
                      style={styles.urenInput}
                      value={kmAfstand[dag as keyof KmRegel] === 0 ? '' : String(kmAfstand[dag as keyof KmRegel])}
                      onChangeText={(v) => updateKm(dag, v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#555"
                    />
                  </View>
                ))}
                <View style={styles.kmCell}>
                  <Text style={styles.tableHeader}>Tot.</Text>
                  <Text style={[styles.totalText, { marginTop: 6 }]}>{calcKmTotal()}</Text>
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Werkbeschrijving */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uitgevoerde werken</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 100 }]}
              value={uitgevoerdeWerken}
              onChangeText={setUitgevoerdeWerken}
              placeholder="Omschrijving van het werk..."
              placeholderTextColor="#555"
              multiline
            />
          </View>

          {/* Extra Materialen */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Extra materialen</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 80 }]}
              value={extraMaterialen}
              onChangeText={setExtraMaterialen}
              placeholder="Bijv. schroeven, verf, ..."
              placeholderTextColor="#555"
              multiline
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Annuleren</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveText}>Opslaan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Afkorting Picker Modal */}
      <Modal visible={!!showAfkortingPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowAfkortingPicker(null)}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>
              Kies afkorting – {showAfkortingPicker ? DAGEN_KORT[DAGEN.indexOf(showAfkortingPicker.dag)] : ''}
            </Text>
            {AFKORTINGEN.map((afk) => (
              <TouchableOpacity
                key={afk || 'none'}
                style={styles.pickerOption}
                onPress={() => showAfkortingPicker && updateAfkorting(showAfkortingPicker.index, showAfkortingPicker.dag, afk)}
              >
                <Text style={styles.pickerOptionText}>
                  {afk ? `${afk} - ${AFKORTING_LABELS[afk]}` : '— Uren invullen'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: '#fff' },
  content: { flex: 1 },
  infoCard: {
    backgroundColor: '#16213e',
    margin: 16,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#F5A623',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  weekBadge: { backgroundColor: '#2d3a5f', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  weekText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { color: '#aaa', fontSize: 12 },
  klantText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  werfText: { fontSize: 13, color: '#a0a0a0', marginTop: 2 },
  section: {
    backgroundColor: '#16213e',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: { color: '#F5A623', fontSize: 14, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  totalRow: { borderTopWidth: 1, borderTopColor: '#2d3a5f', marginTop: 4, paddingTop: 6 },
  nameCell: { width: 90, paddingRight: 4 },
  dayCell: { width: 50, alignItems: 'center', paddingHorizontal: 2 },
  dayCellInner: { alignItems: 'center' },
  kmCell: { width: 50, alignItems: 'center', paddingHorizontal: 2 },
  totalCell: { width: 36, alignItems: 'center' },
  actionCell: { width: 28, alignItems: 'center' },
  tableHeader: { color: '#aaa', fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  nameInput: {
    color: '#fff',
    fontSize: 13,
    backgroundColor: '#0f1729',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  urenInput: {
    color: '#fff',
    fontSize: 13,
    backgroundColor: '#0f1729',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2d3a5f',
    textAlign: 'center',
    width: 42,
  },
  afkortingBtn: { marginTop: 2, padding: 2 },
  afkortingBadge: {
    backgroundColor: '#F5A623',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  afkortingText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  totalText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  grandTotalLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  grandTotalValue: { color: '#28a745', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addRowText: { color: '#F5A623', fontSize: 14 },
  textInput: {
    backgroundColor: '#0f1729',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2d3a5f',
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5f',
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d3a5f',
    alignItems: 'center',
  },
  cancelText: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#28a745',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  pickerTitle: { color: '#F5A623', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  pickerOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2d3a5f' },
  pickerOptionText: { color: '#fff', fontSize: 14 },
});
