/**
 * Werkbon Review - Control Page (Step 3)
 * Shows summary of all entered data for final review before signing
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useWerkbonFormStore } from '../../store/werkbonFormStore';
import { apiClient } from '../../context/AuthContext';

export default function WerkbonReview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [saving, setSaving] = useState(false);

  const {
    type,
    klantId, klantNaam, manualKlantNaam,
    werfId, werfNaam, manualWerfNaam,
    datum, opmerkingen, gps, photos,
    urenData, opleveringData, projectData, prestatieData,
    validateStep, validationErrors, nextStep, clearDraft,
  } = useWerkbonFormStore();

  const primary = theme?.primaryColor || '#F5A623';

  const getDisplayKlant = () => klantNaam || manualKlantNaam || '-';
  const getDisplayWerf = () => werfNaam || manualWerfNaam || '-';

  const getTypeTitle = () => {
    switch (type) {
      case 'uren': return 'Uren Werkbon';
      case 'oplevering': return 'Oplevering';
      case 'project': return 'Project';
      case 'prestatie': return 'Prestatie';
      default: return 'Werkbon';
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case 'uren': return '#3498db';
      case 'oplevering': return '#27ae60';
      case 'project': return '#9b59b6';
      case 'prestatie': return '#e67e22';
      default: return primary;
    }
  };

  // Calculate totals for uren - ONLY numeric values, exclude afkortingen (Z, V, OV, etc.)
  const isNumericValue = (val: any): boolean => {
    if (typeof val === 'number') return true;
    if (typeof val === 'string') {
      // Check if it's an afkorting (Z, V, OV, BV, F, ADV)
      const afkortingen = ['Z', 'V', 'OV', 'BV', 'F', 'ADV'];
      if (afkortingen.includes(val.toUpperCase())) return false;
      // Check if it's a valid number string
      const num = parseFloat(val);
      return !isNaN(num);
    }
    return false;
  };

  const getNumericValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const getRegelTotal = (regel: any): number => {
    const dagValues = [
      regel.maandag, regel.dinsdag, regel.woensdag,
      regel.donderdag, regel.vrijdag, regel.zaterdag, regel.zondag
    ];
    return dagValues.reduce((sum, val) => {
      return sum + (isNumericValue(val) ? getNumericValue(val) : 0);
    }, 0);
  };

  const getRegelAfkortingen = (regel: any): string[] => {
    const dagen = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    const dagenKort = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
    const afkortingen: string[] = [];
    dagen.forEach((dag, index) => {
      const val = regel[dag];
      if (typeof val === 'string' && ['Z', 'V', 'OV', 'BV', 'F', 'ADV'].includes(val.toUpperCase())) {
        afkortingen.push(`${dagenKort[index]}:${val}`);
      }
    });
    return afkortingen;
  };

  const getTotalUren = () => {
    if (type !== 'uren') return 0;
    return urenData.urenRegels.reduce((total, regel) => {
      return total + getRegelTotal(regel);
    }, 0);
  };

  const buildConceptData = () => {
    const displayKlant = klantNaam || manualKlantNaam;
    const displayWerf = werfNaam || manualWerfNaam;
    const base = {
      type,
      klant_id: klantId || null,
      klant_naam: displayKlant,
      werf_id: werfId || null,
      werf_naam: displayWerf,
      datum,
      opmerkingen,
      gps_locatie: gps.address || (gps.lat && gps.lng ? `${gps.lat}, ${gps.lng}` : null),
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      handtekening: null,
      fotos: photos.map(p => ({ data: p.uri, timestamp: p.timestamp })),
      timestamp: new Date().toISOString(),
    };
    if (type === 'uren') {
      return {
        ...base,
        week_nummer: urenData.weekNummer,
        jaar: urenData.jaar,
        uren: urenData.urenRegels.filter(r => r.teamlidNaam.trim()).map(r => ({
          naam: r.teamlidNaam,
          maandag: r.maandag || 0, dinsdag: r.dinsdag || 0, woensdag: r.woensdag || 0,
          donderdag: r.donderdag || 0, vrijdag: r.vrijdag || 0, zaterdag: r.zaterdag || 0, zondag: r.zondag || 0,
        })),
        uitgevoerde_werken: urenData.uitgevoerdeWerken || '',
      };
    }
    return base;
  };

  const handleOpslaan = async () => {
    setSaving(true);
    try {
      await apiClient.post('/api/werkbonnen/unified', buildConceptData());
      clearDraft();
      Alert.alert('Opgeslagen', 'Werkbon is opgeslagen als concept.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e: any) {
      Alert.alert('Fout', e?.response?.data?.detail || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const handleVersturen = async () => {
    setSaving(true);
    try {
      const res = await apiClient.post('/api/werkbonnen/unified', buildConceptData());
      const werkbonId = res.data?.id;
      if (werkbonId) {
        try {
          await apiClient.post(`/api/werkbonnen/${werkbonId}/verzenden?force=true`);
        } catch (emailErr) {
          console.warn('Email verzenden mislukt:', emailErr);
        }
      }
      clearDraft();
      Alert.alert('Verstuurd', 'Werkbon is opgeslagen en verstuurd naar de administratie.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e: any) {
      Alert.alert('Fout', e?.response?.data?.detail || 'Versturen mislukt');
    } finally {
      setSaving(false);
    }
  };

  const handleProceedToSign = () => {
    // Validate all required fields
    const errors = validateStep(2);
    if (errors.length > 0) {
      Alert.alert(
        'Onvolledige gegevens',
        'De volgende velden moeten nog worden ingevuld:\n\n' + 
        errors.map(e => `• ${e.message}`).join('\n'),
        [
          { text: 'Terug naar formulier', onPress: () => router.back() },
          { text: 'OK', style: 'cancel' }
        ]
      );
      return;
    }
    
    nextStep();
    router.push('/werkbon/sign');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Controle</Text>
          <Text style={styles.headerStep}>Stap 2 van 3</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Type Badge */}
        <View style={[styles.typeBadge, { backgroundColor: getTypeColor() + '15' }]}>
          <Ionicons 
            name={
              type === 'uren' ? 'time-outline' :
              type === 'oplevering' ? 'checkmark-done-outline' :
              type === 'project' ? 'briefcase-outline' : 'construct-outline'
            } 
            size={24} 
            color={getTypeColor()} 
          />
          <Text style={[styles.typeBadgeText, { color: getTypeColor() }]}>{getTypeTitle()}</Text>
        </View>

        {/* General Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Algemene gegevens</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={18} color="#6C7A89" />
            <Text style={styles.infoLabel}>Klant</Text>
            <Text style={styles.infoValue}>{getDisplayKlant()}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color="#6C7A89" />
            <Text style={styles.infoLabel}>Werf</Text>
            <Text style={styles.infoValue}>{getDisplayWerf()}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color="#6C7A89" />
            <Text style={styles.infoLabel}>Datum</Text>
            <Text style={styles.infoValue}>{datum}</Text>
          </View>
        </View>

        {/* Type-specific Details */}
        {type === 'uren' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Urenregistratie - Week {urenData.weekNummer}</Text>
            
            {urenData.urenRegels.filter(r => r.teamlidNaam.trim()).map((regel, index) => {
              const total = getRegelTotal(regel);
              const afkortingen = getRegelAfkortingen(regel);
              return (
                <View key={index} style={styles.urenRegelSummary}>
                  <View style={styles.teamlidInfo}>
                    <Text style={styles.teamlidName}>{regel.teamlidNaam}</Text>
                    {afkortingen.length > 0 && (
                      <Text style={styles.afkortingenText}>({afkortingen.join(', ')})</Text>
                    )}
                  </View>
                  <Text style={styles.urenTotal}>{total} uur</Text>
                </View>
              );
            })}
            
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Totaal</Text>
              <Text style={[styles.totalValue, { color: primary }]}>{getTotalUren()} uur</Text>
            </View>

            {urenData.uitgevoerdeWerken && (
              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionLabel}>Uitgevoerde werken</Text>
                <Text style={styles.descriptionText}>{urenData.uitgevoerdeWerken}</Text>
              </View>
            )}
          </View>
        )}

        {type === 'oplevering' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Oplevering Details</Text>
            
            <View style={styles.descriptionBlock}>
              <Text style={styles.descriptionLabel}>Omschrijving</Text>
              <Text style={styles.descriptionText}>{opleveringData.omschrijving || '-'}</Text>
            </View>

            <View style={styles.checklistSummary}>
              <Text style={styles.descriptionLabel}>Opleverpunten</Text>
              {opleveringData.opleverpunten.map((punt) => (
                <View key={punt.id} style={styles.checkItem}>
                  <Ionicons 
                    name={punt.checked ? 'checkbox' : 'square-outline'} 
                    size={18} 
                    color={punt.checked ? '#27ae60' : '#C4C4C4'} 
                  />
                  <Text style={[styles.checkItemText, !punt.checked && styles.checkItemUnchecked]}>
                    {punt.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {type === 'project' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Project Details</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Project</Text>
              <Text style={styles.infoValue}>{projectData.projectNaam || '-'}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(projectData.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(projectData.status) }]}>
                  {getStatusLabel(projectData.status)}
                </Text>
              </View>
            </View>

            <View style={styles.descriptionBlock}>
              <Text style={styles.descriptionLabel}>Uitgevoerde werken</Text>
              <Text style={styles.descriptionText}>{projectData.uitgevoerdeWerken || '-'}</Text>
            </View>

            {projectData.taken.length > 0 && (
              <View style={styles.checklistSummary}>
                <Text style={styles.descriptionLabel}>Taken ({projectData.taken.filter(t => t.completed).length}/{projectData.taken.length})</Text>
                {projectData.taken.map((taak) => (
                  <View key={taak.id} style={styles.checkItem}>
                    <Ionicons 
                      name={taak.completed ? 'checkbox' : 'square-outline'} 
                      size={18} 
                      color={taak.completed ? '#27ae60' : '#C4C4C4'} 
                    />
                    <Text style={[styles.checkItemText, !taak.completed && styles.checkItemUnchecked]}>
                      {taak.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {projectData.zone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Zone</Text>
                <Text style={styles.infoValue}>{projectData.zone}</Text>
              </View>
            )}

            {projectData.vervolgwerkNodig && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={18} color="#e67e22" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>Vervolgwerk nodig</Text>
                  <Text style={styles.warningText}>{projectData.vervolgwerkBeschrijving || '-'}</Text>
                </View>
              </View>
            )}

            {projectData.hindernissen && (
              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionLabel}>Hindernissen</Text>
                <Text style={styles.descriptionText}>{projectData.hindernissen}</Text>
              </View>
            )}
          </View>
        )}

        {type === 'prestatie' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Prestatie Details</Text>
            
            <View style={styles.prestatieHighlight}>
              <Text style={styles.prestatieWerk}>{prestatieData.werkNaam || '-'}</Text>
              <Text style={styles.prestatieAmount}>
                {prestatieData.hoeveelheid || 0} {prestatieData.eenheid}
              </Text>
            </View>

            {prestatieData.dikteCm && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Dikte</Text>
                <Text style={styles.infoValue}>{prestatieData.dikteCm} cm</Text>
              </View>
            )}

            {prestatieData.aantalLagen && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Aantal lagen</Text>
                <Text style={styles.infoValue}>{prestatieData.aantalLagen}</Text>
              </View>
            )}

            {prestatieData.zone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Zone</Text>
                <Text style={styles.infoValue}>{prestatieData.zone}</Text>
              </View>
            )}

            {prestatieData.werkOmschrijving && (
              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionLabel}>Omschrijving</Text>
                <Text style={styles.descriptionText}>{prestatieData.werkOmschrijving}</Text>
              </View>
            )}
          </View>
        )}

        {/* Photos & GPS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bijlagen</Text>
          
          <View style={styles.attachmentRow}>
            <View style={styles.attachmentItem}>
              <Ionicons 
                name="images-outline" 
                size={24} 
                color={photos.length > 0 ? '#27ae60' : '#C4C4C4'} 
              />
              <Text style={styles.attachmentText}>
                {photos.length > 0 ? `${photos.length} foto's` : 'Geen foto\'s'}
              </Text>
            </View>
            
            <View style={styles.attachmentItem}>
              <Ionicons 
                name="location-outline" 
                size={24} 
                color={gps.address ? '#27ae60' : '#C4C4C4'} 
              />
              <Text style={styles.attachmentText}>
                {gps.address ? 'GPS vastgelegd' : 'Geen GPS'}
              </Text>
            </View>
          </View>

          {gps.address && (
            <View style={styles.gpsAddress}>
              <Ionicons name="navigate" size={16} color="#6C7A89" />
              <Text style={styles.gpsAddressText}>{gps.address}</Text>
            </View>
          )}
        </View>

        {/* Opmerkingen */}
        {opmerkingen && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Opmerkingen</Text>
            <Text style={styles.opmerkingenText}>{opmerkingen}</Text>
          </View>
        )}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#3498db" />
          <Text style={styles.infoBoxText}>
            Controleer alle gegevens voordat u verder gaat naar de ondertekening.
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={styles.backButtonFooter}
          onPress={() => router.back()}
          disabled={saving}
        >
          <Ionicons name="arrow-back" size={20} color="#6C7A89" />
          <Text style={styles.backButtonFooterText}>Terug</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.opslaanButton, saving && { opacity: 0.6 }]}
          onPress={handleOpslaan}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
          <Text style={styles.opslaanButtonText}>Opslaan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.versturenButton, saving && { opacity: 0.6 }]}
          onPress={handleVersturen}
          disabled={saving}
        >
          <Ionicons name="send-outline" size={18} color="#fff" />
          <Text style={styles.versturenButtonText}>Versturen</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signButton}
          onPress={handleProceedToSign}
          disabled={saving}
        >
          <Ionicons name="create-outline" size={20} color="#1A1A2E" />
          <Text style={styles.signButtonText}>Ondertekenen</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Helper functions
