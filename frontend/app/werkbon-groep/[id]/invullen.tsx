import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, useAuth } from '../../../context/AuthContext';
import { showAlert } from '../../../utils/alerts';

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;
const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

type Dag = typeof DAGEN[number];

interface UrenRegel {
  teamlidNaam: string;
  teamlidId?: string;
  maandag: number; dinsdag: number; woensdag: number; donderdag: number;
  vrijdag: number; zaterdag: number; zondag: number;
  afkortingMa: string; afkortingDi: string; afkortingWo: string; afkortingDo: string;
  afkortingVr: string; afkortingZa: string; afkortingZo: string;
}

interface KmRegel {
  maandag: number; dinsdag: number; woensdag: number; donderdag: number;
  vrijdag: number; zaterdag: number; zondag: number;
}

interface WeekData {
  werkbon_id: string;
  week_nummer: number;
  jaar: number;
  datum_maandag?: string;
  datum_zondag?: string;
  uren: UrenRegel[];
  km_afstand: KmRegel;
  uitgevoerde_werken: string;
  extra_materialen: string;
  // collapse state purely for UI
  expanded: boolean;
}

interface GroepResponse {
  id: string;
  periode_van: string;
  periode_tot: string;
  klant_naam: string;
  werf_naam: string;
  status: string;
  werkbonnen: Array<{
    id: string;
    week_nummer: number;
    jaar: number;
    datum_maandag?: string;
    datum_zondag?: string;
    uren?: any[];
    km_afstand?: any;
    uitgevoerde_werken?: string;
    extra_materialen?: string;
  }>;
}

function emptyKm(): KmRegel {
  return { maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0 };
}

function emptyRegel(naam: string, id?: string): UrenRegel {
  return {
    teamlidNaam: naam,
    teamlidId: id,
    maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0,
    vrijdag: 0, zaterdag: 0, zondag: 0,
    afkortingMa: '', afkortingDi: '', afkortingWo: '', afkortingDo: '',
    afkortingVr: '', afkortingZa: '', afkortingZo: '',
  };
}

function normalizeUren(raw: any[], fallbackNaam: string, fallbackId?: string): UrenRegel[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [emptyRegel(fallbackNaam, fallbackId)];
  }
  return raw.map((r) => ({
    teamlidNaam: r.teamlidNaam || r.teamlid_naam || '',
    teamlidId: r.teamlidId || r.teamlid_id,
    maandag: Number(r.maandag) || 0,
    dinsdag: Number(r.dinsdag) || 0,
    woensdag: Number(r.woensdag) || 0,
    donderdag: Number(r.donderdag) || 0,
    vrijdag: Number(r.vrijdag) || 0,
    zaterdag: Number(r.zaterdag) || 0,
    zondag: Number(r.zondag) || 0,
    afkortingMa: r.afkortingMa || '', afkortingDi: r.afkortingDi || '',
    afkortingWo: r.afkortingWo || '', afkortingDo: r.afkortingDo || '',
    afkortingVr: r.afkortingVr || '', afkortingZa: r.afkortingZa || '',
    afkortingZo: r.afkortingZo || '',
  }));
}

function normalizeKm(raw: any): KmRegel {
  if (!raw || typeof raw !== 'object') return emptyKm();
  return {
    maandag: Number(raw.maandag) || 0,
    dinsdag: Number(raw.dinsdag) || 0,
    woensdag: Number(raw.woensdag) || 0,
    donderdag: Number(raw.donderdag) || 0,
    vrijdag: Number(raw.vrijdag) || 0,
    zaterdag: Number(raw.zaterdag) || 0,
    zondag: Number(raw.zondag) || 0,
  };
}

function weekTotal(regels: UrenRegel[]): number {
  let t = 0;
  for (const r of regels) for (const d of DAGEN) t += r[d];
  return Math.round(t * 10) / 10;
}

