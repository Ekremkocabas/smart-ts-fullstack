import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// ==================== TYPES ====================

interface User {
  id: string;
  email: string;
  naam: string;
  rol: string;
  company_id?: string;
  team_id?: string;
  telefoon?: string;
  actief: boolean;
  werkbon_types?: string[];
  mag_wachtwoord_wijzigen?: boolean;
  must_change_password?: boolean;
  web_access?: boolean;
  app_access?: boolean;
}

interface LoginResponse {
  user: User;
  token: string;
  platform_access: 'web' | 'app' | 'both';
  valid_roles: string[];
}

interface RoleInfo {
  id: string;
  name: string;
  web_access: boolean;
  app_access: boolean;
  permissions: Record<string, boolean>;
  can_assign: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  platformAccess: 'web' | 'app' | 'both' | null;
  validRoles: string[];
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<LoginResponse>;
  register: (email: string, password: string, naam: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  hasWebAccess: () => boolean;
  hasAppAccess: () => boolean;
  isAdmin: () => boolean;
  canAccessWebPanel: () => boolean;
}

// ==================== CONTEXT ====================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ==================== PROVIDER ====================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [platformAccess, setPlatformAccess] = useState<'web' | 'app' | 'both' | null>(null);
  const [validRoles, setValidRoles] = useState<string[]>([]);

  useEffect(() => {
    loadUser();
  }, []);

  // Configure axios to include token in all requests
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const loadUser = async () => {
    try {
      const [userData, tokenData, platformData] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('platformAccess'),
      ]);
      
      if (userData) {
        setUser(JSON.parse(userData));
      }
      if (tokenData) {
        setToken(tokenData);
      }
      if (platformData) {
        setPlatformAccess(platformData as 'web' | 'app' | 'both');
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const response = await axios.post<LoginResponse>(`${BACKEND_URL}/api/auth/login`, {
      email: email.trim().toLowerCase(),
      password,
    });
    
    const { user: userData, token: tokenData, platform_access, valid_roles } = response.data;
    
    // Store all data
    await Promise.all([
      AsyncStorage.setItem('user', JSON.stringify(userData)),
      AsyncStorage.setItem('token', tokenData),
      AsyncStorage.setItem('platformAccess', platform_access),
    ]);
    
    setUser(userData);
    setToken(tokenData);
    setPlatformAccess(platform_access);
    setValidRoles(valid_roles || []);
    
    return response.data;
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem('user'),
      AsyncStorage.removeItem('token'),
      AsyncStorage.removeItem('platformAccess'),
    ]);
    setUser(null);
    setToken(null);
    setPlatformAccess(null);
    setValidRoles([]);
  };

  const register = async (email: string, password: string, naam: string) => {
    const response = await axios.post(`${BACKEND_URL}/api/auth/register`, {
      email: email.trim().toLowerCase(),
      password,
      naam: naam.trim(),
    });
    await AsyncStorage.setItem('user', JSON.stringify(response.data));
    setUser(response.data);
  };

  const changePassword = async (
    currentPassword: string, 
    newPassword: string, 
    confirmPassword: string
  ) => {
    if (!user) {
      throw new Error('Niet ingelogd');
    }
    
    await axios.post(`${BACKEND_URL}/api/auth/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }, {
      params: { user_id: user.id }
    });
    
    // Update user to reflect password change
    const updatedUser = { ...user, must_change_password: false };
    await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  // ==================== ACCESS HELPERS ====================

  const hasWebAccess = (): boolean => {
    if (!user) return false;
    // Check from user object or platform access
    if (user.web_access !== undefined) return user.web_access;
    return platformAccess === 'web' || platformAccess === 'both';
  };

  const hasAppAccess = (): boolean => {
    if (!user) return false;
    // Check from user object or platform access
    if (user.app_access !== undefined) return user.app_access;
    return platformAccess === 'app' || platformAccess === 'both';
  };

  const isAdmin = (): boolean => {
    if (!user) return false;
    return ['master_admin', 'admin'].includes(user.rol);
  };

  const canAccessWebPanel = (): boolean => {
    if (!user) return false;
    const webPanelRoles = ['master_admin', 'admin', 'manager', 'planner'];
    return webPanelRoles.includes(user.rol);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        token,
        isLoading, 
        platformAccess,
        validRoles,
        setUser, 
        login,
        register, 
        logout,
        changePassword,
        hasWebAccess,
        hasAppAccess,
        isAdmin,
        canAccessWebPanel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ==================== HOOK ====================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ==================== ROLE HELPERS ====================

export const WEB_PANEL_ROLES = ['master_admin', 'admin', 'manager', 'planner'];
export const MOBILE_APP_ROLES = ['worker', 'onderaannemer'];

export const ROLE_LABELS: Record<string, string> = {
  master_admin: 'Master Admin',
  admin: 'Admin',
  manager: 'Manager',
  planner: 'Planner',
  worker: 'Werknemer',
  onderaannemer: 'Onderaannemer',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

export function isWebPanelRole(role: string): boolean {
  return WEB_PANEL_ROLES.includes(role);
}

export function isMobileAppRole(role: string): boolean {
  return MOBILE_APP_ROLES.includes(role);
}
