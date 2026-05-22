// Signybon Theme Colors
// Navy + Green brand palette

export const colors = {
  // Primary brand
  primary: '#0F172A',
  primaryDark: '#020617',
  primaryLight: '#1E293B',

  // Secondary / accent green
  secondary: '#22C55E',
  secondaryDark: '#16A34A',
  secondaryLight: '#4ADE80',

  // Accent (navy light for hover/borders)
  accent: '#1E293B',

  // Background colors
  background: '#E2E8F0',
  backgroundDark: '#CBD5E1',
  backgroundCard: '#FFFFFF',
  backgroundLight: '#F8FAFC',
  backgroundModal: 'rgba(0,0,0,0.5)',

  // Legacy dark (kept for components that still read it; remapped to navy)
  legacyDark: '#0F172A',
  legacyDarkCard: '#1E293B',
  legacyDarkBorder: '#334155',

  // Text colors
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FFFFFF',

  // Status colors
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#DC3545',
  info: '#3B82F6',

  // Border colors
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderDark: '#CBD5E1',

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