export default function WerkbonGroepInvullen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [groep, setGroep] = useState<GroepResponse | null>(null);
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/werkbon-groepen/${id}`);
      const data: GroepResponse = res.data;
      setGroep(data);
      const fallbackNaam = user?.naam || '';
      const fallbackId = user?.id;
      const mapped: WeekData[] = (data.werkbonnen || []).map((w, idx) => ({
        werkbon_id: w.id,
        week_nummer: w.week_nummer,
        jaar: w.jaar,
        datum_maandag: w.datum_maandag,
        datum_zondag: w.datum_zondag,
        uren: normalizeUren(w.uren || [], fallbackNaam, fallbackId),
        km_afstand: normalizeKm(w.km_afstand),
        uitgevoerde_werken: w.uitgevoerde_werken || '',
        extra_materialen: w.extra_materialen || '',
        expanded: idx === 0,
      }));
      setWeeks(mapped);
    } catch (e: any) {
      console.error('[werkbon-groep/invullen] fetch failed', e);
      showAlert('Fout', 'Kon maand-werkbon niet laden');
    } finally {
      setLoading(false);
    }
  }, [id, user?.naam, user?.id]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (weekIdx: number) => {
    setWeeks(prev => prev.map((w, i) => i === weekIdx ? { ...w, expanded: !w.expanded } : w));
  };

  const updateRegel = (weekIdx: number, regelIdx: number, patch: Partial<UrenRegel>) => {
    setWeeks(prev => prev.map((w, i) => {
      if (i !== weekIdx) return w;
      return {
        ...w,
        uren: w.uren.map((r, j) => j === regelIdx ? { ...r, ...patch } : r),
      };
    }));
  };

  const addRegel = (weekIdx: number) => {
    setWeeks(prev => prev.map((w, i) => i === weekIdx
      ? { ...w, uren: [...w.uren, emptyRegel('', undefined)] }
      : w
    ));
  };

  const removeRegel = (weekIdx: number, regelIdx: number) => {
    setWeeks(prev => prev.map((w, i) => i === weekIdx
      ? { ...w, uren: w.uren.length > 1 ? w.uren.filter((_, j) => j !== regelIdx) : w.uren }
      : w
    ));
  };

  const updateKm = (weekIdx: number, dag: Dag, value: number) => {
    setWeeks(prev => prev.map((w, i) => i === weekIdx
      ? { ...w, km_afstand: { ...w.km_afstand, [dag]: value } }
      : w
    ));
  };

  const updateText = (weekIdx: number, field: 'uitgevoerde_werken' | 'extra_materialen', value: string) => {
    setWeeks(prev => prev.map((w, i) => i === weekIdx ? { ...w, [field]: value } : w));
  };

  // Copy week 1's uren rows + descriptions to all weeks (km left per-week)
  const copyFromFirstWeek = () => {
    if (weeks.length < 2) return;
    const src = weeks[0];
    setWeeks(prev => prev.map((w, i) => i === 0 ? w : ({
      ...w,
      uren: src.uren.map(r => ({ ...r })),
      uitgevoerde_werken: src.uitgevoerde_werken,
      extra_materialen: src.extra_materialen,
    })));
  };

  const handleSave = async () => {
    if (!id || weeks.length === 0) return;
    setSaving(true);
    try {
      // PUT each week stub in parallel — backend resolves week dates, names, etc.
      await Promise.all(weeks.map(w => apiClient.put(`/api/werkbonnen/${w.werkbon_id}`, {
        uren: w.uren,
        km_afstand: w.km_afstand,
        uitgevoerde_werken: w.uitgevoerde_werken,
        extra_materialen: w.extra_materialen,
      })));
      // After fill → klant signature screen (single signature covers whole bundle)
      router.replace(`/werkbon-groep/${id}/sign` as any);
    } catch (e: any) {
      console.error('[werkbon-groep/invullen] save failed', e);
      const msg = e?.response?.data?.detail || e?.message || 'Kon niet opslaan';
      showAlert('Fout', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#0F172A" />
          <Text style={styles.loadingText}>Maand-werkbon laden...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!groep) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.title}>Maand werkbon</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.loadingBox}>
          <Text style={{ color: '#6c757d' }}>Niet gevonden.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.title}>Maand werkbon invullen</Text>
            <Text style={styles.subtitle}>{weeks.length} weken · {groep.klant_naam} — {groep.werf_naam}</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.summaryCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryHeader}>Periode</Text>
              <Text style={styles.summaryValue}>{groep.periode_van} t/m {groep.periode_tot}</Text>
            </View>
            {weeks.length >= 2 && (
              <TouchableOpacity style={styles.copyBtn} onPress={copyFromFirstWeek}>
                <Ionicons name="copy-outline" size={16} color="#0F172A" />
                <Text style={styles.copyBtnText}>Kopieer week 1 → alle</Text>
              </TouchableOpacity>
            )}
          </View>

          {weeks.map((w, weekIdx) => {
            const tot = weekTotal(w.uren);
            return (
              <View key={w.werkbon_id} style={styles.weekCard}>
                <TouchableOpacity
                  style={styles.weekHeader}
                  onPress={() => toggleExpand(weekIdx)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.weekTitle}>Week {w.week_nummer} — {w.jaar}</Text>
                    {(w.datum_maandag || w.datum_zondag) && (
                      <Text style={styles.weekDates}>{w.datum_maandag} t/m {w.datum_zondag}</Text>
                    )}
                  </View>
                  <View style={styles.weekTotBadge}>
                    <Text style={styles.weekTotText}>{tot.toFixed(1)}u</Text>
                  </View>
                  <Ionicons
                    name={w.expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#0F172A"
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>

                {w.expanded && (
                  <View style={styles.weekBody}>
                    {/* Uren grid */}
                    {w.uren.map((regel, regelIdx) => (
                      <View key={regelIdx} style={styles.regelCard}>
                        <View style={styles.regelHeader}>
                          <TextInput
                            style={styles.teamlidInput}
                            value={regel.teamlidNaam}
                            onChangeText={(text) => updateRegel(weekIdx, regelIdx, { teamlidNaam: text })}
                            placeholder="Werknemer naam"
                            placeholderTextColor="#adb5bd"
                          />
                          {w.uren.length > 1 && (
                            <TouchableOpacity onPress={() => removeRegel(weekIdx, regelIdx)} style={{ paddingLeft: 8 }}>
                              <Ionicons name="trash-outline" size={18} color="#dc3545" />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.dagenRow}>
                          {DAGEN.map((dag, di) => (
                            <View key={dag} style={styles.dagCol}>
                              <Text style={styles.dagLabel}>{DAGEN_KORT[di]}</Text>
                              <TextInput
                                style={styles.dagInput}
                                value={String(regel[dag] || 0)}
                                onChangeText={(val) => {
                                  const cleaned = val.replace(',', '.');
                                  const n = parseFloat(cleaned);
                                  updateRegel(weekIdx, regelIdx, { [dag]: isNaN(n) ? 0 : n });
                                }}
                                keyboardType="numeric"
                                selectTextOnFocus
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity style={styles.addBtn} onPress={() => addRegel(weekIdx)}>
                      <Ionicons name="add-circle-outline" size={18} color="#0F172A" />
                      <Text style={styles.addBtnText}>Teamlid toevoegen</Text>
                    </TouchableOpacity>

                    {/* KM grid */}
                    <Text style={styles.subSectionTitle}>Km afstand</Text>
                    <View style={styles.dagenRow}>
                      {DAGEN.map((dag, di) => (
                        <View key={dag} style={styles.dagCol}>
                          <Text style={styles.dagLabel}>{DAGEN_KORT[di]}</Text>
                          <TextInput
                            style={styles.dagInput}
                            value={String(w.km_afstand[dag] || 0)}
                            onChangeText={(val) => {
                              const n = parseFloat(val.replace(',', '.'));
                              updateKm(weekIdx, dag, isNaN(n) ? 0 : n);
                            }}
                            keyboardType="numeric"
                            selectTextOnFocus
                          />
                        </View>
                      ))}
                    </View>

                    {/* Uitgevoerde werken */}
                    <Text style={styles.subSectionTitle}>Uitgevoerde werken</Text>
                    <TextInput
                      style={styles.multiline}
                      value={w.uitgevoerde_werken}
                      onChangeText={(t) => updateText(weekIdx, 'uitgevoerde_werken', t)}
                      multiline
                      numberOfLines={3}
                      placeholder="Korte beschrijving van de werken deze week"
                      placeholderTextColor="#adb5bd"
                    />

                    {/* Extra materialen */}
                    <Text style={styles.subSectionTitle}>Extra materialen</Text>
                    <TextInput
                      style={styles.multiline}
                      value={w.extra_materialen}
                      onChangeText={(t) => updateText(weekIdx, 'extra_materialen', t)}
                      multiline
                      numberOfLines={2}
                      placeholder="Optioneel"
                      placeholderTextColor="#adb5bd"
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Opslaan & naar handtekening</Text>
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
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#6c757d', fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#E8F4EA',
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  summaryHeader: { fontSize: 11, color: '#0F172A', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, color: '#0F172A', fontWeight: '700', marginTop: 4 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#0F172A',
  },
  copyBtnText: { fontSize: 12, color: '#0F172A', fontWeight: '700' },
  weekCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden',
  },
  weekHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  weekTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  weekDates: { fontSize: 11, color: '#6c757d', marginTop: 2 },
  weekTotBadge: {
    backgroundColor: '#22C55E', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  weekTotText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  weekBody: {
    paddingHorizontal: 14, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: '#F5F6FA',
  },
  regelCard: {
    backgroundColor: '#F5F6FA', borderRadius: 10, padding: 10, marginBottom: 10,
  },
  regelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  teamlidInput: {
    flex: 1,
    backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: '#0F172A',
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  dagenRow: { flexDirection: 'row', gap: 4 },
  dagCol: { flex: 1, alignItems: 'center' },
  dagLabel: { fontSize: 10, color: '#6c757d', fontWeight: '700', marginBottom: 4 },
  dagInput: {
    width: '100%',
    backgroundColor: '#fff', borderRadius: 6,
    paddingVertical: 8, paddingHorizontal: 4,
    textAlign: 'center', fontSize: 13, color: '#0F172A',
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 4, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 8,
    borderWidth: 1, borderColor: '#0F172A', borderStyle: 'dashed',
  },
  addBtnText: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
  subSectionTitle: {
    fontSize: 12, color: '#0F172A', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginTop: 14, marginBottom: 6,
  },
  multiline: {
    backgroundColor: '#F5F6FA', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#0F172A',
    minHeight: 70, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#E8E9ED',
  },
  footer: {
    padding: 14, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E8E9ED',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 14,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
