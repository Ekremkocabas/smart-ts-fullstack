import { create } from 'zustand';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Types
export interface Team {
  id: string;
  naam: string;
  leden: string[];
  actief: boolean;
}

export interface Klant {
  id: string;
  naam: string;
  email: string;
  telefoon?: string;
  adres?: string;
  uurtarief: number;
  prijsafspraak?: string;
  btw_nummer?: string;
  actief: boolean;
}

export interface Werf {
  id: string;
  naam: string;
  klant_id: string;
  adres?: string;
  actief: boolean;
}

export interface UrenRegel {
  teamlid_naam: string;
  maandag: number;
  dinsdag: number;
  woensdag: number;
  donderdag: number;
  vrijdag: number;
  zaterdag: number;
  zondag: number;
  afkorting_ma: string;
  afkorting_di: string;
  afkorting_wo: string;
  afkorting_do: string;
  afkorting_vr: string;
  afkorting_za: string;
  afkorting_zo: string;
}

export interface KmRegel {
  maandag: number;
  dinsdag: number;
  woensdag: number;
  donderdag: number;
  vrijdag: number;
  zaterdag: number;
  zondag: number;
}

export interface Werkbon {
  id: string;
  week_nummer: number;
  jaar: number;
  datum_maandag?: string;
  datum_dinsdag?: string;
  datum_woensdag?: string;
  datum_donderdag?: string;
  datum_vrijdag?: string;
  datum_zaterdag?: string;
  datum_zondag?: string;
  klant_id: string;
  klant_naam: string;
  werf_id: string;
  werf_naam: string;
  uren: UrenRegel[];
  km_afstand: KmRegel;
  uitgevoerde_werken: string;
  extra_materialen: string;
  handtekening_data?: string;
  handtekening_naam: string;
  handtekening_datum?: string;
  selfie_data?: string;
  ingevuld_door_id: string;
  ingevuld_door_naam: string;
  status: string;
  email_verzonden: boolean;
  created_at: string;
  updated_at: string;
}

export interface BedrijfsInstellingen {
  id: string;
  bedrijfsnaam: string;
  email: string;
  admin_emails: string[];
  telefoon?: string;
  adres?: string;
  postcode?: string;
  stad?: string;
  kvk_nummer?: string;
  btw_nummer?: string;
  logo_base64?: string;
  pdf_voettekst?: string;
  uren_confirmation_text?: string;
  oplevering_confirmation_text?: string;
  project_confirmation_text?: string;
  selfie_activeren?: boolean;
  sms_verificatie_activeren?: boolean;
  automatisch_naar_klant?: boolean;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
}

export interface AddWerknemerResult extends User {
  tempPassword: string;
  emailSent: boolean;
  emailError?: string;
}

export interface WeekDates {
  datum_maandag: string;
  datum_dinsdag: string;
  datum_woensdag: string;
  datum_donderdag: string;
  datum_vrijdag: string;
  datum_zaterdag: string;
  datum_zondag: string;
}

interface AppState {
  // Data
  teams: Team[];
  klanten: Klant[];
  werven: Werf[];
  werkbonnen: Werkbon[];
  lastUpdatedWerkbon: Werkbon | null;
  werknemers: User[];
  instellingen: BedrijfsInstellingen | null;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchTeams: () => Promise<void>;
  addTeam: (naam: string, leden: string[]) => Promise<void>;
  updateTeam: (id: string, naam: string, leden: string[]) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
  
  fetchKlanten: () => Promise<void>;
  addKlant: (data: Omit<Klant, 'id' | 'actief'>) => Promise<void>;
  updateKlant: (id: string, data: Omit<Klant, 'id' | 'actief'>) => Promise<void>;
  deleteKlant: (id: string) => Promise<void>;
  
  fetchWerven: () => Promise<void>;
  fetchWervenByKlant: (klantId: string) => Promise<Werf[]>;
  addWerf: (data: Omit<Werf, 'id' | 'actief'>) => Promise<void>;
  updateWerf: (id: string, data: Omit<Werf, 'id' | 'actief'>) => Promise<void>;
  deleteWerf: (id: string) => Promise<void>;
  
