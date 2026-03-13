import React, { createContext, useContext, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface AppTheme {
  primaryColor: string;
  secondaryColor: string;
  bedrijfsnaam: string;
  logoBase64?: string;
}

const defaultTheme: AppTheme = {
  primaryColor: '#F5A623',
  secondaryColor: '#1A1A2E',
  bedrijfsnaam: 'Smart-Tech BV',
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
      const res = await fetch(`${API_URL}/api/app-settings`);
      if (res.ok) {
        const data = await res.json();
        setTheme({
          primaryColor: data.primaire_kleur || data.primary_color || defaultTheme.primaryColor,
          secondaryColor: data.secundaire_kleur || data.secondary_color || defaultTheme.secondaryColor,
          bedrijfsnaam: data.bedrijfsnaam || defaultTheme.bedrijfsnaam,
          logoBase64: data.logo_base64 || undefined,
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
