import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Dimensions,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, apiClient } from '../../context/AuthContext';
import Constants from 'expo-constants';

// Determine API URL - ALWAYS use window.location.origin for web production
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    // Production - use current origin, NO env variables
    return window.location.origin;
  }
  // Mobile only
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

// Responsive helper
const getScreenSize = () => {
  const { width } = Dimensions.get('window');
  if (width < 480) return 'phone';
  if (width < 768) return 'tablet';
  return 'desktop';
};

// Types
interface KlantAdres {
  straat: string;
  huisnummer: string;
  bus: string;
  postcode: string;
  stad: string;
  land: string;
}

interface ContactPersoon {
  id: string;
  naam: string;
  functie: string;
  email: string;
  telefoon: string;
  gsm: string;
  opmerkingen: string;
  is_primair: boolean;
}

interface Klant {
  id: string;
  bedrijfsnaam: string;
  naam?: string;
  btw_nummer: string;
  ondernemingsnummer: string;
  type_klant: string;
  algemeen_email: string;
  email?: string;
  algemeen_telefoon: string;
  telefoon?: string;
  website: string;
  adres?: string;
  adres_structured: KlantAdres;
  contactpersonen: ContactPersoon[];
  klant_mail_sturen: boolean;
  primary_mail_recipient: string;
  cc_mail_recipient: string;
  prijsmodel: string;
  standaard_uurtarief: number;
  km_vergoeding_tarief?: number;
  standaard_dagtarief: number;
  standaard_vaste_prijs: number;
  betaaltermijn: number;
  interne_opmerking_prijsafspraak: string;
  facturatie_email: string;
  facturatie_telefoon: string;
  facturatie_contactpersoon: string;
  facturatie_adres_zelfde: boolean;
  facturatie_adres?: KlantAdres;
  klantnummer: string;
  interne_referentie: string;
  opmerkingen: string;
  actief: boolean;
}

const CONTACT_FUNCTIES = [
  'electricien',
  'hulp_electricien',
  'werfleider',
  'projectleider',
  'aankoper',
  'boekhouder',
  'zaakvoerder',
];

const PRIJS_MODELLEN = [
  { key: 'uurtarief', label: 'Uurtarief' },
  { key: 'vaste_prijs', label: 'Vaste Prijs' },
  { key: 'regie', label: 'Regie' },
  { key: 'nog_te_bepalen', label: 'Nog te bepalen' },
];

const BETAALTERMIJNEN = [30, 45, 60];

const emptyAdres: KlantAdres = {
  straat: '', huisnummer: '', bus: '', postcode: '', stad: '', land: 'België'
};

const emptyKlant: Klant = {
  id: '',
  bedrijfsnaam: '',
  btw_nummer: '',
  ondernemingsnummer: '',
  type_klant: 'bedrijf',
  algemeen_email: '',
  algemeen_telefoon: '',
  website: '',
  adres_structured: { ...emptyAdres },
  contactpersonen: [],
  klant_mail_sturen: true,
  primary_mail_recipient: '',
  cc_mail_recipient: '',
  prijsmodel: 'uurtarief',
  standaard_uurtarief: 0,
  km_vergoeding_tarief: 0,
  standaard_dagtarief: 0,
  standaard_vaste_prijs: 0,
  betaaltermijn: 30,
  interne_opmerking_prijsafspraak: '',
  facturatie_email: '',
  facturatie_telefoon: '',
  facturatie_contactpersoon: '',
  facturatie_adres_zelfde: true,
  facturatie_adres: { ...emptyAdres },
  klantnummer: '',
  interne_referentie: '',
  opmerkingen: '',
  actief: true,
};

