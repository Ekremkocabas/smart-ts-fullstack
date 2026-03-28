/**
 * Unified Werkbon Store
 * Manages form state across all werkbon types with offline support
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==========================================
// TYPES
// ==========================================

export type WerkbonType = 'uren' | 'oplevering' | 'project' | 'prestatie';
export type UnitType = 'm²' | 'm³' | 'meter' | 'stuks' | 'kg' | 'liter';
export type ProjectStatus = 'gestart' | 'in_uitvoering' | 'afgewerkt' | 'niet_afgewerkt' | 'wacht_op_goedkeuring';

export interface PhotoItem {
  id: string;
  uri: string;
  timestamp: string;
}

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface OpleverpuntItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface GPSData {
  address: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  capturedAt: string | null;
  failed: boolean;
  failureReason: string | null;
}

// Uren specific (weekly timesheet)
export interface UrenRegel {
  teamlidNaam: string;
  teamlidId?: string;
  maandag: number;
  dinsdag: number;
  woensdag: number;
  donderdag: number;
  vrijdag: number;
  zaterdag: number;
  zondag: number;
  afkortingMa: string;
  afkortingDi: string;
  afkortingWo: string;
  afkortingDo: string;
  afkortingVr: string;
  afkortingZa: string;
  afkortingZo: string;
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

export interface UrenTypeData {
  weekNummer: number;
  jaar: number;
  urenRegels: UrenRegel[];
  kmAfstand: KmRegel;
  uitgevoerdeWerken: string;
  extraMaterialen: string;
}

export interface OpleveringTypeData {
  omschrijving: string;
  opleverpunten: OpleverpuntItem[];
}

export interface ProjectTypeData {
  projectNaam: string;
  uitgevoerdeWerken: string;
  taken: TaskItem[];
  materialen: string;
  gebruikteMachines: string;
  aantalPersonen: number | null;
  startTime: string | null;
  endTime: string | null;
  status: ProjectStatus;
  vervolgwerkNodig: boolean;
  vervolgwerkBeschrijving: string;
  vervolgactieDatum: string | null;
  hindernissen: string;
  extraWerkUitgevoerd: boolean;
  wachtOpGoedkeuring: boolean;
  wachtOpMateriaal: boolean;
  zone: string;
  contactpersoon: string;
}

// Verdieping item for Prestatie werkbon
export interface VerdiepingItem {
  id: string;
  naam: string; // gelijkvoelers, 1ste verdiep, etc.
  m2: number | null;
  dikteCm: number | null;
}

// Extra werk item for Prestatie werkbon
export interface ExtraWerkItem {
  id: string;
  naam: string; // stofzuiger, schuren, etc.
  m2: number | null;
}

// Product item for Prestatie werkbon
export interface ProductItem {
  id: string;
  productNaam: string; // PUR, Chap, etc.
  verdiepingen: VerdiepingItem[];
  extraWerken: ExtraWerkItem[];
}

export interface PrestatieTypeData {
  werkNaam: string;
  werkOmschrijving: string;
  hoeveelheid: number | null;
  eenheid: UnitType;
  dikteCm: number | null;
  aantalLagen: number | null;
  zone: string;
  // New fields for enhanced prestatie
  producten: ProductItem[];
}

export interface ValidationError {
  field: string;
  message: string;
  step: 1 | 2 | 3 | 4;
}

// Offline queue item
export interface OfflineWerkbon {
  id: string;
  data: any;
  createdAt: string;
  syncStatus: 'pending' | 'syncing' | 'failed';
  syncError?: string;
  retryCount: number;
}

// ==========================================
// STORE STATE
// ==========================================

interface WerkbonFormState {
  // Draft management
  draftId: string | null;
  hasDraft: boolean;
  
  // Current step (1-4)
  currentStep: number;
  
  // Step 1: Type selection
  type: WerkbonType | null;
  
  // Step 2: Common fields
  klantId: string | null;
  klantNaam: string;
  manualKlantNaam: string;
  werfId: string | null;
  werfNaam: string;
  manualWerfNaam: string;
  datum: string;
  opmerkingen: string;
  
  // GPS
  gps: GPSData;

  // Photos
  photos: PhotoItem[];

  // KM afstand heen & terug (shared for all types)
  kmAfstand: KmRegel;
  kmVergoedingtarief: number;

  // Type-specific data
  urenData: UrenTypeData;
  opleveringData: OpleveringTypeData;
  projectData: ProjectTypeData;
  prestatieData: PrestatieTypeData;
  
  // Step 4: Signature
  signerName: string;
  signature: string | null;
  selfie: string | null;
  sendToCustomer: boolean;
  confirmationChecked: boolean;
  
  // SMS (disabled for now)
  signerPhone: string;
  smsVerified: boolean;
  
  // Validation
  validationErrors: ValidationError[];
  
  // Offline queue
  offlineQueue: OfflineWerkbon[];
  
  // UI state
  isSubmitting: boolean;
  submitError: string | null;
}

// ==========================================
// INITIAL VALUES
// ==========================================

const getCurrentWeekNumber = (): number => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const createEmptyUrenRegel = (naam: string = ''): UrenRegel => ({
  teamlidNaam: naam,
  maandag: 8, dinsdag: 8, woensdag: 8, donderdag: 8, vrijdag: 8,
  zaterdag: 0, zondag: 0,
  afkortingMa: '', afkortingDi: '', afkortingWo: '', afkortingDo: '',
  afkortingVr: '', afkortingZa: '', afkortingZo: '',
});

const createEmptyKmRegel = (): KmRegel => ({
  maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0,
});

const initialGPS: GPSData = {
  address: null, lat: null, lng: null, accuracy: null,
  capturedAt: null, failed: false, failureReason: null,
};

const initialUrenData: UrenTypeData = {
  weekNummer: getCurrentWeekNumber(),
  jaar: new Date().getFullYear(),
  urenRegels: [], // Start empty - will be initialized with user name in loadData
  kmAfstand: createEmptyKmRegel(),
  uitgevoerdeWerken: '',
  extraMaterialen: '',
};

const initialOpleveringData: OpleveringTypeData = {
  omschrijving: '',
  opleverpunten: [
    { id: '1', text: 'Werk gecontroleerd', checked: false },
    { id: '2', text: 'Schoongemaakt', checked: false },
    { id: '3', text: 'Klant geïnformeerd', checked: false },
    { id: '4', text: 'Restpunten besproken', checked: false },
  ],
};

const initialProjectData: ProjectTypeData = {
  projectNaam: '',
  uitgevoerdeWerken: '',
  taken: [],
  materialen: '',
  gebruikteMachines: '',
  aantalPersonen: null,
  startTime: null,
  endTime: null,
  status: 'gestart',
  vervolgwerkNodig: false,
  vervolgwerkBeschrijving: '',
  vervolgactieDatum: null,
  hindernissen: '',
  extraWerkUitgevoerd: false,
  wachtOpGoedkeuring: false,
  wachtOpMateriaal: false,
  zone: '',
  contactpersoon: '',
};

const initialPrestatieData: PrestatieTypeData = {
  werkNaam: '',
  werkOmschrijving: '',
  hoeveelheid: null,
  eenheid: 'm²',
  dikteCm: null,
  aantalLagen: null,
  zone: '',
  producten: [],
};

const initialState: WerkbonFormState = {
  draftId: null,
  hasDraft: false,
  currentStep: 1,
  type: null,
  klantId: null,
  klantNaam: '',
  manualKlantNaam: '',
  werfId: null,
  werfNaam: '',
  manualWerfNaam: '',
  datum: new Date().toISOString().split('T')[0],
  opmerkingen: '',
  gps: initialGPS,
  photos: [],
  kmAfstand: createEmptyKmRegel(),
  kmVergoedingtarief: 0,
  urenData: initialUrenData,
  opleveringData: initialOpleveringData,
  projectData: initialProjectData,
  prestatieData: initialPrestatieData,
  signerName: '',
  signature: null,
  selfie: null,
  sendToCustomer: true,
  confirmationChecked: false,
  signerPhone: '',
  smsVerified: false,
  validationErrors: [],
  offlineQueue: [],
  isSubmitting: false,
  submitError: null,
};

// ==========================================
// STORE ACTIONS
// ==========================================

interface WerkbonFormActions {
  // Step navigation
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  
  // Type selection
  setType: (type: WerkbonType) => void;
  
  // Common fields
  setKlant: (id: string | null, naam: string) => void;
  setManualKlant: (naam: string) => void;
  setWerf: (id: string | null, naam: string) => void;
  setManualWerf: (naam: string) => void;
  setDatum: (datum: string) => void;
  setOpmerkingen: (text: string) => void;
  
  // GPS
  setGPS: (gps: Partial<GPSData>) => void;
  
  // Photos
  addPhoto: (photo: PhotoItem) => void;
  removePhoto: (id: string) => void;

  // KM afstand
  updateKmAfstand: (dag: string, value: number) => void;
  setKmAfstand: (km: KmRegel) => void;
  setKmVergoedingtarief: (value: number) => void;

  // Type-specific
  setUrenData: (data: Partial<UrenTypeData>) => void;
  addUrenRegel: (naam?: string) => void;
  removeUrenRegel: (index: number) => void;
  updateUrenRegel: (index: number, data: Partial<UrenRegel>) => void;
  setOpleveringData: (data: Partial<OpleveringTypeData>) => void;
  toggleOpleverpunt: (id: string) => void;
  addOpleverpunt: (text: string) => void;
  setProjectData: (data: Partial<ProjectTypeData>) => void;
  addProjectTaak: (text: string) => void;
  toggleProjectTaak: (id: string) => void;
  removeProjectTaak: (id: string) => void;
  setPrestatieData: (data: Partial<PrestatieTypeData>) => void;
  
  // Signature
  setSignerName: (name: string) => void;
  setSignature: (data: string | null) => void;
  setSelfie: (data: string | null) => void;
  setSendToCustomer: (send: boolean) => void;
  setConfirmationChecked: (checked: boolean) => void;
  
  // Initialize uren with user name
  initializeUrenWithUser: (userName: string) => void;
  
  // Validation
  validateStep: (step: number) => ValidationError[];
  validateAll: () => ValidationError[];
  clearErrors: () => void;
  
  // Draft management
  startNewDraft: () => void;
  clearDraft: () => void;
  
  // Offline queue
  addToOfflineQueue: (werkbon: OfflineWerkbon) => void;
  removeFromOfflineQueue: (id: string) => void;
  updateOfflineStatus: (id: string, status: 'pending' | 'syncing' | 'failed', error?: string) => void;
  
  // Submit
  setSubmitting: (submitting: boolean) => void;
  setSubmitError: (error: string | null) => void;
  
  // Get current type data
  getTypeData: () => any;
}

// ==========================================
// STORE IMPLEMENTATION
// ==========================================

export const useWerkbonFormStore = create<WerkbonFormState & WerkbonFormActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      // Step navigation
      setStep: (step) => set({ currentStep: step }),
      nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 4) })),
      prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
      
      // Type selection
      setType: (type) => set({ 
        type, 
        currentStep: 2,
        hasDraft: true,
        draftId: get().draftId || `draft_${Date.now()}`,
      }),
      
      // Common fields
      setKlant: (id, naam) => set({ klantId: id, klantNaam: naam, manualKlantNaam: '' }),
      setManualKlant: (naam) => set({ klantId: null, klantNaam: '', manualKlantNaam: naam }),
      setWerf: (id, naam) => set({ werfId: id, werfNaam: naam, manualWerfNaam: '' }),
      setManualWerf: (naam) => set({ werfId: null, werfNaam: '', manualWerfNaam: naam }),
      setDatum: (datum) => set({ datum }),
      setOpmerkingen: (text) => set({ opmerkingen: text }),
      
      // GPS
      setGPS: (gps) => set((state) => ({ gps: { ...state.gps, ...gps } })),
      
      // Photos
      addPhoto: (photo) => set((state) => ({ photos: [...state.photos, photo] })),
      removePhoto: (id) => set((state) => ({ photos: state.photos.filter(p => p.id !== id) })),

      // KM afstand
      updateKmAfstand: (dag, value) => set((state) => ({ kmAfstand: { ...state.kmAfstand, [dag]: value } })),
      setKmAfstand: (km) => set({ kmAfstand: km }),
      setKmVergoedingtarief: (value) => set({ kmVergoedingtarief: value }),

      // Uren specific
      setUrenData: (data) => set((state) => ({ urenData: { ...state.urenData, ...data } })),
      addUrenRegel: (naam = '') => set((state) => ({
        urenData: {
          ...state.urenData,
          urenRegels: [...state.urenData.urenRegels, createEmptyUrenRegel(naam)],
        },
      })),
      removeUrenRegel: (index) => set((state) => ({
        urenData: {
          ...state.urenData,
          urenRegels: state.urenData.urenRegels.filter((_, i) => i !== index),
        },
      })),
      updateUrenRegel: (index, data) => set((state) => {
        const regels = [...state.urenData.urenRegels];
        regels[index] = { ...regels[index], ...data };
        return { urenData: { ...state.urenData, urenRegels: regels } };
      }),
      
      // Oplevering specific
      setOpleveringData: (data) => set((state) => ({ opleveringData: { ...state.opleveringData, ...data } })),
      toggleOpleverpunt: (id) => set((state) => ({
        opleveringData: {
          ...state.opleveringData,
          opleverpunten: state.opleveringData.opleverpunten.map(p =>
            p.id === id ? { ...p, checked: !p.checked } : p
          ),
        },
      })),
      addOpleverpunt: (text) => set((state) => ({
        opleveringData: {
          ...state.opleveringData,
          opleverpunten: [
            ...state.opleveringData.opleverpunten,
            { id: `op_${Date.now()}`, text, checked: false },
          ],
        },
      })),
      
      // Project specific
      setProjectData: (data) => set((state) => ({ projectData: { ...state.projectData, ...data } })),
      addProjectTaak: (text) => set((state) => ({
        projectData: {
          ...state.projectData,
          taken: [...state.projectData.taken, { id: `task_${Date.now()}`, text, completed: false }],
        },
      })),
      toggleProjectTaak: (id) => set((state) => ({
        projectData: {
          ...state.projectData,
          taken: state.projectData.taken.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
          ),
        },
      })),
      removeProjectTaak: (id) => set((state) => ({
        projectData: {
          ...state.projectData,
          taken: state.projectData.taken.filter(t => t.id !== id),
        },
      })),
      
      // Prestatie specific
      setPrestatieData: (data) => set((state) => ({ prestatieData: { ...state.prestatieData, ...data } })),
      
      // Signature
      setSignerName: (name) => set({ signerName: name }),
      setSignature: (data) => set({ signature: data }),
      setSelfie: (data) => set({ selfie: data }),
      setSendToCustomer: (send) => set({ sendToCustomer: send }),
      setConfirmationChecked: (checked) => set({ confirmationChecked: checked }),
      
      // Initialize uren with user name
      initializeUrenWithUser: (userName) => set((state) => {
        const currentRegels = state.urenData.urenRegels;
        const firstRow = currentRegels[0];
        // Only update if first row has empty name
        if (firstRow && (!firstRow.teamlidNaam || firstRow.teamlidNaam.trim() === '')) {
          return {
            urenData: {
              ...state.urenData,
              urenRegels: [
                { ...firstRow, teamlidNaam: userName },
                ...currentRegels.slice(1),
              ],
            },
          };
        }
        return state;
      }),
      
      // Validation
      validateStep: (step) => {
        const state = get();
        const errors: ValidationError[] = [];
        
        if (step === 1) {
          if (!state.type) {
            errors.push({ field: 'type', message: 'Selecteer een werkbon type', step: 1 });
          }
        }
        
        if (step === 2) {
          // Klant required
          if (!state.klantId && !state.manualKlantNaam.trim()) {
            errors.push({ field: 'klant', message: 'Klant is verplicht', step: 2 });
          }
          
          // Type-specific validation
          if (state.type === 'uren') {
            const validRegels = state.urenData.urenRegels.filter(r => r.teamlidNaam.trim());
            if (validRegels.length === 0) {
              errors.push({ field: 'urenRegels', message: 'Voeg minstens één teamlid toe', step: 2 });
            }
          }
          
          if (state.type === 'oplevering') {
            if (!state.opleveringData.omschrijving.trim()) {
              errors.push({ field: 'omschrijving', message: 'Omschrijving is verplicht', step: 2 });
            }
          }
          
          if (state.type === 'project') {
            if (!state.projectData.projectNaam.trim()) {
              errors.push({ field: 'projectNaam', message: 'Project naam is verplicht', step: 2 });
            }
            if (!state.projectData.uitgevoerdeWerken.trim()) {
              errors.push({ field: 'uitgevoerdeWerken', message: 'Uitgevoerde werken is verplicht', step: 2 });
            }
          }
          
          if (state.type === 'prestatie') {
            if (!state.prestatieData.werkNaam.trim()) {
              errors.push({ field: 'werkNaam', message: 'Werk/product naam is verplicht', step: 2 });
            }
            if (!state.prestatieData.hoeveelheid || state.prestatieData.hoeveelheid <= 0) {
              errors.push({ field: 'hoeveelheid', message: 'Hoeveelheid is verplicht', step: 2 });
            }
          }
        }
        
        if (step === 4) {
          if (!state.signerName.trim()) {
            errors.push({ field: 'signerName', message: 'Naam ondertekenaar is verplicht', step: 4 });
          }
          if (!state.signature) {
            errors.push({ field: 'signature', message: 'Handtekening is verplicht', step: 4 });
          }
          if (!state.confirmationChecked) {
            errors.push({ field: 'confirmation', message: 'Bevestig de gegevens', step: 4 });
          }
        }
        
        set({ validationErrors: errors });
        return errors;
      },
      
      validateAll: () => {
        const errors1 = get().validateStep(1);
        const errors2 = get().validateStep(2);
        const errors4 = get().validateStep(4);
        const allErrors = [...errors1, ...errors2, ...errors4];
        set({ validationErrors: allErrors });
        return allErrors;
      },
      
      clearErrors: () => set({ validationErrors: [] }),
      
      // Draft management
      startNewDraft: () => set({
        ...initialState,
        draftId: `draft_${Date.now()}`,
        hasDraft: false,
        offlineQueue: get().offlineQueue, // Keep offline queue
      }),
      
      clearDraft: () => set({
        ...initialState,
        offlineQueue: get().offlineQueue, // Keep offline queue
      }),
      
      // Offline queue
      addToOfflineQueue: (werkbon) => set((state) => ({
        offlineQueue: [...state.offlineQueue, werkbon],
      })),
      
      removeFromOfflineQueue: (id) => set((state) => ({
        offlineQueue: state.offlineQueue.filter(w => w.id !== id),
      })),
      
      updateOfflineStatus: (id, status, error) => set((state) => ({
        offlineQueue: state.offlineQueue.map(w =>
          w.id === id ? { ...w, syncStatus: status, syncError: error, retryCount: w.retryCount + (status === 'failed' ? 1 : 0) } : w
        ),
      })),
      
      // Submit
      setSubmitting: (submitting) => set({ isSubmitting: submitting }),
      setSubmitError: (error) => set({ submitError: error }),
      
      // Get type data
      getTypeData: () => {
        const state = get();
        switch (state.type) {
          case 'uren': return state.urenData;
          case 'oplevering': return state.opleveringData;
          case 'project': return state.projectData;
          case 'prestatie': return state.prestatieData;
          default: return null;
        }
      },
    }),
    {
      name: 'werkbon-form-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Persist these fields
        draftId: state.draftId,
        hasDraft: state.hasDraft,
        type: state.type,
        klantId: state.klantId,
        klantNaam: state.klantNaam,
        manualKlantNaam: state.manualKlantNaam,
        werfId: state.werfId,
        werfNaam: state.werfNaam,
        manualWerfNaam: state.manualWerfNaam,
        datum: state.datum,
        opmerkingen: state.opmerkingen,
        gps: state.gps,
        photos: state.photos,
        kmAfstand: state.kmAfstand,
        urenData: state.urenData,
        opleveringData: state.opleveringData,
        projectData: state.projectData,
        prestatieData: state.prestatieData,
        signerName: state.signerName,
        sendToCustomer: state.sendToCustomer,
        offlineQueue: state.offlineQueue,
        // NOT persisted: signature, selfie (too large), isSubmitting, errors
      }),
    }
  )
);

// Helper exports
export { createEmptyUrenRegel, createEmptyKmRegel, getCurrentWeekNumber };
