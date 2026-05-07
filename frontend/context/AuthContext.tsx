import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';

// Get backend URL dynamically at runtime (not build time)
const getBackendUrl = (): string => {
  // For web platform - ALWAYS use window.location.origin in production
  // This ensures Railway/Vercel deployments work correctly
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      // Local development only
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8001';
      }
      // ALL other web deployments - use current origin
      // DO NOT use env variables here as they get baked in at build time
      return window.location.origin;
    }
  }
  // For mobile apps only - use env variable
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};

// Create axios instance WITHOUT baseURL - we'll set it dynamically
export const apiClient = axios.create({ timeout: 10000 });

// INTERCEPTOR: Set baseURL dynamically on EVERY request
apiClient.interceptors.request.use(
  async (config) => {
    // Set baseURL dynamically at request time
    const baseURL = getBackendUrl();
    config.baseURL = baseURL;
    
    // Add auth token
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      if (__DEV__) console.error('[apiClient] Error getting token:', error);
    }

    if (__DEV__) console.log('[apiClient] Request to:', config.baseURL + config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// For backward compatibility
const BACKEND_URL = getBackendUrl();
if (__DEV__) console.log('[AuthContext] Initial Backend URL:', BACKEND_URL);

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

export interface PlanLimits {
  werknemers: number | null;
  klanten: number | null;
  werven: number | null;
}

export interface PlanFeatures {
  werkbon_types: string[];
  billit: boolean;
  berichten: boolean;
  planning_advanced: boolean;
  pdf_custom: boolean;
  rapporten_export: boolean;
}

export interface PlanInfo {
  plan: 'basic' | 'pro' | 'free';
  plan_source?: string;
  limits: PlanLimits;
  features: PlanFeatures;
  usage: { werknemers: number; klanten: number; werven: number };
  subscription?: {
    status: string;
    days_remaining: number | null;
    is_active: boolean;
    is_trial_expired: boolean;
    requires_plan_selection?: boolean;
  };
}

interface LoginResponse {
  user: User;
  token: string;
  platform_access: 'web' | 'app' | 'both';
  valid_roles: string[];
  plan_info?: PlanInfo;
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
  planInfo: PlanInfo | null;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<LoginResponse>;
  register: (email: string, password: string, naam: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  refreshPlanInfo: () => Promise<PlanInfo | null>;
  hasFeature: (feature: keyof PlanFeatures) => boolean;
  isWerkbonTypeAllowed: (type: string) => boolean;
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
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  // Configure BOTH axios instances to include token in all requests
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const loadUser = async () => {
    try {
      const [userData, tokenData, platformData, planData, rolesData] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('platformAccess'),
        AsyncStorage.getItem('planInfo'),
        AsyncStorage.getItem('validRoles'),
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
      if (planData) {
        try {
          setPlanInfo(JSON.parse(planData) as PlanInfo);
        } catch {}
      }
      if (rolesData) {
        try {
          const parsed = JSON.parse(rolesData);
          if (Array.isArray(parsed)) setValidRoles(parsed);
        } catch {}
      }
    } catch (error) {
      if (__DEV__) console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const persistPlanInfo = async (info: PlanInfo | null | undefined) => {
    if (info) {
      setPlanInfo(info);
      try {
        await AsyncStorage.setItem('planInfo', JSON.stringify(info));
      } catch {}
    }
  };

  const refreshPlanInfo = async (): Promise<PlanInfo | null> => {
    try {
      const resp = await apiClient.get<PlanInfo>('/api/subscription/plan-info');
      await persistPlanInfo(resp.data);
      return resp.data;
    } catch (error) {
      if (__DEV__) console.warn('[AuthContext] refreshPlanInfo failed:', error);
      return null;
    }
  };

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const response = await axios.post<LoginResponse>(`${BACKEND_URL}/api/auth/login`, {
      email: email.trim().toLowerCase(),
      password,
    });
    
    const { user: userData, token: tokenData, platform_access, valid_roles, plan_info } = response.data;

    // IMMEDIATELY set axios default header before storing
    axios.defaults.headers.common['Authorization'] = `Bearer ${tokenData}`;

    // Store all data — keys must match login.html exactly so a session
    // started there hydrates cleanly on the React side.
    await Promise.all([
      AsyncStorage.setItem('user', JSON.stringify(userData)),
      AsyncStorage.setItem('token', tokenData),
      AsyncStorage.setItem('platformAccess', platform_access),
      AsyncStorage.setItem('validRoles', JSON.stringify(valid_roles || [])),
    ]);

    setUser(userData);
    setToken(tokenData);
    setPlatformAccess(platform_access);
    setValidRoles(valid_roles || []);
    if (plan_info) {
      await persistPlanInfo(plan_info);
    }

    return response.data;
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem('user'),
      AsyncStorage.removeItem('token'),
      AsyncStorage.removeItem('platformAccess'),
      AsyncStorage.removeItem('planInfo'),
      AsyncStorage.removeItem('validRoles'),
    ]);
    setUser(null);
    setToken(null);
    setPlatformAccess(null);
    setValidRoles([]);
    setPlanInfo(null);
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
    const webPanelRoles = ['master_admin', 'admin', 'manager', 'planner', 'platform_admin'];
    return webPanelRoles.includes(user.rol);
  };

  const hasFeature = (feature: keyof PlanFeatures): boolean => {
    // No plan info loaded yet → assume gated features are disabled to avoid flashing UI
    if (!planInfo) return false;
    const value = (planInfo.features as any)[feature];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  };

  const isWerkbonTypeAllowed = (type: string): boolean => {
    if (!planInfo) return type === 'uren';
    const allowed = planInfo.features?.werkbon_types || ['uren'];
    return allowed.includes(type);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        platformAccess,
        validRoles,
        planInfo,
        setUser,
        login,
        register,
        logout,
        changePassword,
        refreshPlanInfo,
        hasFeature,
        isWerkbonTypeAllowed,
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
