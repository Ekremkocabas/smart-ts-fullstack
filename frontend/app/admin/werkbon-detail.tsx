import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth, apiClient } from '../../context/AuthContext';

interface Werkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  klant_naam: string;
  werf_naam: string;
  status: string;
  created_by_naam?: string;
  created_by?: string;
  user_id?: string;
  handtekening_data?: string;
  handtekening_naam?: string;
  foto_data?: string;
  opmerkingen?: string;
  uren?: Uren[];
  created_at?: string;
}

interface Uren {
  type: string;
  maandag: number;
  dinsdag: number;
  woensdag: number;
  donderdag: number;
  vrijdag: number;
  zaterdag: number;
  zondag: number;
  opmerking?: string;
}

export default function WerkbonDetail() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [werkbon, setWerkbon] = useState<Werkbon | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && id && (user?.rol === 'beheerder' || user?.rol === 'admin')) {
      fetchWerkbon();
    }
  }, [user, id]);

  const fetchWerkbon = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/werkbonnen/${id}?_ts=${Date.now()}`);
      setWerkbon(res.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!werkbon) return;
    setDownloading(true);
    try {
      const res = await apiClient.get(`/api/werkbonnen/${werkbon.id}/pdf`);
      const data = res.data;
      if (data.pdf_base64) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.pdf_base64}`;
        link.download = `werkbon_week${werkbon.week_nummer}_${werkbon.klant_naam}.pdf`;
        link.click();
      } else {
        alert('Fout bij genereren van PDF');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij downloaden');
    } finally {
      setDownloading(false);
    }
  };

  const resendEmail = async () => {
    if (!werkbon) return;
    setSending(true);
    try {
      await apiClient.post(`/api/werkbonnen/${werkbon.id}/verzenden`);
      alert('E-mail succesvol verzonden!');
    } catch (error) {
      console.error('Error:', error);
      alert('Fout bij verzenden');
    } finally {
      setSending(false);
    }
  };

  const calcTotalUren = () => {
    return werkbon?.uren?.reduce((acc, u) => {
      return acc + (u.maandag || 0) + (u.dinsdag || 0) + (u.woensdag || 0) +
        (u.donderdag || 0) + (u.vrijdag || 0) + (u.zaterdag || 0) + (u.zondag || 0);
    }, 0) || 0;
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'concept': return { color: '#ffc107', label: 'Concept', icon: 'create-outline' };
      case 'ondertekend': return { color: '#28a745', label: 'Ondertekend', icon: 'checkmark-circle' };
      case 'verzonden': return { color: '#F5A623', label: 'Verzonden', icon: 'send' };
      default: return { color: '#6c757d', label: status, icon: 'help-circle-outline' };
    }
  };

  if (Platform.OS !== 'web') return null;

  if (user?.rol !== 'beheerder' && user?.rol !== 'admin') {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!werkbon) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.title}>Werkbon niet gevonden</Text>
        </View>
      </View>
    );
  }

  const statusInfo = getStatusInfo(werkbon.status);
  const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const dayLabels = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Werkbon details</Text>
          <Text style={styles.subtitle}>Week {werkbon.week_nummer}, {werkbon.jaar}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.pdfBtn} onPress={downloadPdf} disabled={downloading}>
            {downloading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={22} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.emailBtn} onPress={resendEmail} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="mail-outline" size={22} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={[styles.statusIconBg, { backgroundColor: `${statusInfo.color}20` }]}>
          <Ionicons name={statusInfo.icon as any} size={32} color={statusInfo.color} />
        </View>
        <View style={styles.statusInfo}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={[styles.statusValue, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>
        <View style={styles.weekBadge}>
          <Text style={styles.weekText}>Week {werkbon.week_nummer}</Text>
        </View>
      </View>

      {/* Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overzicht</Text>
        <View style={styles.overviewGrid}>
          <View style={styles.overviewCard}>
            <Ionicons name="briefcase" size={24} color="#1abc9c" />
            <Text style={styles.overviewLabel}>Klant</Text>
            <Text style={styles.overviewValue}>{werkbon.klant_naam}</Text>
          </View>
          <View style={styles.overviewCard}>
            <Ionicons name="business" size={24} color="#e67e22" />
            <Text style={styles.overviewLabel}>Werf</Text>
            <Text style={styles.overviewValue}>{werkbon.werf_naam}</Text>
          </View>
          <View style={styles.overviewCard}>
            <Ionicons name="person" size={24} color="#3498db" />
            <Text style={styles.overviewLabel}>Werknemer</Text>
            <Text style={styles.overviewValue}>{werkbon.created_by_naam || '-'}</Text>
          </View>
          <View style={styles.overviewCard}>
            <Ionicons name="timer" size={24} color="#F5A623" />
            <Text style={styles.overviewLabel}>Totaal uren</Text>
            <Text style={styles.overviewValue}>{calcTotalUren()} uur</Text>
          </View>
        </View>
      </View>

      {/* Uren Tabel */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Uren per dag</Text>
        <View style={styles.urenTable}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Type</Text>
            {dayLabels.map((d, i) => (
              <Text key={i} style={styles.tableHeaderCell}>{d}</Text>
            ))}
            <Text style={styles.tableHeaderCell}>Tot</Text>
          </View>
          {werkbon.uren?.map((uren, index) => {
            const rowTotal = (uren.maandag || 0) + (uren.dinsdag || 0) + (uren.woensdag || 0) +
              (uren.donderdag || 0) + (uren.vrijdag || 0) + (uren.zaterdag || 0) + (uren.zondag || 0);
            return (
              <View key={index} style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '500' }]}>{uren.type || 'Normaal'}</Text>
                {days.map((day, i) => (
                  <Text key={i} style={styles.tableCell}>{(uren as any)[day] || 0}</Text>
                ))}
                <Text style={[styles.tableCell, { fontWeight: '600', color: '#F5A623' }]}>{rowTotal}</Text>
              </View>
            );
          })}
          {(!werkbon.uren || werkbon.uren.length === 0) && (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>Geen uren ingevoerd</Text>
            </View>
          )}
        </View>
      </View>

      {/* Handtekening */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Handtekening</Text>
        <View style={styles.signatureCard}>
          {werkbon.handtekening_data ? (
            <>
              <Image source={{ uri: `data:image/png;base64,${werkbon.handtekening_data}` }} style={styles.signatureImage} resizeMode="contain" />
              {werkbon.handtekening_naam && (
                <Text style={styles.signatureName}>{werkbon.handtekening_naam}</Text>
              )}
              <View style={styles.signedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#28a745" />
                <Text style={styles.signedText}>Ondertekend</Text>
              </View>
            </>
          ) : (
            <View style={styles.noSignature}>
              <Ionicons name="create-outline" size={48} color="#E8E9ED" />
              <Text style={styles.noSignatureText}>Geen handtekening</Text>
            </View>
          )}
        </View>
      </View>

      {/* Foto */}
      {werkbon.foto_data && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Foto</Text>
          <View style={styles.fotoCard}>
            <Image source={{ uri: `data:image/jpeg;base64,${werkbon.foto_data}` }} style={styles.fotoImage} resizeMode="cover" />
          </View>
        </View>
      )}

      {/* Opmerkingen */}
      {werkbon.opmerkingen && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Opmerkingen</Text>
          <View style={styles.opmerkingenCard}>
            <Text style={styles.opmerkingenText}>{werkbon.opmerkingen}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity style={styles.actionBtn} onPress={downloadPdf} disabled={downloading}>
          <Ionicons name="download" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>{downloading ? 'Bezig...' : 'PDF downloaden'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={resendEmail} disabled={sending}>
          <Ionicons name="mail" size={20} color="#F5A623" />
          <Text style={[styles.actionBtnText, { color: '#F5A623' }]}>{sending ? 'Bezig...' : 'Opnieuw verzenden'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  headerCenter: { flex: 1, marginLeft: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#6c757d' },
  headerActions: { flexDirection: 'row', gap: 8 },
  pdfBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#3498db', alignItems: 'center', justifyContent: 'center' },
  emailBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#E8E9ED' },
  statusIconBg: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusInfo: { flex: 1, marginLeft: 16 },
  statusLabel: { fontSize: 13, color: '#6c757d' },
  statusValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  weekBadge: { backgroundColor: '#F5A62320', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  weekText: { fontSize: 14, fontWeight: '600', color: '#F5A623' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  overviewCard: { flex: 1, minWidth: 150, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  overviewLabel: { fontSize: 12, color: '#6c757d', marginTop: 8 },
  overviewValue: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', marginTop: 4 },
  urenTable: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E9ED', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 12, paddingHorizontal: 16 },
  tableHeaderCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#6c757d', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { flex: 1, fontSize: 14, color: '#1A1A2E', textAlign: 'center' },
  emptyRow: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#6c757d' },
  signatureCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E8E9ED' },
  signatureImage: { width: 250, height: 100, marginBottom: 12 },
  signatureName: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', marginBottom: 8 },
  signedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#28a74520', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  signedText: { fontSize: 13, fontWeight: '600', color: '#28a745' },
  noSignature: { alignItems: 'center', padding: 20 },
  noSignatureText: { fontSize: 14, color: '#6c757d', marginTop: 12 },
  fotoCard: { backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E8E9ED' },
  fotoImage: { width: '100%', height: 300 },
  opmerkingenCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E9ED' },
  opmerkingenText: { fontSize: 14, color: '#1A1A2E', lineHeight: 22 },
  actionsSection: { flexDirection: 'row', gap: 12, marginBottom: 40 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5A623', paddingVertical: 16, borderRadius: 12 },
  actionBtnSecondary: { backgroundColor: '#F5A62320' },
  actionBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
});