  fetchWerkbonnen: (options?: { userId?: string; isAdmin?: boolean }) => Promise<void>;
  fetchWerkbon: (id: string) => Promise<Werkbon>;
  createWerkbon: (data: any, userId: string, userName: string) => Promise<Werkbon>;
  updateWerkbon: (id: string, data: any) => Promise<Werkbon>;
  deleteWerkbon: (id: string) => Promise<void>;
  verzendWerkbon: (id: string, klantEmail?: string) => Promise<any>;
  duplicateWerkbon: (id: string, userId: string, userName: string) => Promise<Werkbon>;
  
  fetchWeekDates: (year: number, week: number) => Promise<WeekDates>;
  
  fetchInstellingen: () => Promise<void>;
  updateInstellingen: (data: Partial<BedrijfsInstellingen>) => Promise<void>;
  
  // Werknemer actions
  fetchWerknemers: () => Promise<void>;
  addWerknemer: (email: string, naam: string, teamId?: string) => Promise<AddWerknemerResult>;
  updateWerknemer: (id: string, data: { naam?: string; team_id?: string; actief?: boolean }) => Promise<void>;
  resendWerknemerInfo: (id: string) => Promise<AddWerknemerResult>;
  deleteWerknemer: (id: string) => Promise<void>;
  
  clearError: () => void;
}

export interface User {
  id: string;
  email: string;
  naam: string;
  rol: string;
  team_id?: string;
  actief: boolean;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  teams: [],
  klanten: [],
  werven: [],
  werkbonnen: [],
  lastUpdatedWerkbon: null,
  werknemers: [],
  instellingen: null,
  isLoading: false,
  error: null,
  
  // Team actions
  fetchTeams: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get(`${BACKEND_URL}/api/teams`);
      set({ teams: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
    }
  },
  
