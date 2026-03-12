// Smart-TS Theme Colors
// Professional light grey theme for admin portal and app

export const colors = {
  // Primary colors
  primary: '#F5A623',
  primaryDark: '#D4891C',
  primaryLight: '#FFD166',
  
  // Background colors
  background: '#F5F6FA',
  backgroundDark: '#E8E9ED',
  backgroundCard: '#FFFFFF',
  backgroundModal: 'rgba(0,0,0,0.5)',
  
  // Legacy dark theme (for gradual migration)
  legacyDark: '#1a1a2e',
  legacyDarkCard: '#16213e',
  legacyDarkBorder: '#2d3a5f',
  
  // Text colors
  textPrimary: '#1A1A2E',
  textSecondary: '#6C757D',
  textMuted: '#A0A0A0',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FFFFFF',
  
  // Status colors
  success: '#28A745',
  warning: '#FFC107',
  danger: '#DC3545',
  info: '#17A2B8',
  
  // Border colors
  border: '#DEE2E6',
  borderLight: '#E9ECEF',
  borderDark: '#CED4DA',
  
  // Shadows
  shadow: 'rgba(0,0,0,0.1)',
  shadowDark: 'rgba(0,0,0,0.15)',
};

// Status specific colors
export const statusColors = {
  concept: colors.warning,
  ondertekend: colors.success,
  verzonden: colors.primary,
};

// Get status color helper
export const getStatusColor = (status: string): string => {
  return statusColors[status as keyof typeof statusColors] || colors.textSecondary;
};

// Get status label helper
export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    concept: 'Concept',
    ondertekend: 'Ondertekend',
    verzonden: 'Verzonden',
  };
  return labels[status] || status;
};
