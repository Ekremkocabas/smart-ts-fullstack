import React, { createContext, useContext, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Web: always use current origin (avoids hardcoded Railway URLs baked into app.json)
const getThemeApiUrl = (): string => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getThemeApiUrl();

interface AppTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bedrijfsnaam: string;
  logoBase64?: string;
  pdfFooterText?: string;
  urenConfirmationText?: string;
  opleveringConfirmationText?: string;
  projectConfirmationText?: string;
}

const defaultTheme: AppTheme = {
  primaryColor: '#1B4332',
  secondaryColor: '#F5A623',
  accentColor: '#D4A017',
  bedrijfsnaam: 'Signybon',
};

interface ThemeContextType {
  theme: AppTheme;
  refreshTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  refreshTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(defaultTheme);

  const refreshTheme = async () => {
    try {
      // Include Authorization header if token exists so backend returns tenant-specific settings
      let headers: Record<string, string> = {};
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } else {
        try {
          const token = await AsyncStorage.getItem('token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch {}
      }
      // Lightweight settings (no logo) + logo fetched separately to avoid 106KB payload
      const [settingsRes, logoRes] = await Promise.all([
        fetch(`${API_URL}/api/app-settings`, { headers }),
        fetch(`${API_URL}/api/app-settings/logo`, { headers }),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        let logoBase64: string | undefined = undefined;
        if (logoRes.ok) {
          const logoData = await logoRes.json();
          logoBase64 = logoData.logo_base64 || undefined;
        }
        setTheme({
          primaryColor: data.primaire_kleur || data.primary_color || defaultTheme.primaryColor,
          secondaryColor: data.secundaire_kleur || data.secondary_color || defaultTheme.secondaryColor,
          accentColor: data.accent_color || defaultTheme.accentColor,
          bedrijfsnaam: data.bedrijfsnaam || defaultTheme.bedrijfsnaam,
          logoBase64,
          pdfFooterText: data.pdf_voettekst || undefined,
          urenConfirmationText: data.uren_confirmation_text || undefined,
          opleveringConfirmationText: data.oplevering_confirmation_text || undefined,
          projectConfirmationText: data.project_confirmation_text || undefined,
        });
      }
    } catch (e) {
      console.log('Theme fetch error (using defaults):', e);
    }
  };

  useEffect(() => {
    refreshTheme();
    // Refresh every 5 minutes
    const interval = setInterval(refreshTheme, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