  addTeam: async (naam: string, leden: string[]) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/teams`, { naam, leden });
      set(state => ({ teams: [...state.teams, response.data] }));
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },
  
  updateTeam: async (id: string, naam: string, leden: string[]) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/teams/${id}`, { naam, leden });
      set(state => ({
        teams: state.teams.map(t => t.id === id ? response.data : t)
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },
  
  deleteTeam: async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/teams/${id}`);
      set(state => ({ teams: state.teams.filter(t => t.id !== id) }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },
  
  // Klant actions
  fetchKlanten: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get(`${BACKEND_URL}/api/klanten`);
      set({ klanten: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
    }
  },
  
  addKlant: async (data) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/klanten`, data);
      set(state => ({ klanten: [...state.klanten, response.data] }));
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },
  
  updateKlant: async (id, data) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/klanten/${id}`, data);
      set(state => ({
        klanten: state.klanten.map(k => k.id === id ? response.data : k)
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },
  
  deleteKlant: async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/klanten/${id}`);
      set(state => ({ klanten: state.klanten.filter(k => k.id !== id) }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },
  
  // Werf actions
  fetchWerven: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get(`${BACKEND_URL}/api/werven`);
      set({ werven: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
    }
  },
  
  fetchWervenByKlant: async (klantId: string) => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/werven/klant/${klantId}`);
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      return [];
    }
  },
  
  addWerf: async (data) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/werven`, data);
      set(state => ({ werven: [...state.werven, response.data] }));
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },

  updateWerf: async (id, data) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/werven/${id}`, data);
      set(state => ({
        werven: state.werven.map(w => w.id === id ? response.data : w),
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  deleteWerf: async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/werven/${id}`);
      set(state => ({ werven: state.werven.filter(w => w.id !== id) }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },
  
  // Werkbon actions
  fetchWerkbonnen: async (options) => {
    set({ isLoading: true, error: null });
    try {
      const userId = options?.userId;
      if (!userId) {
        throw new Error('Gebruiker niet gevonden voor werkbon overzicht');
      }

      const response = await axios.get(`${BACKEND_URL}/api/werkbonnen`, {
        params: { user_id: userId },
      });
      set({ werkbonnen: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
    }
  },
  
  fetchWerkbon: async (id: string) => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/werkbonnen/${id}`, {
        params: { _ts: Date.now() },
      });
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  createWerkbon: async (data, userId, userName) => {
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/werkbonnen?user_id=${userId}&user_naam=${encodeURIComponent(userName)}`,
        data
      );
      set(state => ({ werkbonnen: [response.data, ...state.werkbonnen], lastUpdatedWerkbon: response.data }));
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  updateWerkbon: async (id, data) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/werkbonnen/${id}`, data);
      set(state => ({
        werkbonnen: state.werkbonnen.some(w => w.id === id)
          ? state.werkbonnen.map(w => w.id === id ? response.data : w)
          : [response.data, ...state.werkbonnen],
        lastUpdatedWerkbon: response.data,
      }));
      return response.data;
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },
  
  deleteWerkbon: async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/werkbonnen/${id}`);
      set(state => ({ werkbonnen: state.werkbonnen.filter(w => w.id !== id) }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },
  
  verzendWerkbon: async (id: string, klantEmail?: string) => {
    try {
      const params: any = {};
      if (klantEmail && klantEmail.trim()) params.klant_email = klantEmail.trim();
      const response = await axios.post(`${BACKEND_URL}/api/werkbonnen/${id}/verzenden`, null, { params });
      set(state => ({
        werkbonnen: state.werkbonnen.map(w => 
          w.id === id
            ? {
                ...w,
                status: response.data.status || w.status,
                email_verzonden: !!response.data.email_sent,
              }
            : w
        ),
        lastUpdatedWerkbon: state.lastUpdatedWerkbon?.id === id
          ? {
              ...state.lastUpdatedWerkbon,
              status: response.data.status || state.lastUpdatedWerkbon.status,
              email_verzonden: !!response.data.email_sent,
            }
          : state.lastUpdatedWerkbon,
      }));
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },

  duplicateWerkbon: async (id: string, userId: string, userName: string) => {
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/werkbonnen/${id}/dupliceer`,
        null,
        { params: { user_id: userId, user_naam: userName } }
      );
      set(state => ({ werkbonnen: [response.data, ...state.werkbonnen], lastUpdatedWerkbon: response.data }));
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  fetchWeekDates: async (year: number, week: number) => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/week-dates/${year}/${week}`);
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  // Instellingen actions
  fetchInstellingen: async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/instellingen`);
      set({ instellingen: response.data });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },
  
  updateInstellingen: async (data) => {
    try {
      const response = await axios.put(`${BACKEND_URL}/api/instellingen`, data);
      set({ instellingen: response.data });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },
  
  // Werknemer actions
  fetchWerknemers: async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/auth/users`);
      set({ werknemers: response.data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },
  
  addWerknemer: async (email: string, naam: string, teamId?: string) => {
    try {
      // Generate random password
      const tempPassword = Math.random().toString(36).slice(-8);
      
      // Use the new endpoint that sends welcome email
      const response = await axios.post(`${BACKEND_URL}/api/auth/register-worker`, null, {
        params: {
          email,
          naam,
          password: tempPassword,
          team_id: teamId || undefined
        }
      });
      
      const { fetchWerknemers } = get();
      await fetchWerknemers();
      
      return { 
        ...response.data.user, 
        tempPassword: response.data.temp_password,
        emailSent: response.data.email_sent,
        emailError: response.data.email_error,
      };
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  updateWerknemer: async (id: string, data: { naam?: string; team_id?: string; actief?: boolean }) => {
    try {
      await axios.put(`${BACKEND_URL}/api/auth/users/${id}`, data);
      const { fetchWerknemers } = get();
      await fetchWerknemers();
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },

  resendWerknemerInfo: async (id: string) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/users/${id}/resend-info`);
      const { fetchWerknemers } = get();
      await fetchWerknemers();
      return {
        ...response.data.user,
        tempPassword: response.data.temp_password,
        emailSent: response.data.email_sent,
        emailError: response.data.email_error,
      };
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  deleteWerknemer: async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/auth/users/${id}`);
      const { fetchWerknemers } = get();
      await fetchWerknemers();
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
      throw error;
    }
  },
  
  clearError: () => set({ error: null }),
}));
