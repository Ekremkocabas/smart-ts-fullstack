/**
 * Unified Werkbon Review - Overview of filled data
 * Step 2: Review all entered data before signing
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';

const TYPE_LABELS: Record<string, string> = {
  productie: 'Productie Werkbon',
  oplevering: 'Oplevering Werkbon',
  project: 'Project Werkbon',
};

export default function WerkbonReview() {
  const router = useRouter();
  const { formData: formDataStr } = useLocalSearchParams<{ formData: string }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const primary = theme.primaryColor || '#F5A623';
  
  // Parse form data
  let formData: any = {};
  try {
    formData = JSON.parse(formDataStr || '{}');
  } catch (e) {
    console.error('Failed to parse form data:', e);
  }

  const handleNext = () => {
    // Pass data to sign page
    router.push({
      pathname: '/werkbon/sign',
      params: { formData: formDataStr },
    });
  };

  const handleBack = () => {
    router.back();
  };

  const renderSection = (title: string, content: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {content}
    </View>
  );

  const renderRow = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    );
  };

  const renderList = (items: string[]) => {
    if (!items || items.length === 0) return null;
    return (
      <View style={styles.listContainer}>
        {items.map((item, index) => (
          <View key={index} style={styles.listItem}>
            <View style={styles.listBullet} />
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Overzicht</Text>
        <View style={styles.pageIndicators}>
          <View style={styles.pageIndicator} />
          <View style={[styles.pageIndicator, { backgroundColor: primary }]} />
          <View style={styles.pageIndicator} />
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Werkbon Type */}
        <View style={[styles.typeCard, { borderLeftColor: primary }]}>
          <Ionicons name="document-text" size={24} color={primary} />
          <Text style={styles.typeText}>{TYPE_LABELS[formData.type] || 'Werkbon'}</Text>
        </View>

        {/* Klant Info */}
        {renderSection('Klantgegevens', (
          <>
            {renderRow('Klant', formData.klant?.naam)}
            {renderRow('Werf', formData.werf?.naam)}
          </>
        ))}

        {/* Type-specific data */}
        {formData.type === 'productie' && renderSection('Productie Details', (
          <>
            {renderRow('Product Type', formData.productType)}
            {renderRow('Hoeveelheid', formData.hoeveelheid ? `${formData.hoeveelheid} ${formData.eenheid}` : null)}
          </>
        ))}

        {formData.type === 'oplevering' && (
          <>
            {renderSection('Oplevering Details', (
              <>
                {renderRow('Omschrijving', formData.omschrijving)}
              </>
            ))}
            {formData.punten?.length > 0 && renderSection('Opleverpunten', renderList(formData.punten))}
          </>
        )}

        {formData.type === 'project' && (
          <>
            {renderSection('Project Details', (
              <>
                {renderRow('Projectnaam', formData.projectNaam)}
              </>
            ))}
            {formData.taken?.length > 0 && renderSection('Uitgevoerde taken', renderList(formData.taken))}
          </>
        )}

        {/* Location */}
        {(formData.gpsAddress || formData.gpsCoords) && renderSection('Locatie', (
          <>
            {renderRow('Adres', formData.gpsAddress)}
            {renderRow('Coördinaten', formData.gpsCoords)}
          </>
        ))}

        {/* Photos */}
        {formData.photos?.length > 0 && renderSection(`Foto's (${formData.photos.length})`, (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
            {formData.photos.map((photo: string, index: number) => (
              <Image key={index} source={{ uri: photo }} style={styles.photoThumbnail} />
            ))}
          </ScrollView>
        ))}

        {/* Notes */}
        {formData.opmerking && renderSection('Opmerkingen', (
          <Text style={styles.noteText}>{formData.opmerking}</Text>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Footer */}
      <View style={[styles.fixedFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: primary }]}
          onPress={handleNext}
        >
          <Text style={styles.primaryButtonText}>Volgende — Ondertekenen</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8E9ED',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F6FA',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1A1A2E', textAlign: 'center' },
  pageIndicators: { flexDirection: 'row', gap: 6, width: 50, justifyContent: 'flex-end' },
  pageIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8E9ED' },
  content: { flex: 1 },
  scrollContent: { padding: 16 },
  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16,
    borderLeftWidth: 4,
  },
  typeText: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  section: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '600', color: '#8C9199', marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F6FA',
  },
  rowLabel: { fontSize: 15, color: '#6c757d', flex: 1 },
  rowValue: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', flex: 2, textAlign: 'right' },
  listContainer: { marginTop: 4 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  listBullet: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5A623',
    marginTop: 6, marginRight: 10,
  },
  listText: { flex: 1, fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  photosScroll: { marginTop: 8 },
  photoThumbnail: {
    width: 80, height: 80, borderRadius: 8, marginRight: 8, backgroundColor: '#E8E9ED',
  },
  noteText: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  fixedFooter: {
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8E9ED',
    paddingHorizontal: 16, paddingTop: 12,
  },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12, minHeight: 56,
  },
  primaryButtonText: { fontSize: 18, fontWeight: '700', color: '#000' },
});