function getStatusColor(status: string): string {
  switch (status) {
    case 'gestart': return '#3498db';
    case 'in_uitvoering': return '#f39c12';
    case 'afgewerkt': return '#27ae60';
    case 'niet_afgewerkt': return '#e74c3c';
    case 'wacht_op_goedkeuring': return '#9b59b6';
    default: return '#6C7A89';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'gestart': return 'Gestart';
    case 'in_uitvoering': return 'In uitvoering';
    case 'afgewerkt': return 'Afgewerkt';
    case 'niet_afgewerkt': return 'Niet afgewerkt';
    case 'wacht_op_goedkeuring': return 'Wacht op goedkeuring';
    default: return status;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  headerStep: { fontSize: 13, color: '#6C7A89', marginTop: 2 },
  
  content: { flex: 1, padding: 16 },
  
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignSelf: 'center',
  },
  typeBadgeText: { fontSize: 16, fontWeight: '600' },
  
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 16,
  },
  
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
    gap: 10,
  },
  infoLabel: { flex: 1, fontSize: 14, color: '#6C7A89' },
  infoValue: { fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  
  // Uren specific
  urenRegelSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6FA',
  },
  teamlidInfo: { flex: 1 },
  teamlidName: { fontSize: 15, color: '#1A1A2E' },
  afkortingenText: { fontSize: 12, color: '#F5A623', marginTop: 2 },
  urenTotal: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#E8E9ED',
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  totalValue: { fontSize: 18, fontWeight: '700' },
  
  descriptionBlock: { marginTop: 16 },
  descriptionLabel: { fontSize: 14, fontWeight: '500', color: '#6C7A89', marginBottom: 6 },
  descriptionText: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  
  // Checklist
  checklistSummary: { marginTop: 16 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkItemText: { fontSize: 14, color: '#1A1A2E' },
  checkItemUnchecked: { color: '#6C7A89' },
  
  // Project
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 13, fontWeight: '500' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  warningTitle: { fontSize: 14, fontWeight: '600', color: '#e67e22' },
  warningText: { fontSize: 13, color: '#6C7A89', marginTop: 4 },
  
  // Prestatie
  prestatieHighlight: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  prestatieWerk: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  prestatieAmount: { fontSize: 24, fontWeight: '700', color: '#e67e22' },
  
  // Attachments
  attachmentRow: { flexDirection: 'row', gap: 16 },
  attachmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentText: { fontSize: 14, color: '#6C7A89' },
  gpsAddress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
  },
  gpsAddressText: { flex: 1, fontSize: 13, color: '#6C7A89' },
  
  opmerkingenText: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  infoBoxText: { flex: 1, fontSize: 14, color: '#1565C0', lineHeight: 20 },
  
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'nowrap',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  backButtonFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F5F6FA',
  },
  backButtonFooterText: { fontSize: 15, fontWeight: '500', color: '#6C7A89' },
  opslaanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: '#6c757d',
  },
  opslaanButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  versturenButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: '#3498db',
  },
  versturenButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  signButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFD966',
  },
  signButtonText: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
});
