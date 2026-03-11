import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Werkbon, UrenRegel } from '../../store/appStore';
import { useAuth } from '../../context/AuthContext';
import { showAlert, showConfirm } from '../../utils/alerts';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const AFKORTING_KEYS = ['afkorting_ma', 'afkorting_di', 'afkorting_wo', 'afkorting_do', 'afkorting_vr', 'afkorting_za', 'afkorting_zo'] as const;

const getStatusColor = (status: string) => {
  switch (status) {
    case 'concept': return '#ffc107';
    case 'ondertekend': return '#28a745';
    case 'verzonden': return '#F5A623';
    default: return '#6c757d';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'concept': return 'Concept';
    case 'ondertekend': return 'Ondertekend';
    case 'verzonden': return 'Verzonden';
    default: return status;
  }
};

export default function WerkbonDetailScreen() {
  const { id, justSigned, signer, signedAt } = useLocalSearchParams<{
    id: string;
    justSigned?: string;
    signer?: string;
    signedAt?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const { fetchWerkbon, verzendWerkbon, deleteWerkbon, duplicateWerkbon, instellingen, fetchInstellingen, lastUpdatedWerkbon } = useAppStore();
  
  const [werkbon, setWerkbon] = useState<Werkbon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [verstuurNaarKlant, setVerstuurNaarKlant] = useState(false);
  const [klantEmail, setKlantEmail] = useState('');
  const baseWerkbon = lastUpdatedWerkbon?.id === id ? lastUpdatedWerkbon : werkbon;
  const currentWerkbon = justSigned === '1' && baseWerkbon && baseWerkbon.status === 'concept'
    ? {
        ...baseWerkbon,
        status: 'ondertekend',
        handtekening_naam: typeof signer === 'string' ? signer : baseWerkbon.handtekening_naam,
        handtekening_datum: typeof signedAt === 'string' ? signedAt : baseWerkbon.handtekening_datum,
        handtekening_data: baseWerkbon.handtekening_data || 'pending',
      }
    : baseWerkbon;

  const loadWerkbon = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await fetchWerkbon(id);
      setWerkbon(data);
    } catch (error) {
      showAlert('Fout', 'Kon werkbon niet laden');
    } finally {
      setIsLoading(false);
    }
  }, [fetchWerkbon, id]);

  useEffect(() => {
    fetchInstellingen();
  }, [fetchInstellingen]);

  useEffect(() => {
    loadWerkbon();
  }, [loadWerkbon, justSigned]);

  useEffect(() => {
    if (lastUpdatedWerkbon?.id === id) {
      setWerkbon(lastUpdatedWerkbon);
    }
  }, [id, lastUpdatedWerkbon]);

  const calculateTotal = (regel: UrenRegel) => {
    return regel.maandag + regel.dinsdag + regel.woensdag + 
           regel.donderdag + regel.vrijdag + regel.zaterdag + regel.zondag;
  };

  const getDagValue = (regel: UrenRegel, dayIndex: number) => {
    const afkortingKey = AFKORTING_KEYS[dayIndex];
    const afkorting = regel[afkortingKey];
    if (afkorting) return afkorting;

    const uren = regel[DAGEN[dayIndex] as keyof UrenRegel] as number;
    return uren || '-';
  };

  const generatePDF = async () => {
    if (!currentWerkbon) return;
    const werkbonData = currentWerkbon;

    // Helper to get afkorting for a day
    const getAfkorting = (regel: any, dag: string) => {
      const afkKey = `afkorting_${dag.substring(0, 2)}`;
      return regel[afkKey] || '';
    };

    // Helper to format hours/afkorting cell
    const formatCell = (regel: any, dag: string) => {
      const afk = getAfkorting(regel, dag);
      const uren = regel[dag] || 0;
      if (afk) {
        return `<span class="afkorting">${afk}</span>`;
      }
      return uren > 0 ? uren : '-';
    };

    // Calculate KM totals
    const kmTotaal = werkbonData.km_afstand ? 
      (werkbonData.km_afstand.maandag || 0) + (werkbonData.km_afstand.dinsdag || 0) + 
      (werkbonData.km_afstand.woensdag || 0) + (werkbonData.km_afstand.donderdag || 0) + 
      (werkbonData.km_afstand.vrijdag || 0) + (werkbonData.km_afstand.zaterdag || 0) + 
      (werkbonData.km_afstand.zondag || 0) : 0;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #F5A623; padding-bottom: 15px; }
          .logo-section { display: flex; align-items: center; gap: 15px; }
          .logo { max-height: 60px; max-width: 150px; }
          .company-name { font-size: 24px; font-weight: bold; color: #1a1a2e; }
          .company-info { text-align: right; font-size: 11px; color: #666; line-height: 1.5; }
          h1 { color: #1a1a2e; margin: 0 0 5px 0; font-size: 20px; }
          .subtitle { color: #666; font-size: 14px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; }
          .info-box h3 { margin: 0 0 10px 0; color: #1a1a2e; font-size: 14px; }
          .info-row { display: flex; margin-bottom: 5px; }
          .info-label { font-weight: bold; width: 100px; color: #666; }
          .info-value { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
          th { background-color: #F5A623; color: white; font-size: 11px; }
          .name-cell { text-align: left; font-weight: 500; }
          .total-cell { font-weight: bold; background-color: #fff3cd; }
          .grand-total { background-color: #F5A623; color: white; font-weight: bold; }
          .afkorting { background-color: #F5A623; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
          .km-section { margin-top: 20px; }
          .km-table { background: #f8f9fa; }
          .description-section { margin-top: 20px; }
          .description-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 10px; min-height: 60px; }
          .signature-section { margin-top: 30px; page-break-inside: avoid; }
          .signature-box { border: 2px solid #ddd; padding: 20px; border-radius: 8px; background: #fafafa; }
          .signature-img { max-width: 200px; max-height: 80px; }
          .signature-info { margin-top: 10px; display: flex; gap: 30px; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10px; color: #666; }
          .disclaimer { background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 15px; font-style: italic; }
          .legend { margin-top: 10px; font-size: 10px; color: #666; }
          .legend span { margin-right: 15px; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; }
          .status-concept { background: #ffc107; color: #000; }
          .status-ondertekend { background: #28a745; color: #fff; }
          .status-verzonden { background: #F5A623; color: #fff; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            ${instellingen?.logo_base64 ? `<img class="logo" src="${instellingen.logo_base64}" alt="Logo" />` : ''}
            <div>
              <div class="company-name">${instellingen?.bedrijfsnaam || 'Smart-Tech BV'}</div>
              <div class="subtitle">Werkbon / Timesheet</div>
            </div>
          </div>
          <div class="company-info">
            ${instellingen?.adres ? `${instellingen.adres}<br/>` : ''}
            ${instellingen?.postcode || ''} ${instellingen?.stad || ''}<br/>
            ${instellingen?.telefoon ? `Tel: ${instellingen.telefoon}<br/>` : ''}
            ${instellingen?.email || ''}<br/>
            ${instellingen?.kvk_nummer ? `KvK: ${instellingen.kvk_nummer}<br/>` : ''}
            ${instellingen?.btw_nummer ? `BTW: ${instellingen.btw_nummer}` : ''}
          </div>
        </div>
        
        <div class="info-grid">
          <div class="info-box">
            <h3>Werkbon Details</h3>
            <div class="info-row">
              <span class="info-label">Week:</span>
              <span class="info-value"><strong>${werkbonData.week_nummer}</strong> (${werkbonData.jaar})</span>
            </div>
            <div class="info-row">
              <span class="info-label">Periode:</span>
              <span class="info-value">${werkbonData.datum_maandag || ''} - ${werkbonData.datum_zondag || ''}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Status:</span>
              <span class="info-value">
                <span class="status-badge status-${werkbonData.status}">${getStatusLabel(werkbonData.status)}</span>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Ingevuld door:</span>
              <span class="info-value">${werkbonData.ingevuld_door_naam}</span>
            </div>
          </div>
          <div class="info-box">
            <h3>Klant & Locatie</h3>
            <div class="info-row">
              <span class="info-label">Klant:</span>
              <span class="info-value"><strong>${werkbonData.klant_naam}</strong></span>
            </div>
            <div class="info-row">
              <span class="info-label">Werf:</span>
              <span class="info-value">${werkbonData.werf_naam}</span>
            </div>
          </div>
        </div>

        <h3>Gewerkte Uren</h3>
        <table>
          <thead>
            <tr>
              <th class="name-cell" style="width: 150px;">Naam</th>
              <th>Ma<br/><small>${werkbonData.datum_maandag || ''}</small></th>
              <th>Di<br/><small>${werkbonData.datum_dinsdag || ''}</small></th>
              <th>Wo<br/><small>${werkbonData.datum_woensdag || ''}</small></th>
              <th>Do<br/><small>${werkbonData.datum_donderdag || ''}</small></th>
              <th>Vr<br/><small>${werkbonData.datum_vrijdag || ''}</small></th>
              <th>Za<br/><small>${werkbonData.datum_zaterdag || ''}</small></th>
              <th>Zo<br/><small>${werkbonData.datum_zondag || ''}</small></th>
              <th style="background: #1a1a2e;">Totaal</th>
            </tr>
          </thead>
          <tbody>
            ${werkbonData.uren.map(regel => `
              <tr>
                <td class="name-cell">${regel.teamlid_naam}</td>
                <td>${formatCell(regel, 'maandag')}</td>
                <td>${formatCell(regel, 'dinsdag')}</td>
                <td>${formatCell(regel, 'woensdag')}</td>
                <td>${formatCell(regel, 'donderdag')}</td>
                <td>${formatCell(regel, 'vrijdag')}</td>
                <td>${formatCell(regel, 'zaterdag')}</td>
                <td>${formatCell(regel, 'zondag')}</td>
                <td class="total-cell">${calculateTotal(regel)}</td>
              </tr>
            `).join('')}
            <tr class="grand-total">
              <td class="name-cell"><strong>TOTAAL</strong></td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.maandag || 0), 0) || '-'}</td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.dinsdag || 0), 0) || '-'}</td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.woensdag || 0), 0) || '-'}</td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.donderdag || 0), 0) || '-'}</td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.vrijdag || 0), 0) || '-'}</td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.zaterdag || 0), 0) || '-'}</td>
              <td>${werkbonData.uren.reduce((sum, r) => sum + (r.zondag || 0), 0) || '-'}</td>
              <td><strong>${grandTotal}</strong></td>
            </tr>
          </tbody>
        </table>
        
        <div class="legend">
          <strong>Afkortingen:</strong>
          <span>Z = Ziek</span>
          <span>V = Verlof</span>
          <span>BV = Betaald Verlof</span>
          <span>BF = Betaald Feestdag</span>
        </div>

        ${kmTotaal > 0 ? `
          <div class="km-section">
            <h3>KM Afstand</h3>
            <table class="km-table">
              <tr>
                <th>Ma</th><th>Di</th><th>Wo</th><th>Do</th><th>Vr</th><th>Za</th><th>Zo</th><th style="background: #1a1a2e;">Totaal</th>
              </tr>
              <tr>
                <td>${werkbonData.km_afstand?.maandag || '-'}</td>
                <td>${werkbonData.km_afstand?.dinsdag || '-'}</td>
                <td>${werkbonData.km_afstand?.woensdag || '-'}</td>
                <td>${werkbonData.km_afstand?.donderdag || '-'}</td>
                <td>${werkbonData.km_afstand?.vrijdag || '-'}</td>
                <td>${werkbonData.km_afstand?.zaterdag || '-'}</td>
                <td>${werkbonData.km_afstand?.zondag || '-'}</td>
                <td class="total-cell"><strong>${kmTotaal} km</strong></td>
              </tr>
            </table>
          </div>
        ` : ''}

        ${werkbonData.uitgevoerde_werken ? `
          <div class="description-section">
            <h3>Uitgevoerde Werken</h3>
            <div class="description-box">${werkbonData.uitgevoerde_werken}</div>
          </div>
        ` : ''}

        ${werkbonData.extra_materialen ? `
          <div class="description-section">
            <h3>Extra Materialen</h3>
            <div class="description-box">${werkbonData.extra_materialen}</div>
          </div>
        ` : ''}

        ${werkbonData.handtekening_data ? `
          <div class="signature-section">
            <h3>Handtekening Klant</h3>
            <div class="signature-box">
              <img class="signature-img" src="${werkbonData.handtekening_data}" alt="Handtekening" />
              <div class="signature-info">
                <div><strong>Naam:</strong> ${werkbonData.handtekening_naam}</div>
                <div><strong>Datum:</strong> ${werkbonData.handtekening_datum ? new Date(werkbonData.handtekening_datum).toLocaleDateString('nl-NL') : '-'}</div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="footer">
          ${instellingen?.pdf_voettekst ? `<div class="disclaimer">${instellingen.pdf_voettekst}</div>` : ''}
          <p style="margin-top: 15px;">
            Document gegenereerd op ${new Date().toLocaleDateString('nl-NL')} om ${new Date().toLocaleTimeString('nl-NL')} | 
            ${instellingen?.bedrijfsnaam || 'Smart-Tech BV'}
          </p>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        showAlert('PDF gereed', 'PDF is gemaakt, maar delen is op dit apparaat niet beschikbaar.');
      }
    } catch (error) {
      showAlert('Fout', 'Kon PDF niet genereren');
    }
  };

  const handleSign = () => {
    if (!currentWerkbon) return;
    router.push(`/handtekening/${currentWerkbon.id}`);
  };

  const handleEdit = () => {
    if (!currentWerkbon) return;
    router.push(`/werkbon/bewerken/${currentWerkbon.id}`);
  };

  const handleDuplicate = () => {
    if (!currentWerkbon || !user) return;
    showConfirm(
      'Werkbon Kopiëren',
      `Maak een kopie voor de huidige week van: ${currentWerkbon.klant_naam} - ${currentWerkbon.werf_naam}?`,
      async () => {
        try {
          const newWerkbon = await duplicateWerkbon(currentWerkbon.id, user.id, user.naam);
          router.replace(`/werkbon/${newWerkbon.id}`);
        } catch (error: any) {
          showAlert('Fout', error.message);
        }
      },
      undefined,
      'Kopiëren'
    );
  };

  const handleSend = async () => {
    if (!currentWerkbon) return;

    if (currentWerkbon.status !== 'ondertekend') {
      showAlert('Let op', 'De werkbon moet eerst ondertekend worden');
      return;
    }

    setIsSending(true);
    try {
      const emailToSend = verstuurNaarKlant && klantEmail.trim() ? klantEmail.trim() : undefined;
      const result = await verzendWerkbon(currentWerkbon.id, emailToSend);
      const successMsg = result.email_sent
        ? `Werkbon verstuurd! ${emailToSend ? `(ook naar: ${emailToSend})` : ''}`
        : (result.email_error || 'PDF gemaakt maar e-mail kon niet worden verstuurd.');
      if (Platform.OS === 'web') {
        window.alert(`Verstuurd!\n\n${successMsg}`);
        router.replace('/');
      } else {
        Alert.alert('Verstuurd!', successMsg, [{ text: 'OK', onPress: () => router.replace('/') }]);
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message;
      showAlert('Fout', message);
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = () => {
    if (!currentWerkbon) return;
    showConfirm(
      'Verwijderen',
      'Weet u zeker dat u deze werkbon wilt verwijderen?',
      async () => {
        try {
          await deleteWerkbon(currentWerkbon.id);
          router.back();
        } catch (error: any) {
          showAlert('Fout', error.message);
        }
      },
      undefined,
      'Verwijderen',
      true
    );
  };

  if (isLoading || !currentWerkbon) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      </SafeAreaView>
    );
  }

  const grandTotal = currentWerkbon.uren.reduce((sum, regel) => sum + calculateTotal(regel), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="werkbon-back-button" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Werkbon</Text>
        <TouchableOpacity testID="werkbon-delete-button" onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={24} color="#dc3545" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Status & Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.weekBadge}>
              <Text style={styles.weekText}>Week {currentWerkbon.week_nummer}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentWerkbon.status) }]}> 
              <Text style={styles.statusText}>{getStatusLabel(currentWerkbon.status)}</Text>
            </View>
          </View>
          
          <View style={styles.infoDetails}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Klant</Text>
              <Text style={styles.infoValue}>{currentWerkbon.klant_naam}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Werf</Text>
              <Text style={styles.infoValue}>{currentWerkbon.werf_naam}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ingevuld door</Text>
              <Text style={styles.infoValue}>{currentWerkbon.ingevuld_door_naam}</Text>
            </View>
          </View>
        </View>

        {/* Uren Table */}
        <View style={styles.tableContainer}>
          <Text style={styles.sectionTitle}>Gewerkte Uren</Text>
          
          <View style={styles.tableHeader}>
            <View style={styles.nameColumn}>
              <Text style={styles.headerText}>Naam</Text>
            </View>
            {DAGEN_KORT.map((dag) => (
              <View key={dag} style={styles.dayColumn}>
                <Text style={styles.headerText}>{dag}</Text>
              </View>
            ))}
            <View style={styles.totalColumn}>
              <Text style={styles.headerText}>Tot</Text>
            </View>
          </View>

          {currentWerkbon.uren.map((regel, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.nameColumn}>
                <Text style={styles.nameText}>{regel.teamlid_naam}</Text>
              </View>
              {DAGEN.map((dag) => (
                <View key={dag} style={styles.dayColumn}>
                  <Text style={styles.urenText}>
                    {getDagValue(regel, DAGEN.indexOf(dag))}
                  </Text>
                </View>
              ))}
              <View style={styles.totalColumn}>
                <Text style={styles.totalText}>{calculateTotal(regel)}</Text>
              </View>
            </View>
          ))}

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Totaal uren:</Text>
            <Text style={styles.grandTotalValue}>{grandTotal}</Text>
          </View>
        </View>

        {/* Signature */}
        {currentWerkbon.handtekening_data && (
          <View style={styles.signatureCard}>
            <Text style={styles.sectionTitle}>Handtekening</Text>
            <View style={styles.signatureInfo}>
              <Text style={styles.signatureLabel}>Naam: {currentWerkbon.handtekening_naam}</Text>
              {currentWerkbon.handtekening_datum && (
                <Text style={styles.signatureLabel}>
                  Datum: {new Date(currentWerkbon.handtekening_datum).toLocaleDateString('nl-NL')}
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {currentWerkbon.status === 'concept' && (
          <View style={styles.footerRow}>
            <TouchableOpacity testID="werkbon-edit-button" style={[styles.actionBtn, styles.editBtn]} onPress={handleEdit}>
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Bewerken</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="werkbon-sign-button" style={[styles.actionBtn, styles.signButton]} onPress={handleSign}>
              <Ionicons name="pencil" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Ondertekenen</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {currentWerkbon.status === 'ondertekend' && (
          <View style={styles.sendContainer}>
            {/* Versturen naar klant toggle */}
            <TouchableOpacity
              style={styles.klantEmailToggle}
              onPress={() => setVerstuurNaarKlant(v => !v)}
            >
              <View style={[styles.checkbox, verstuurNaarKlant && styles.checkboxChecked]}>
                {verstuurNaarKlant && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.klantEmailLabel}>Ook versturen naar klant</Text>
            </TouchableOpacity>
            {verstuurNaarKlant && (
              <TextInput
                style={styles.klantEmailInput}
                value={klantEmail}
                onChangeText={setKlantEmail}
                placeholder="E-mailadres klant"
                placeholderTextColor="#6c757d"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}
            <TouchableOpacity
              testID="werkbon-send-pdf-button"
              style={[styles.sendButton, isSending && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Versturen</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  weekBadge: {
    backgroundColor: '#2d3a5f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  weekText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoDetails: {
    gap: 8,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: '#6c757d',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  tableContainer: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2d3a5f',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  headerText: {
    color: '#a0a0a0',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  nameColumn: {
    flex: 2,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
  },
  totalColumn: {
    flex: 1,
    alignItems: 'center',
  },
  nameText: {
    color: '#fff',
    fontSize: 12,
  },
  urenText: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  totalText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '600',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5f',
    marginTop: 8,
  },
  grandTotalLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  grandTotalValue: {
    color: '#F5A623',
    fontSize: 18,
    fontWeight: 'bold',
  },
  signatureCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  signatureInfo: {
    gap: 4,
  },
  signatureLabel: {
    color: '#a0a0a0',
    fontSize: 14,
  },
  footer: {
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5f',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  editBtn: {
    backgroundColor: '#2d3a5f',
    borderWidth: 1,
    borderColor: '#4a5a8a',
  },
  signButton: {
    backgroundColor: '#28a745',
  },
  copyBtn: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#F5A623',
  },
  pdfBtn: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#444',
  },
  sendContainer: {
    gap: 8,
  },
  klantEmailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#F5A623',
  },
  klantEmailLabel: {
    color: '#ccc',
    fontSize: 14,
  },
  klantEmailInput: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#F5A623',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 14,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5A623',
    padding: 14,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
