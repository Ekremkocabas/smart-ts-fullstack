/**
 * WerkbonLayout - Unified Layout Component for All Werkbon Types
 * 
 * This component provides:
 * - Header with back button and title
 * - Page indicator (Page 1: Form, Page 2: Signature)
 * - ScrollView for form content
 * - Fixed signature area OUTSIDE ScrollView (doesn't scroll!)
 * - Fixed footer with action buttons
 * - Responsive design with useSafeAreaInsets
 * - Legal text
 * 
 * Usage:
 * <WerkbonLayout
 *   title="Productie Werkbon"
 *   page={page}
 *   onBack={() => router.back()}
 *   onNextPage={() => setPage(2)}
 *   onSubmit={handleSubmit}
 *   saving={saving}
 *   signatureRef={signatureRef}
 *   hasSignature={hasSignature}
 *   onSignatureStart={() => setHasSignature(true)}
 *   onSignatureClear={() => setHasSignature(false)}
 * >
 *   {/* Page 1 content - your form fields * /}
 * </WerkbonLayout>
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SignatureCanvas } from './SignatureCanvas';

// Legal text that appears on signature page
const LEGAL_TEXT = `Door ondertekening van deze werkbon bevestigt de klant dat de hierboven beschreven werkzaamheden naar tevredenheid zijn uitgevoerd en dat de gegevens correct zijn. Deze werkbon dient als bewijs van uitgevoerde werkzaamheden en kan worden gebruikt voor facturatie. Bij vragen of opmerkingen kunt u contact opnemen met Smart Tech BV.`;

interface WerkbonLayoutProps {
  // Header
  title: string;
  onBack: () => void;
  
  // Page state
  page: 1 | 2;
  onNextPage: () => void;
  onPreviousPage: () => void;
  
  // Submit
  onSubmit: () => void;
  saving: boolean;
  
  // Signature (for page 2)
  signatureRef: React.MutableRefObject<any>;
  hasSignature: boolean;
  onSignatureStart: () => void;
  onSignatureClear: () => void;
  onSignatureOk?: (signature: string) => void;
  
  // Signature date
  signatureDate: string;
  onSignatureDateChange: (date: string) => void;
  signatureName: string;
  onSignatureNameChange: (name: string) => void;
  
  // Theme
  primaryColor?: string;
  secondaryColor?: string;
  
  // Content
  children: React.ReactNode;
}

export const WerkbonLayout: React.FC<WerkbonLayoutProps> = ({
  title,
  onBack,
  page,
  onNextPage,
  onPreviousPage,
  onSubmit,
  saving,
  signatureRef,
  hasSignature,
  onSignatureStart,
  onSignatureClear,
  onSignatureOk,
  signatureDate,
  onSignatureDateChange,
  signatureName,
  onSignatureNameChange,
  primaryColor = '#F5A623',
  secondaryColor = '#FFFFFF',
  children,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={page === 2 ? onPreviousPage : onBack}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerRight}>
          <View style={[styles.pageIndicator, page === 1 && styles.pageIndicatorActive]} />
          <View style={[styles.pageIndicator, page === 2 && styles.pageIndicatorActive]} />
        </View>
      </View>

      {/* Main Content Area */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {page === 1 ? (
          // Page 1: Scrollable Form
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
            {/* Extra space for fixed footer */}
            <View style={{ height: 100 }} />
          </ScrollView>
        ) : (
          // Page 2: Signature (NOT inside ScrollView!)
          <View style={styles.signaturePage}>
            {/* Scrollable top section */}
            <ScrollView 
              style={styles.signatureScrollSection}
              contentContainerStyle={styles.signatureScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Signature Date */}
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Datum</Text>
                <TextInput
                  style={styles.input}
                  value={signatureDate}
                  onChangeText={onSignatureDateChange}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#8C9199"
                />
              </View>

              {/* Signature Name */}
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Naam ondertekenaar</Text>
                <TextInput
                  style={styles.input}
                  value={signatureName}
                  onChangeText={onSignatureNameChange}
                  placeholder="Volledige naam"
                  placeholderTextColor="#8C9199"
                />
              </View>
            </ScrollView>

            {/* Fixed Signature Canvas - OUTSIDE ScrollView */}
            <View style={styles.signatureFixedSection}>
              <View style={styles.card}>
                <SignatureCanvas
                  signatureRef={signatureRef}
                  onSignatureStart={onSignatureStart}
                  onSignatureClear={onSignatureClear}
                  onSignatureOk={onSignatureOk}
                  primaryColor={primaryColor}
                />
              </View>

              {/* Legal Text */}
              <View style={styles.legalBox}>
                <Ionicons name="document-text-outline" size={18} color="#6c757d" />
                <Text style={styles.legalText}>{LEGAL_TEXT}</Text>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Fixed Footer - Always visible */}
      <View style={[styles.fixedFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {page === 1 ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: primaryColor }]}
            onPress={onNextPage}
          >
            <Text style={[styles.primaryButtonText, { color: secondaryColor }]}>
              Volgende — Handtekening
            </Text>
            <Ionicons name="arrow-forward" size={20} color={secondaryColor} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: primaryColor },
              saving && styles.primaryButtonDisabled,
            ]}
            onPress={onSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={secondaryColor} />
            ) : (
              <>
                <Ionicons name="send" size={20} color={secondaryColor} />
                <Text style={[styles.primaryButtonText, { color: secondaryColor }]}>
                  Opslaan & PDF versturen
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  flex: {
    flex: 1,
  },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 6,
    width: 40,
    justifyContent: 'flex-end',
  },
  pageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8E9ED',
  },
  pageIndicatorActive: {
    backgroundColor: '#F5A623',
  },
  scrollContent: {
    padding: 16,
  },
  signaturePage: {
    flex: 1,
  },
  signatureScrollSection: {
    maxHeight: 180,
  },
  signatureScrollContent: {
    padding: 16,
    paddingBottom: 8,
  },
  signatureFixedSection: {
    flex: 1,
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  legalBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    marginTop: 12,
  },
  legalText: {
    flex: 1,
    fontSize: 12,
    color: '#6c757d',
    lineHeight: 17,
  },
  fixedFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E9ED',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 56,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
});

export default WerkbonLayout;
