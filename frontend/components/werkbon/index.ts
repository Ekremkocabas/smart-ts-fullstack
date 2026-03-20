/**
 * Werkbon Components - Unified Export
 * 
 * All shared components for werkbon system:
 * - WerkbonLayout: Main layout with header, footer, signature
 * - SignatureCanvas: Signature pad (web + native)
 * - GPSLocation: GPS with address conversion
 * - PhotoUpload: Photo capture with compression
 * - werkbonStyles: Shared styles
 */

export { WerkbonLayout } from './WerkbonLayout';
export { SignatureCanvas, nativeSignatureStyle } from './SignatureCanvas';
export { GPSLocation } from './GPSLocation';
export { PhotoUpload } from './PhotoUpload';

// Shared styles for werkbon forms
import { StyleSheet } from 'react-native';

export const werkbonStyles = StyleSheet.create({
  // Cards
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
  
  // Section titles
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 12,
  },
  
  // Labels
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  
  // Inputs
  input: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#E8E9ED',
    minHeight: 52,
  },
  inputLarge: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  
  // Selection chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E9ED',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderWidth: 2,
  },
  chipText: {
    fontSize: 14,
    color: '#1A1A2E',
  },
  
  // Picker/Dropdown
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E8E9ED',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#1A1A2E',
  },
  pickerPlaceholder: {
    color: '#8C9199',
  },
  
  // Modal/Overlay
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9ED',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#1A1A2E',
  },
  modalCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '600',
  },
  
  // Row layouts
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  // Flex helpers
  flex: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
});

// Common legal text
export const LEGAL_TEXT = `Door ondertekening van deze werkbon bevestigt de klant dat de hierboven beschreven werkzaamheden naar tevredenheid zijn uitgevoerd en dat de gegevens correct zijn. Deze werkbon dient als bewijs van uitgevoerde werkzaamheden en kan worden gebruikt voor facturatie. Bij vragen of opmerkingen kunt u contact opnemen met Smart Tech BV.`;