export default function KlantenAdmin() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingKlant, setEditingKlant] = useState<Klant | null>(null);
  const [formData, setFormData] = useState<Klant>({ ...emptyKlant });
  const [saving, setSaving] = useState(false);
  const [screenSize, setScreenSize] = useState(getScreenSize());
  const [activeSection, setActiveSection] = useState(0);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactPersoon | null>(null);
  const [contactForm, setContactForm] = useState<ContactPersoon>({
    id: '', naam: '', functie: '', email: '', telefoon: '', gsm: '', opmerkingen: '', is_primair: false
  });
  const [customFunctie, setCustomFunctie] = useState('');

  // Helper to create auth headers
  const getAuthConfig = () => ({
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // Handle screen resize
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setScreenSize(getScreenSize());
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => { 
    // Wait for auth to be loaded and check permissions
    if (Platform.OS === 'web' && token && !authLoading && ['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
      fetchKlanten(); 
    }
  }, [user, token, authLoading]);

  const fetchKlanten = async () => {
    if (!token) {
      console.warn('No token available for API requests');
      return;
    }
    
    try {
      setLoading(true);
      const res = await apiClient.get('/api/klanten', getAuthConfig());
      setKlanten(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching klanten:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingKlant(null);
    setFormData({ ...emptyKlant });
    setActiveSection(0);
    setShowModal(true);
  };

  const openEditModal = (k: Klant) => {
    setEditingKlant(k);
    setFormData({
      ...emptyKlant,
      ...k,
      adres_structured: k.adres_structured || { ...emptyAdres },
      contactpersonen: k.contactpersonen || [],
      facturatie_adres: k.facturatie_adres || { ...emptyAdres },
    });
    setActiveSection(0);
    setShowModal(true);
  };

  const saveKlant = async () => {
    if (!formData.bedrijfsnaam.trim()) { alert('Bedrijfsnaam is verplicht'); return; }
    if (!token) { alert('Sessie verlopen, log opnieuw in'); return; }
    
    setSaving(true);
    try {
      const payload = {
        ...formData,
        naam: formData.bedrijfsnaam, // Sync legacy field
        email: formData.algemeen_email, // Sync legacy field
      };
      
      if (editingKlant) {
        await apiClient.put(`/api/klanten/${editingKlant.id}`, payload, getAuthConfig());
      } else {
        await apiClient.post('/api/klanten', payload, getAuthConfig());
      }
      setShowModal(false);
      fetchKlanten();
    } catch (error: any) {
      console.error('Error saving klant:', error);
      alert(error.response?.data?.detail || 'Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  const deleteKlant = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze klant wilt deactiveren?')) return;
    if (!token) { alert('Sessie verlopen, log opnieuw in'); return; }
    
    try {
      await apiClient.delete(`/api/klanten/${id}`, getAuthConfig());
      fetchKlanten();
    } catch (error: any) {
      console.error('Error deleting klant:', error);
      alert(error.response?.data?.detail || 'Fout bij verwijderen');
    }
  };

  // Contact person management
  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ id: '', naam: '', functie: '', email: '', telefoon: '', gsm: '', opmerkingen: '', is_primair: false });
    setCustomFunctie('');
    setShowContactModal(true);
  };

  const openEditContact = (contact: ContactPersoon) => {
    setEditingContact(contact);
    const isPredefined = CONTACT_FUNCTIES.includes(contact.functie);
    setContactForm({ ...contact, functie: isPredefined ? contact.functie : 'custom' });
    setCustomFunctie(isPredefined ? '' : contact.functie);
    setShowContactModal(true);
  };

  const saveContact = () => {
    if (!contactForm.naam.trim()) { alert('Naam is verplicht'); return; }
    
    const finalFunctie = contactForm.functie === 'custom' ? customFunctie : contactForm.functie;
    const newContact: ContactPersoon = {
      ...contactForm,
      id: editingContact?.id || `contact-${Date.now()}`,
      functie: finalFunctie,
    };
    
    if (editingContact) {
      setFormData({
        ...formData,
        contactpersonen: formData.contactpersonen.map(c => c.id === editingContact.id ? newContact : c)
      });
    } else {
      setFormData({
        ...formData,
        contactpersonen: [...formData.contactpersonen, newContact]
      });
    }
    setShowContactModal(false);
  };

  const deleteContact = (id: string) => {
    setFormData({
      ...formData,
      contactpersonen: formData.contactpersonen.filter(c => c.id !== id)
    });
  };

  const updateAdres = (field: keyof KlantAdres, value: string) => {
    setFormData({
      ...formData,
      adres_structured: { ...formData.adres_structured, [field]: value }
    });
  };

  const updateFacturatieAdres = (field: keyof KlantAdres, value: string) => {
    setFormData({
      ...formData,
      facturatie_adres: { ...(formData.facturatie_adres || emptyAdres), [field]: value }
    });
  };

  if (Platform.OS !== 'web') return null;
  
  // Show loading while auth state is being resolved
  if (authLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.loadingText}>Laden...</Text>
        </View>
      </View>
    );
  }
  
  if (!['beheerder', 'admin', 'manager', 'master_admin'].includes(user?.rol || '')) {
    return (
      <View style={styles.container}>
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={64} color="#dc3545" />
          <Text style={styles.noAccessText}>Geen toegang</Text>
        </View>
      </View>
    );
  }

  const isCompact = screenSize === 'phone';
  const filteredKlanten = klanten.filter(k => 
    (k.bedrijfsnaam || k.naam || '').toLowerCase().includes(search.toLowerCase()) ||
    (k.klantnummer || '').toLowerCase().includes(search.toLowerCase()) ||
    (k.algemeen_email || k.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const sections = [
    { key: 'bedrijf', label: 'Bedrijf', icon: 'business-outline' },
    { key: 'adres', label: 'Adres', icon: 'location-outline' },
    { key: 'contacten', label: 'Contacten', icon: 'people-outline' },
    { key: 'communicatie', label: 'Communicatie', icon: 'mail-outline' },
    { key: 'prijs', label: 'Prijs', icon: 'pricetag-outline' },
    { key: 'facturatie', label: 'Facturatie', icon: 'receipt-outline' },
    { key: 'extra', label: 'Extra', icon: 'document-text-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Klanten</Text>
          {!isCompact && <Text style={styles.subtitle}>{klanten.length} klanten • B2B klantenbeheer</Text>}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={22} color="#fff" />
          {!isCompact && <Text style={styles.addBtnText}>Nieuwe Klant</Text>}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, isCompact && styles.searchBarCompact]}>
        <Ionicons name="search-outline" size={20} color="#6c757d" />
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek op naam, klantnummer of e-mail..."
          placeholderTextColor="#6c757d"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color="#6c757d" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color="#F5A623" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {filteredKlanten.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color="#E8E9ED" />
              <Text style={styles.emptyText}>Geen klanten gevonden</Text>
            </View>
          ) : (
            filteredKlanten.map((klant) => (
              <TouchableOpacity key={klant.id} style={[styles.klantCard, isCompact && styles.klantCardCompact]} onPress={() => openEditModal(klant)}>
                <View style={styles.klantHeader}>
                  <View style={styles.klantInfo}>
                    <View style={styles.klantNameRow}>
                      <Text style={styles.klantName}>{klant.bedrijfsnaam || klant.naam}</Text>
                      {klant.klantnummer && (
                        <View style={styles.klantnummerBadge}>
                          <Text style={styles.klantnummerText}>{klant.klantnummer}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.klantMeta}>
                      {(klant.algemeen_email || klant.email) && (
                        <View style={styles.metaItem}>
                          <Ionicons name="mail-outline" size={14} color="#6c757d" />
                          <Text style={styles.metaText}>{klant.algemeen_email || klant.email}</Text>
                        </View>
                      )}
                      {(klant.algemeen_telefoon || klant.telefoon) && (
                        <View style={styles.metaItem}>
                          <Ionicons name="call-outline" size={14} color="#6c757d" />
                          <Text style={styles.metaText}>{klant.algemeen_telefoon || klant.telefoon}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.klantActions}>
                    <View style={[styles.prijsmodelBadge, { backgroundColor: klant.prijsmodel === 'uurtarief' ? '#3498db20' : klant.prijsmodel === 'vaste_prijs' ? '#27ae6020' : '#F5A62320' }]}>
                      <Text style={[styles.prijsmodelText, { color: klant.prijsmodel === 'uurtarief' ? '#3498db' : klant.prijsmodel === 'vaste_prijs' ? '#27ae60' : '#F5A623' }]}>
                        {PRIJS_MODELLEN.find(p => p.key === klant.prijsmodel)?.label || klant.prijsmodel}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={(e) => { e.stopPropagation(); deleteKlant(klant.id); }}>
                      <Ionicons name="trash-outline" size={18} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                </View>
                {!isCompact && (
                  <View style={styles.klantDetails}>
                    {klant.btw_nummer && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>BTW:</Text>
                        <Text style={styles.detailValue}>{klant.btw_nummer}</Text>
                      </View>
                    )}
                    {klant.standaard_uurtarief > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Uurtarief:</Text>
                        <Text style={styles.detailValue}>€{klant.standaard_uurtarief.toFixed(2)}</Text>
                      </View>
                    )}
                    {klant.betaaltermijn && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Betaaltermijn:</Text>
                        <Text style={styles.detailValue}>{klant.betaaltermijn} dagen</Text>
                      </View>
                    )}
                    {klant.contactpersonen?.length > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Contacten:</Text>
                        <Text style={styles.detailValue}>{klant.contactpersonen.length}</Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* Main Modal - Klant Form */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isCompact && styles.modalContentCompact]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingKlant ? 'Klant Bewerken' : 'Nieuwe Klant'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color="#1A1A2E" />
              </TouchableOpacity>
            </View>

            {/* Section Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabs}>
              {sections.map((section, index) => (
                <TouchableOpacity
                  key={section.key}
                  style={[styles.sectionTab, activeSection === index && styles.sectionTabActive]}
                  onPress={() => setActiveSection(index)}
                >
                  <Ionicons name={section.icon as any} size={18} color={activeSection === index ? '#F5A623' : '#6c757d'} />
                  {!isCompact && <Text style={[styles.sectionTabText, activeSection === index && styles.sectionTabTextActive]}>{section.label}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Form Content */}
            <ScrollView style={styles.formContent}>
              {/* Section 0: Bedrijfsgegevens */}
              {activeSection === 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Bedrijfsgegevens</Text>
                  
                  <Text style={styles.label}>{formData.type_klant === 'particulier' ? 'Naam *' : 'Bedrijfsnaam *'}</Text>
                  <TextInput style={styles.input} value={formData.bedrijfsnaam} onChangeText={(v) => setFormData({ ...formData, bedrijfsnaam: v })} placeholder={formData.type_klant === 'particulier' ? 'Volledige naam' : 'Bedrijfsnaam'} placeholderTextColor="#6c757d" />
                  
                  <Text style={styles.label}>Type klant</Text>
                  <View style={styles.typeToggle}>
                    <TouchableOpacity style={[styles.typeBtn, formData.type_klant === 'bedrijf' && styles.typeBtnActive]} onPress={() => setFormData({ ...formData, type_klant: 'bedrijf' })}>
                      <Ionicons name="business" size={18} color={formData.type_klant === 'bedrijf' ? '#fff' : '#6c757d'} />
                      <Text style={[styles.typeBtnText, formData.type_klant === 'bedrijf' && styles.typeBtnTextActive]}>Bedrijf</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeBtn, formData.type_klant === 'particulier' && styles.typeBtnActive]} onPress={() => setFormData({ ...formData, type_klant: 'particulier' })}>
                      <Ionicons name="person" size={18} color={formData.type_klant === 'particulier' ? '#fff' : '#6c757d'} />
                      <Text style={[styles.typeBtnText, formData.type_klant === 'particulier' && styles.typeBtnTextActive]}>Particulier</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Only show company fields for bedrijf type */}
                  {formData.type_klant === 'bedrijf' && (
                    <View style={[styles.row, isCompact && styles.rowCompact]}>
                      <View style={styles.halfField}>
                        <Text style={styles.label}>BTW-nummer</Text>
                        <TextInput style={styles.input} value={formData.btw_nummer} onChangeText={(v) => setFormData({ ...formData, btw_nummer: v })} placeholder="BE0123456789" placeholderTextColor="#6c757d" />
                      </View>
                      <View style={styles.halfField}>
                        <Text style={styles.label}>Ondernemingsnummer</Text>
                        <TextInput style={styles.input} value={formData.ondernemingsnummer} onChangeText={(v) => setFormData({ ...formData, ondernemingsnummer: v })} placeholder="0123.456.789" placeholderTextColor="#6c757d" />
                      </View>
                    </View>
                  )}
                  
                  <Text style={styles.label}>Algemeen e-mailadres</Text>
                  <TextInput style={styles.input} value={formData.algemeen_email} onChangeText={(v) => setFormData({ ...formData, algemeen_email: v })} placeholder="info@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
                  
                  <Text style={styles.label}>Algemeen telefoonnummer</Text>
                  <TextInput style={styles.input} value={formData.algemeen_telefoon} onChangeText={(v) => setFormData({ ...formData, algemeen_telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
                  
                  {formData.type_klant === 'bedrijf' && (
                    <>
                      <Text style={styles.label}>Website</Text>
                      <TextInput style={styles.input} value={formData.website} onChangeText={(v) => setFormData({ ...formData, website: v })} placeholder="https://www.bedrijf.be" placeholderTextColor="#6c757d" />
                    </>
                  )}
                </View>
              )}

              {/* Section 1: Adres */}
              {activeSection === 1 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Hoofdadres</Text>
                  
                  <View style={[styles.row, isCompact && styles.rowCompact]}>
                    <View style={{ flex: 3 }}>
                      <Text style={styles.label}>Straat</Text>
                      <TextInput style={styles.input} value={formData.adres_structured.straat} onChangeText={(v) => updateAdres('straat', v)} placeholder="Straatnaam" placeholderTextColor="#6c757d" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.label}>Nr.</Text>
                      <TextInput style={styles.input} value={formData.adres_structured.huisnummer} onChangeText={(v) => updateAdres('huisnummer', v)} placeholder="123" placeholderTextColor="#6c757d" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.label}>Bus</Text>
                      <TextInput style={styles.input} value={formData.adres_structured.bus} onChangeText={(v) => updateAdres('bus', v)} placeholder="A" placeholderTextColor="#6c757d" />
                    </View>
                  </View>
                  
                  <View style={[styles.row, isCompact && styles.rowCompact]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Postcode</Text>
                      <TextInput style={styles.input} value={formData.adres_structured.postcode} onChangeText={(v) => updateAdres('postcode', v)} placeholder="1000" placeholderTextColor="#6c757d" />
                    </View>
                    <View style={{ flex: 2, marginLeft: 12 }}>
                      <Text style={styles.label}>Stad</Text>
                      <TextInput style={styles.input} value={formData.adres_structured.stad} onChangeText={(v) => updateAdres('stad', v)} placeholder="Brussel" placeholderTextColor="#6c757d" />
                    </View>
                  </View>
                  
                  <Text style={styles.label}>Land</Text>
                  <TextInput style={styles.input} value={formData.adres_structured.land} onChangeText={(v) => updateAdres('land', v)} placeholder="België" placeholderTextColor="#6c757d" />
                </View>
              )}

              {/* Section 2: Contactpersonen */}
              {activeSection === 2 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Contactpersonen</Text>
                    <TouchableOpacity style={styles.addContactBtn} onPress={openAddContact}>
                      <Ionicons name="add" size={20} color="#fff" />
                      <Text style={styles.addContactBtnText}>Toevoegen</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {formData.contactpersonen.length === 0 ? (
                    <View style={styles.emptyContacts}>
                      <Ionicons name="people-outline" size={40} color="#E8E9ED" />
                      <Text style={styles.emptyContactsText}>Geen contactpersonen</Text>
                    </View>
                  ) : (
                    formData.contactpersonen.map((contact) => (
                      <View key={contact.id} style={styles.contactCard}>
                        <View style={styles.contactInfo}>
                          <Text style={styles.contactName}>{contact.naam}</Text>
                          <View style={styles.contactFunctieBadge}>
                            <Text style={styles.contactFunctieText}>{contact.functie}</Text>
                          </View>
                          <View style={styles.contactDetails}>
                            {contact.email && (
                              <View style={styles.contactDetailRow}>
                                <Ionicons name="mail-outline" size={14} color="#6c757d" />
                                <Text style={styles.contactDetailText}>{contact.email}</Text>
                              </View>
                            )}
                            {contact.gsm && (
                              <View style={styles.contactDetailRow}>
                                <Ionicons name="phone-portrait-outline" size={14} color="#6c757d" />
                                <Text style={styles.contactDetailText}>{contact.gsm}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <View style={styles.contactActions}>
                          <TouchableOpacity onPress={() => openEditContact(contact)}>
                            <Ionicons name="create-outline" size={20} color="#F5A623" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteContact(contact.id)}>
                            <Ionicons name="trash-outline" size={20} color="#dc3545" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Section 3: Communicatie */}
              {activeSection === 3 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Communicatie instellingen</Text>
                  
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Mail naar klant sturen</Text>
                      <Text style={styles.toggleHint}>Klant ontvangt werkbon e-mails</Text>
                    </View>
                    <Switch
                      value={formData.klant_mail_sturen}
                      onValueChange={(v) => setFormData({ ...formData, klant_mail_sturen: v })}
                      trackColor={{ false: '#E8E9ED', true: '#28a74550' }}
                      thumbColor={formData.klant_mail_sturen ? '#28a745' : '#f4f3f4'}
                    />
                  </View>
                  
                  <Text style={styles.label}>Primair mailadres voor werkbonnen</Text>
                  <TextInput style={styles.input} value={formData.primary_mail_recipient} onChangeText={(v) => setFormData({ ...formData, primary_mail_recipient: v })} placeholder="werkbon@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
                  
                  <Text style={styles.label}>CC mailadres</Text>
                  <TextInput style={styles.input} value={formData.cc_mail_recipient} onChangeText={(v) => setFormData({ ...formData, cc_mail_recipient: v })} placeholder="cc@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
                </View>
              )}

              {/* Section 4: Prijsafspraken */}
              {activeSection === 4 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Prijsafspraken</Text>
                  
                  <Text style={styles.label}>Prijsmodel</Text>
                  <View style={styles.prijsmodelGrid}>
                    {PRIJS_MODELLEN.map((model) => (
                      <TouchableOpacity
                        key={model.key}
                        style={[styles.prijsmodelOption, formData.prijsmodel === model.key && styles.prijsmodelOptionActive]}
                        onPress={() => setFormData({ ...formData, prijsmodel: model.key })}
                      >
                        <Text style={[styles.prijsmodelOptionText, formData.prijsmodel === model.key && styles.prijsmodelOptionTextActive]}>
                          {model.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {(formData.prijsmodel === 'uurtarief' || formData.prijsmodel === 'regie') && (
                    <>
                      <Text style={styles.label}>Standaard uurtarief (€)</Text>
                      {Platform.OS === 'web' ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formData.standaard_uurtarief ? String(formData.standaard_uurtarief) : ''}
                          onChange={(e) => { const v = e.target.value.replace(',', '.'); setFormData({ ...formData, standaard_uurtarief: v === '' ? 0 : parseFloat(v) || 0 }); }}
                          placeholder="45.00"
                          style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', backgroundColor: '#f5f5f5', boxSizing: 'border-box', outline: 'none' }}
                        />
                      ) : (
                        <TextInput style={styles.input} value={formData.standaard_uurtarief ? String(formData.standaard_uurtarief) : ''} onChangeText={(v) => setFormData({ ...formData, standaard_uurtarief: parseFloat(v.replace(',', '.')) || 0 })} placeholder="45.00" placeholderTextColor="#6c757d" keyboardType="decimal-pad" />
                      )}

                      <Text style={styles.label}>KM vergoeding (€/km)</Text>
                      {Platform.OS === 'web' ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formData.km_vergoeding_tarief ? String(formData.km_vergoeding_tarief) : ''}
                          onChange={(e) => { const v = e.target.value.replace(',', '.'); setFormData({ ...formData, km_vergoeding_tarief: v === '' ? 0 : parseFloat(v) || 0 }); }}
                          placeholder="0.00"
                          style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', backgroundColor: '#f5f5f5', boxSizing: 'border-box', outline: 'none' }}
                        />
                      ) : (
                        <TextInput style={styles.input} value={formData.km_vergoeding_tarief ? String(formData.km_vergoeding_tarief) : ''} onChangeText={(v) => setFormData({ ...formData, km_vergoeding_tarief: parseFloat(v.replace(',', '.')) || 0 })} placeholder="0.00" placeholderTextColor="#6c757d" keyboardType="decimal-pad" />
                      )}

                      <Text style={styles.label}>Standaard dagtarief (€)</Text>
                      {Platform.OS === 'web' ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formData.standaard_dagtarief ? String(formData.standaard_dagtarief) : ''}
                          onChange={(e) => { const v = e.target.value.replace(',', '.'); setFormData({ ...formData, standaard_dagtarief: v === '' ? 0 : parseFloat(v) || 0 }); }}
                          placeholder="350.00"
                          style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', backgroundColor: '#f5f5f5', boxSizing: 'border-box', outline: 'none' }}
                        />
                      ) : (
                        <TextInput style={styles.input} value={formData.standaard_dagtarief ? String(formData.standaard_dagtarief) : ''} onChangeText={(v) => setFormData({ ...formData, standaard_dagtarief: parseFloat(v.replace(',', '.')) || 0 })} placeholder="350.00" placeholderTextColor="#6c757d" keyboardType="decimal-pad" />
                      )}
                    </>
                  )}
                  
                  {formData.prijsmodel === 'vaste_prijs' && (
                    <>
                      <Text style={styles.label}>Standaard vaste prijs (€)</Text>
                      <TextInput style={styles.input} value={formData.standaard_vaste_prijs ? String(formData.standaard_vaste_prijs) : ''} onChangeText={(v) => setFormData({ ...formData, standaard_vaste_prijs: parseFloat(v.replace(',', '.')) || 0 })} placeholder="5000.00" placeholderTextColor="#6c757d" keyboardType="decimal-pad" {...(Platform.OS === 'web' ? { type: 'text', inputMode: 'decimal' } : {})} />
                    </>
                  )}
                  
                  <Text style={styles.label}>Betaaltermijn</Text>
                  <View style={styles.betaaltermijnRow}>
                    {BETAALTERMIJNEN.map((term) => (
                      <TouchableOpacity
                        key={term}
                        style={[styles.betaaltermijnBtn, formData.betaaltermijn === term && styles.betaaltermijnBtnActive]}
                        onPress={() => setFormData({ ...formData, betaaltermijn: term })}
                      >
                        <Text style={[styles.betaaltermijnText, formData.betaaltermijn === term && styles.betaaltermijnTextActive]}>{term} dagen</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={styles.label}>Interne opmerking prijsafspraak</Text>
                  <TextInput style={[styles.input, styles.textArea]} value={formData.interne_opmerking_prijsafspraak} onChangeText={(v) => setFormData({ ...formData, interne_opmerking_prijsafspraak: v })} placeholder="Interne notities over prijsafspraken..." placeholderTextColor="#6c757d" multiline />
                </View>
              )}

              {/* Section 5: Facturatie */}
              {activeSection === 5 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Facturatiegegevens</Text>
                  
                  <Text style={styles.label}>Facturatie e-mailadres</Text>
                  <TextInput style={styles.input} value={formData.facturatie_email} onChangeText={(v) => setFormData({ ...formData, facturatie_email: v })} placeholder="facturatie@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
                  
                  <Text style={styles.label}>Facturatie telefoonnummer</Text>
                  <TextInput style={styles.input} value={formData.facturatie_telefoon} onChangeText={(v) => setFormData({ ...formData, facturatie_telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
                  
                  <Text style={styles.label}>Facturatie contactpersoon</Text>
                  <TextInput style={styles.input} value={formData.facturatie_contactpersoon} onChangeText={(v) => setFormData({ ...formData, facturatie_contactpersoon: v })} placeholder="Naam contactpersoon" placeholderTextColor="#6c757d" />
                  
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Facturatieadres zelfde als hoofdadres</Text>
                    </View>
                    <Switch
                      value={formData.facturatie_adres_zelfde}
                      onValueChange={(v) => setFormData({ ...formData, facturatie_adres_zelfde: v })}
                      trackColor={{ false: '#E8E9ED', true: '#28a74550' }}
                      thumbColor={formData.facturatie_adres_zelfde ? '#28a745' : '#f4f3f4'}
                    />
                  </View>
                  
                  {!formData.facturatie_adres_zelfde && (
                    <View style={styles.facturatieAdresSection}>
                      <Text style={styles.subSectionTitle}>Facturatieadres</Text>
                      <View style={[styles.row, isCompact && styles.rowCompact]}>
                        <View style={{ flex: 3 }}>
                          <Text style={styles.label}>Straat</Text>
                          <TextInput style={styles.input} value={formData.facturatie_adres?.straat || ''} onChangeText={(v) => updateFacturatieAdres('straat', v)} placeholder="Straatnaam" placeholderTextColor="#6c757d" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.label}>Nr.</Text>
                          <TextInput style={styles.input} value={formData.facturatie_adres?.huisnummer || ''} onChangeText={(v) => updateFacturatieAdres('huisnummer', v)} placeholder="123" placeholderTextColor="#6c757d" />
                        </View>
                      </View>
                      <View style={[styles.row, isCompact && styles.rowCompact]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Postcode</Text>
                          <TextInput style={styles.input} value={formData.facturatie_adres?.postcode || ''} onChangeText={(v) => updateFacturatieAdres('postcode', v)} placeholder="1000" placeholderTextColor="#6c757d" />
                        </View>
                        <View style={{ flex: 2, marginLeft: 12 }}>
                          <Text style={styles.label}>Stad</Text>
                          <TextInput style={styles.input} value={formData.facturatie_adres?.stad || ''} onChangeText={(v) => updateFacturatieAdres('stad', v)} placeholder="Brussel" placeholderTextColor="#6c757d" />
                        </View>
                      </View>
                      <Text style={styles.label}>Land</Text>
                      <TextInput style={styles.input} value={formData.facturatie_adres?.land || ''} onChangeText={(v) => updateFacturatieAdres('land', v)} placeholder="België" placeholderTextColor="#6c757d" />
                    </View>
                  )}
                </View>
              )}

              {/* Section 6: Extra */}
              {activeSection === 6 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Extra informatie</Text>
                  
                  {formData.klantnummer && (
                    <View style={styles.infoBox}>
                      <Ionicons name="barcode-outline" size={20} color="#F5A623" />
                      <Text style={styles.infoBoxLabel}>Klantnummer:</Text>
                      <Text style={styles.infoBoxValue}>{formData.klantnummer}</Text>
                    </View>
                  )}
                  
                  <Text style={styles.label}>Interne referentie</Text>
                  <TextInput style={styles.input} value={formData.interne_referentie} onChangeText={(v) => setFormData({ ...formData, interne_referentie: v })} placeholder="Interne code of referentie" placeholderTextColor="#6c757d" />
                  
                  <Text style={styles.label}>Opmerkingen</Text>
                  <TextInput style={[styles.input, styles.textArea]} value={formData.opmerkingen} onChangeText={(v) => setFormData({ ...formData, opmerkingen: v })} placeholder="Algemene opmerkingen over deze klant..." placeholderTextColor="#6c757d" multiline />
                </View>
              )}
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveKlant} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>Opslaan</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Contact Person Modal */}
      <Modal visible={showContactModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.contactModalContent, isCompact && styles.contactModalContentCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingContact ? 'Contact Bewerken' : 'Nieuw Contact'}</Text>
              <TouchableOpacity onPress={() => setShowContactModal(false)}>
                <Ionicons name="close" size={24} color="#1A1A2E" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.contactFormContent}>
              <Text style={styles.label}>Naam *</Text>
              <TextInput style={styles.input} value={contactForm.naam} onChangeText={(v) => setContactForm({ ...contactForm, naam: v })} placeholder="Volledige naam" placeholderTextColor="#6c757d" />
              
              <Text style={styles.label}>Functie / Rol</Text>
              <View style={styles.functieGrid}>
                {CONTACT_FUNCTIES.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.functieBtn, contactForm.functie === f && styles.functieBtnActive]}
                    onPress={() => setContactForm({ ...contactForm, functie: f })}
                  >
                    <Text style={[styles.functieBtnText, contactForm.functie === f && styles.functieBtnTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.functieBtn, contactForm.functie === 'custom' && styles.functieBtnActive]}
                  onPress={() => setContactForm({ ...contactForm, functie: 'custom' })}
                >
                  <Text style={[styles.functieBtnText, contactForm.functie === 'custom' && styles.functieBtnTextActive]}>Anders...</Text>
                </TouchableOpacity>
              </View>
              
              {contactForm.functie === 'custom' && (
                <>
                  <Text style={styles.label}>Aangepaste functie</Text>
                  <TextInput style={styles.input} value={customFunctie} onChangeText={setCustomFunctie} placeholder="Typ functie..." placeholderTextColor="#6c757d" />
                </>
              )}
              
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={styles.input} value={contactForm.email} onChangeText={(v) => setContactForm({ ...contactForm, email: v })} placeholder="email@bedrijf.be" placeholderTextColor="#6c757d" keyboardType="email-address" />
              
              <Text style={styles.label}>Telefoon (vast)</Text>
              <TextInput style={styles.input} value={contactForm.telefoon} onChangeText={(v) => setContactForm({ ...contactForm, telefoon: v })} placeholder="+32 ..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
              
              <Text style={styles.label}>GSM</Text>
              <TextInput style={styles.input} value={contactForm.gsm} onChangeText={(v) => setContactForm({ ...contactForm, gsm: v })} placeholder="+32 4..." placeholderTextColor="#6c757d" keyboardType="phone-pad" />
              
              <Text style={styles.label}>Opmerkingen</Text>
              <TextInput style={[styles.input, styles.textArea]} value={contactForm.opmerkingen} onChangeText={(v) => setContactForm({ ...contactForm, opmerkingen: v })} placeholder="Notities over dit contact..." placeholderTextColor="#6c757d" multiline />
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowContactModal(false)}>
                <Text style={styles.cancelBtnText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveContact}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Opslaan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  headerCompact: { padding: 12 },
  headerLeft: {},
  title: { fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' },
  titleCompact: { fontSize: 18 },
  subtitle: { fontSize: 13, color: '#6c757d' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5A623', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, padding: 12, borderRadius: 10, gap: 10, borderWidth: 1, borderColor: '#E8E9ED' },
  searchBarCompact: { margin: 12, padding: 10 },
  searchInput: { flex: 1, fontSize: 16, color: '#1A1A2E' },
  list: { flex: 1 },
  listContent: { padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#6c757d', marginTop: 12 },
  klantCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E9ED' },
  klantCardCompact: { padding: 12 },
  klantHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  klantInfo: { flex: 1 },
  klantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  klantName: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  klantnummerBadge: { backgroundColor: '#F5A62320', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  klantnummerText: { fontSize: 11, color: '#F5A623', fontWeight: '600' },
  klantMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: '#6c757d' },
  klantActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prijsmodelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  prijsmodelText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { padding: 8 },
  klantDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E8E9ED' },
  detailItem: { flexDirection: 'row', gap: 6 },
  detailLabel: { fontSize: 13, color: '#6c757d' },
  detailValue: { fontSize: 13, color: '#1A1A2E', fontWeight: '500' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccessText: { fontSize: 20, color: '#1A1A2E', marginTop: 16 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', width: '95%', maxWidth: 800, maxHeight: '95%', borderRadius: 16, overflow: 'hidden' },
  modalContentCompact: { width: '100%', height: '100%', borderRadius: 0, maxHeight: '100%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E9ED' },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  sectionTabs: { flexDirection: 'row', backgroundColor: '#F5F6FA', paddingVertical: 8, paddingHorizontal: 8, maxHeight: 56 },
  sectionTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 6 },
  sectionTabActive: { backgroundColor: '#F5A62320' },
  sectionTabText: { fontSize: 14, color: '#6c757d' },
  sectionTabTextActive: { color: '#F5A623', fontWeight: '600' },
  formContent: { flex: 1, padding: 16 },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E', marginBottom: 12 },
  subSectionTitle: { fontSize: 15, fontWeight: '600', color: '#6c757d', marginBottom: 8, marginTop: 16 },
  label: { fontSize: 14, color: '#6c757d', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A2E', borderWidth: 1, borderColor: '#E8E9ED' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  rowCompact: { flexDirection: 'column' },
  halfField: { flex: 1, marginRight: 12 },
  typeToggle: { flexDirection: 'row', gap: 12, marginTop: 8 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', backgroundColor: '#F5F6FA' },
  typeBtnActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  typeBtnText: { fontSize: 14, color: '#6c757d', fontWeight: '500' },
  typeBtnTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F6FA', padding: 16, borderRadius: 10, marginTop: 12 },
  toggleInfo: {},
  toggleLabel: { fontSize: 15, color: '#1A1A2E', fontWeight: '500' },
  toggleHint: { fontSize: 12, color: '#6c757d' },
  
  // Pricing
  prijsmodelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  prijsmodelOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E8E9ED', backgroundColor: '#F5F6FA' },
  prijsmodelOptionActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  prijsmodelOptionText: { fontSize: 14, color: '#6c757d' },
  prijsmodelOptionTextActive: { color: '#fff', fontWeight: '600' },
  betaaltermijnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  betaaltermijnBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', backgroundColor: '#F5F6FA', alignItems: 'center' },
  betaaltermijnBtnActive: { backgroundColor: '#28a745', borderColor: '#28a745' },
  betaaltermijnText: { fontSize: 14, color: '#6c757d' },
  betaaltermijnTextActive: { color: '#fff', fontWeight: '600' },
  
  // Facturatie
  facturatieAdresSection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E8E9ED' },
  
  // Extra
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5A62310', padding: 14, borderRadius: 10, marginBottom: 12 },
  infoBoxLabel: { fontSize: 14, color: '#6c757d' },
  infoBoxValue: { fontSize: 16, color: '#F5A623', fontWeight: '600' },
  
  // Contacts
  addContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5A623', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addContactBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyContacts: { alignItems: 'center', padding: 30, backgroundColor: '#F5F6FA', borderRadius: 10 },
  emptyContactsText: { color: '#6c757d', marginTop: 8 },
  contactCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F5F6FA', padding: 14, borderRadius: 10, marginBottom: 10 },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  contactFunctieBadge: { backgroundColor: '#3498db20', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  contactFunctieText: { fontSize: 12, color: '#3498db', fontWeight: '500' },
  contactDetails: { marginTop: 8, gap: 4 },
  contactDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactDetailText: { fontSize: 13, color: '#6c757d' },
  contactActions: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  
  // Contact Modal
  contactModalContent: { backgroundColor: '#fff', width: '90%', maxWidth: 500, maxHeight: '80%', borderRadius: 16, overflow: 'hidden' },
  contactModalContentCompact: { width: '100%', maxHeight: '100%', borderRadius: 0 },
  contactFormContent: { padding: 16 },
  functieGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  functieBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E8E9ED', backgroundColor: '#F5F6FA' },
  functieBtnActive: { backgroundColor: '#3498db', borderColor: '#3498db' },
  functieBtnText: { fontSize: 13, color: '#6c757d' },
  functieBtnTextActive: { color: '#fff', fontWeight: '600' },
  
  // Modal Footer
  modalFooter: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: '#E8E9ED' },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E8E9ED', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, color: '#6c757d', fontWeight: '500' },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#28a745', padding: 14, borderRadius: 10 },
  saveBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  
  // Loading state
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6c757d' },
});
