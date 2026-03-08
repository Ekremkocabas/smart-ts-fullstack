import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Werkbon, UrenRegel } from '../../store/appStore';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { fetchWerkbon, verzendWerkbon, deleteWerkbon, instellingen, fetchInstellingen } = useAppStore();
  
  const [werkbon, setWerkbon] = useState<Werkbon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadWerkbon();
    fetchInstellingen();
  }, [id]);

  const loadWerkbon = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await fetchWerkbon(id);
      setWerkbon(data);
    } catch (error) {
      Alert.alert('Fout', 'Kon werkbon niet laden');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateTotal = (regel: UrenRegel) => {
    return regel.maandag + regel.dinsdag + regel.woensdag + 
           regel.donderdag + regel.vrijdag + regel.zaterdag + regel.zondag;
  };

  const generatePDF = async () => {
    if (!werkbon) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1a1a2e; margin-bottom: 5px; }
          .header { margin-bottom: 20px; }
          .info { margin-bottom: 20px; }
          .info-row { display: flex; margin-bottom: 8px; }
          .info-label { font-weight: bold; width: 120px; color: #666; }
          .info-value { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
          th { background-color: #F5A623; color: white; }
          .name-cell { text-align: left; }
          .total-row { background-color: #f0f0f0; font-weight: bold; }
          .signature-section { margin-top: 40px; }
          .signature-box { border: 1px solid #ddd; padding: 20px; margin-top: 10px; }
          .signature-img { max-width: 200px; max-height: 100px; }
          .footer { margin-top: 40px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Werkbon / Timesheet</h1>
          <p>${instellingen?.bedrijfsnaam || 'Smart-Tech BV'}</p>
        </div>
        
        <div class="info">
          <div class="info-row">
            <span class="info-label">Week:</span>
            <span class="info-value">${werkbon.week_nummer} (${werkbon.jaar})</span>
          </div>
          <div class="info-row">
            <span class="info-label">Klant:</span>
            <span class="info-value">${werkbon.klant_naam}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Werf:</span>
            <span class="info-value">${werkbon.werf_naam}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Ingevuld door:</span>
            <span class="info-value">${werkbon.ingevuld_door_naam}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="info-value">${getStatusLabel(werkbon.status)}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="name-cell">Naam</th>
              <th>Ma</th>
              <th>Di</th>
              <th>Wo</th>
              <th>Do</th>
              <th>Vr</th>
              <th>Za</th>
              <th>Zo</th>
              <th>Totaal</th>
            </tr>
          </thead>
          <tbody>
            ${werkbon.uren.map(regel => `
              <tr>
                <td class="name-cell">${regel.teamlid_naam}</td>
                <td>${regel.maandag || '-'}</td>
                <td>${regel.dinsdag || '-'}</td>
                <td>${regel.woensdag || '-'}</td>
                <td>${regel.donderdag || '-'}</td>
                <td>${regel.vrijdag || '-'}</td>
                <td>${regel.zaterdag || '-'}</td>
                <td>${regel.zondag || '-'}</td>
                <td><strong>${calculateTotal(regel)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${werkbon.handtekening_data ? `
          <div class="signature-section">
            <h3>Handtekening</h3>
            <div class="signature-box">
              <img class="signature-img" src="${werkbon.handtekening_data}" alt="Handtekening" />
              <p><strong>Naam:</strong> ${werkbon.handtekening_naam}</p>
              <p><strong>Datum:</strong> ${werkbon.handtekening_datum ? new Date(werkbon.handtekening_datum).toLocaleDateString('nl-NL') : '-'}</p>
            </div>
          </div>
        ` : ''}

        <div class="footer">
          <p>Document gegenereerd op ${new Date().toLocaleDateString('nl-NL')} om ${new Date().toLocaleTimeString('nl-NL')}</p>
          <p>${instellingen?.bedrijfsnaam || ''} | ${instellingen?.email || ''}</p>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      Alert.alert('Fout', 'Kon PDF niet genereren');
    }
  };

  const handleSign = () => {
    if (!werkbon) return;
    router.push(`/handtekening/${werkbon.id}`);
  };

  const handleSend = async () => {
    if (!werkbon) return;
    
    if (werkbon.status !== 'ondertekend') {
      Alert.alert('Let op', 'De werkbon moet eerst ondertekend worden');
      return;
    }

    Alert.alert(
      'Verzenden',
      'Wilt u deze werkbon per e-mail verzenden?',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verzenden',
          onPress: async () => {
            setIsSending(true);
            try {
              await verzendWerkbon(werkbon.id);
              Alert.alert(
                'Info',
                'E-mail verzending is nog niet geïmplementeerd. De werkbon is gemarkeerd als verzonden. U kunt de PDF handmatig delen.',
                [{ text: 'PDF Delen', onPress: generatePDF }, { text: 'OK' }]
              );
              loadWerkbon();
            } catch (error: any) {
              Alert.alert('Fout', error.message);
            } finally {
              setIsSending(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!werkbon) return;
    
    Alert.alert(
      'Verwijderen',
      'Weet u zeker dat u deze werkbon wilt verwijderen?',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWerkbon(werkbon.id);
              router.back();
            } catch (error: any) {
              Alert.alert('Fout', error.message);
            }
          },
        },
      ]
    );
  };

  if (isLoading || !werkbon) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      </SafeAreaView>
    );
  }

  const grandTotal = werkbon.uren.reduce((sum, regel) => sum + calculateTotal(regel), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Werkbon</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={24} color="#dc3545" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Status & Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.weekBadge}>
              <Text style={styles.weekText}>Week {werkbon.week_nummer}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(werkbon.status) }]}>
              <Text style={styles.statusText}>{getStatusLabel(werkbon.status)}</Text>
            </View>
          </View>
          
          <View style={styles.infoDetails}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Klant</Text>
              <Text style={styles.infoValue}>{werkbon.klant_naam}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Werf</Text>
              <Text style={styles.infoValue}>{werkbon.werf_naam}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ingevuld door</Text>
              <Text style={styles.infoValue}>{werkbon.ingevuld_door_naam}</Text>
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

          {werkbon.uren.map((regel, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.nameColumn}>
                <Text style={styles.nameText}>{regel.teamlid_naam}</Text>
              </View>
              {DAGEN.map((dag) => (
                <View key={dag} style={styles.dayColumn}>
                  <Text style={styles.urenText}>
                    {regel[dag as keyof UrenRegel] || '-'}
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
        {werkbon.handtekening_data && (
          <View style={styles.signatureCard}>
            <Text style={styles.sectionTitle}>Handtekening</Text>
            <View style={styles.signatureInfo}>
              <Text style={styles.signatureLabel}>Naam: {werkbon.handtekening_naam}</Text>
              {werkbon.handtekening_datum && (
                <Text style={styles.signatureLabel}>
                  Datum: {new Date(werkbon.handtekening_datum).toLocaleDateString('nl-NL')}
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {werkbon.status === 'concept' && (
          <TouchableOpacity style={styles.signButton} onPress={handleSign}>
            <Ionicons name="pencil" size={20} color="#fff" />
            <Text style={styles.buttonText}>Ondertekenen</Text>
          </TouchableOpacity>
        )}
        
        {werkbon.status === 'ondertekend' && (
          <TouchableOpacity
            style={[styles.sendButton, isSending && styles.buttonDisabled]}
            onPress={handleSend}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.buttonText}>Verzenden</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.pdfButton} onPress={generatePDF}>
          <Ionicons name="document" size={20} color="#F5A623" />
          <Text style={styles.pdfButtonText}>PDF</Text>
        </TouchableOpacity>
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
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5f',
  },
  signButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#28a745',
    padding: 16,
    borderRadius: 12,
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5A623',
    padding: 16,
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
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16213e',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F5A623',
  },
  pdfButtonText: {
    color: '#F5A623',
    fontSize: 16,
    fontWeight: '600',
  },
});
