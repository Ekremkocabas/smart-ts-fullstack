import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, User } from '../../store/appStore';
import { useAuth } from '../../context/AuthContext';

type Tab = 'werknemers' | 'teams' | 'klanten' | 'werven' | 'instellingen' | 'pdf';

export default function BeheerScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.rol === 'admin';
  
  const [activeTab, setActiveTab] = useState<Tab>('werknemers');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'team' | 'klant' | 'werf' | 'werknemer'>('team');
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Form states
  const [teamNaam, setTeamNaam] = useState('');
  const [teamLeden, setTeamLeden] = useState('');
  const [klantNaam, setKlantNaam] = useState('');
  const [klantEmail, setKlantEmail] = useState('');
  const [klantTelefoon, setKlantTelefoon] = useState('');
  const [klantUurtarief, setKlantUurtarief] = useState('');
  const [werfNaam, setWerfNaam] = useState('');
  const [werfKlantId, setWerfKlantId] = useState('');
  const [werfAdres, setWerfAdres] = useState('');
  
  // Werknemer form states
  const [werknemerNaam, setWerknemerNaam] = useState('');
  const [werknemerEmail, setWerknemerEmail] = useState('');
  const [werknemerTeamId, setWerknemerTeamId] = useState('');
  
  // Result modal for showing password
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultData, setResultData] = useState<{naam: string; password: string; emailSent: boolean} | null>(null);
  // Settings
  const [bedrijfsnaam, setBedrijfsnaam] = useState('');
  const [bedrijfsEmail, setBedrijfsEmail] = useState('');
  const [bedrijfsTelefoon, setBedrijfsTelefoon] = useState('');
  const [bedrijfsAdres, setBedrijfsAdres] = useState('');
  const [bedrijfsPostcode, setBedrijfsPostcode] = useState('');
  const [bedrijfsStad, setBedrijfsStad] = useState('');
  const [kvkNummer, setKvkNummer] = useState('');
  const [btwNummer, setBtwNummer] = useState('');
  const [adminEmails, setAdminEmails] = useState('');
  
  // PDF Settings
  const [pdfVoettekst, setPdfVoettekst] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  
  const {
    teams, klanten, werven, werknemers, instellingen,
    fetchTeams, fetchKlanten, fetchWerven, fetchInstellingen, fetchWerknemers,
    addTeam, updateTeam, deleteTeam,
    addKlant, updateKlant, deleteKlant,
    addWerf, deleteWerf,
    addWerknemer, updateWerknemer, deleteWerknemer,
    updateInstellingen,
  } = useAppStore();

  useEffect(() => {
    fetchTeams();
    fetchKlanten();
    fetchWerven();
    fetchInstellingen();
    fetchWerknemers();
  }, []);

  useEffect(() => {
    if (instellingen) {
      setBedrijfsnaam(instellingen.bedrijfsnaam || '');
      setBedrijfsEmail(instellingen.email || '');
      setBedrijfsTelefoon(instellingen.telefoon || '');
      setBedrijfsAdres(instellingen.adres || '');
      setBedrijfsPostcode(instellingen.postcode || '');
      setBedrijfsStad(instellingen.stad || '');
      setKvkNummer(instellingen.kvk_nummer || '');
      setBtwNummer(instellingen.btw_nummer || '');
      setAdminEmails(instellingen.admin_emails?.join(', ') || '');
      setPdfVoettekst(instellingen.pdf_voettekst || 'Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week.');
      setLogoBase64(instellingen.logo_base64 || null);
    }
  }, [instellingen]);

  const openModal = (type: 'team' | 'klant' | 'werf' | 'werknemer', item?: any) => {
    setModalType(type);
    setEditingItem(item || null);
    
    if (item) {
      if (type === 'team') {
        setTeamNaam(item.naam);
        setTeamLeden(item.leden?.join('\n') || '');
      } else if (type === 'klant') {
        setKlantNaam(item.naam);
        setKlantEmail(item.email);
        setKlantTelefoon(item.telefoon || '');
        setKlantUurtarief(item.uurtarief?.toString() || '0');
      } else if (type === 'werknemer') {
        setWerknemerNaam(item.naam);
        setWerknemerEmail(item.email);
        setWerknemerTeamId(item.team_id || '');
      }
    } else {
      setTeamNaam('');
      setTeamLeden('');
      setKlantNaam('');
      setKlantEmail('');
      setKlantTelefoon('');
      setKlantUurtarief('0');
      setWerfNaam('');
      setWerfKlantId('');
      setWerfAdres('');
      setWerknemerNaam('');
      setWerknemerEmail('');
      setWerknemerTeamId('');
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      if (modalType === 'team') {
        if (!teamNaam.trim()) {
          Alert.alert('Fout', 'Vul een teamnaam in');
          return;
        }
        const leden = teamLeden.split('\n').map(l => l.trim()).filter(l => l);
        if (editingItem) {
          await updateTeam(editingItem.id, teamNaam.trim(), leden);
        } else {
          await addTeam(teamNaam.trim(), leden);
        }
      } else if (modalType === 'klant') {
        if (!klantNaam.trim() || !klantEmail.trim()) {
          Alert.alert('Fout', 'Vul naam en e-mail in');
          return;
        }
        const klantData = {
          naam: klantNaam.trim(),
          email: klantEmail.trim(),
          telefoon: klantTelefoon.trim() || undefined,
          uurtarief: parseFloat(klantUurtarief) || 0,
        };
        if (editingItem) {
          await updateKlant(editingItem.id, klantData);
        } else {
          await addKlant(klantData);
        }
      } else if (modalType === 'werf') {
        if (!werfNaam.trim() || !werfKlantId) {
          Alert.alert('Fout', 'Vul werf naam in en selecteer een klant');
          return;
        }
        await addWerf({
          naam: werfNaam.trim(),
          klant_id: werfKlantId,
          adres: werfAdres.trim() || undefined,
        });
      } else if (modalType === 'werknemer') {
        if (!werknemerNaam.trim() || !werknemerEmail.trim()) {
          Alert.alert('Fout', 'Vul naam en e-mail in');
          return;
        }
        if (editingItem) {
          await updateWerknemer(editingItem.id, {
            naam: werknemerNaam.trim(),
            team_id: werknemerTeamId || undefined,
          });
        } else {
          const result = await addWerknemer(werknemerEmail.trim(), werknemerNaam.trim(), werknemerTeamId || undefined);
          // Show result modal with password
          setResultData({
            naam: werknemerNaam,
            password: result.tempPassword,
            emailSent: result.emailSent
          });
          setModalVisible(false);
          setResultModalVisible(true);
          fetchWerknemers();
          return;
        }
      }
      setModalVisible(false);
      // Refresh data
      if (modalType === 'team') fetchTeams();
      if (modalType === 'klant') fetchKlanten();
      if (modalType === 'werf') fetchWerven();
      if (modalType === 'werknemer') fetchWerknemers();
    } catch (error: any) {
      Alert.alert('Fout', error.message || 'Er is een fout opgetreden');
    }
  };

  const handleSaveInstellingen = async () => {
    try {
      const emailList = adminEmails.split(',').map(e => e.trim()).filter(e => e);
      await updateInstellingen({
        bedrijfsnaam: bedrijfsnaam.trim(),
        email: bedrijfsEmail.trim(),
        telefoon: bedrijfsTelefoon.trim() || undefined,
        adres: bedrijfsAdres.trim() || undefined,
        postcode: bedrijfsPostcode.trim() || undefined,
        stad: bedrijfsStad.trim() || undefined,
        kvk_nummer: kvkNummer.trim() || undefined,
        btw_nummer: btwNummer.trim() || undefined,
        admin_emails: emailList.length > 0 ? emailList : undefined,
      });
      Alert.alert('Opgeslagen', 'Bedrijfsinstellingen zijn bijgewerkt');
    } catch (error: any) {
      Alert.alert('Fout', error.message);
    }
  };

  const handleSavePdfSettings = async () => {
    try {
      await updateInstellingen({
        pdf_voettekst: pdfVoettekst.trim(),
        logo_base64: logoBase64 || undefined,
      });
      Alert.alert('Opgeslagen', 'PDF instellingen zijn bijgewerkt');
    } catch (error: any) {
      Alert.alert('Fout', error.message);
    }
  };

  const pickLogo = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 2],
        quality: 0.5,
        base64: true,
      });
      
      if (!result.canceled && result.assets[0].base64) {
        setLogoBase64(`data:image/png;base64,${result.assets[0].base64}`);
      }
    } catch (error) {
      Alert.alert('Fout', 'Kan afbeelding niet laden');
    }
  };

  const confirmDelete = (type: 'team' | 'klant' | 'werf' | 'werknemer', id: string, naam: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Weet u zeker dat u "${naam}" wilt verwijderen?`)) {
        if (type === 'team') deleteTeam(id);
        else if (type === 'klant') deleteKlant(id);
        else if (type === 'werf') deleteWerf(id);
        else if (type === 'werknemer') deleteWerknemer(id);
      }
    } else {
      Alert.alert(
        'Verwijderen',
        `Weet u zeker dat u "${naam}" wilt verwijderen?`,
        [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Verwijderen',
            style: 'destructive',
            onPress: async () => {
              if (type === 'team') await deleteTeam(id);
              else if (type === 'klant') await deleteKlant(id);
              else if (type === 'werf') await deleteWerf(id);
              else if (type === 'werknemer') await deleteWerknemer(id);
            },
          },
        ]
      );
    }
  };

  const toggleWerknemerActief = async (werknemer: User) => {
    try {
      await updateWerknemer(werknemer.id, { actief: !werknemer.actief });
    } catch (error: any) {
      Alert.alert('Fout', error.message);
    }
  };

  // Only show for admin
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Beheer</Text>
        </View>
        <View style={styles.noAccessContainer}>
          <Text style={styles.noAccessText}>Laden...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Beheer</Text>
        </View>
        <View style={styles.noAccessContainer}>
          <Ionicons name="lock-closed" size={64} color="#6c757d" />
          <Text style={styles.noAccessText}>Alleen voor beheerders</Text>
          <Text style={styles.noAccessSubtext}>
            Neem contact op met uw admin om toegang te krijgen
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'werknemers':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Werknemers</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openModal('werknemer')}>
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoText}>
              Voeg werknemers toe door hun e-mailadres in te voeren. Ze kunnen dan inloggen met een tijdelijk wachtwoord.
            </Text>
            {werknemers.filter(w => w.rol !== 'admin').map((werknemer) => {
              const team = teams.find(t => t.id === werknemer.team_id);
              return (
                <View 
                  key={werknemer.id} 
                  style={[styles.listItem, !werknemer.actief && styles.listItemInactive]}
                >
                  <TouchableOpacity 
                    style={styles.listItemLeft}
                    onPress={() => openModal('werknemer', werknemer)}
                  >
                    <Ionicons name="person" size={20} color={werknemer.actief ? "#F5A623" : "#6c757d"} />
                    <View>
                      <Text style={[styles.listItemText, !werknemer.actief && styles.textInactive]}>
                        {werknemer.naam}
                      </Text>
                      <Text style={styles.listItemSubtext}>{werknemer.email}</Text>
                      {team && <Text style={styles.teamBadge}>{team.naam}</Text>}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.werknemerActions}>
                    <Switch
                      value={werknemer.actief}
                      onValueChange={() => toggleWerknemerActief(werknemer)}
                      trackColor={{ false: '#2d3a5f', true: '#F5A623' }}
                      thumbColor="#fff"
                    />
                    <TouchableOpacity 
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete('werknemer', werknemer.id, werknemer.naam)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            {werknemers.filter(w => w.rol !== 'admin').length === 0 && (
              <Text style={styles.emptyText}>Nog geen werknemers toegevoegd</Text>
            )}
          </View>
        );
        
      case 'teams':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Teams</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openModal('team')}>
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoText}>
              Maak teams aan met werknemers. Wanneer een werknemer inlogt en een team is toegewezen, 
              verschijnen de teamleden automatisch op de werkbon.
            </Text>
            {teams.map((team) => (
              <TouchableOpacity 
                key={team.id} 
                style={styles.listItem}
                onPress={() => openModal('team', team)}
              >
                <View style={styles.listItemLeft}>
                  <Ionicons name="people" size={20} color="#F5A623" />
                  <View>
                    <Text style={styles.listItemText}>{team.naam}</Text>
                    <Text style={styles.listItemSubtext}>
                      {team.leden?.length || 0} leden
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => confirmDelete('team', team.id, team.naam)}>
                  <Ionicons name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {teams.length === 0 && (
              <Text style={styles.emptyText}>Nog geen teams aangemaakt</Text>
            )}
          </View>
        );
      
      case 'klanten':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Klanten</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openModal('klant')}>
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
            {klanten.map((klant) => (
              <TouchableOpacity 
                key={klant.id} 
                style={styles.listItem}
                onPress={() => openModal('klant', klant)}
              >
                <View style={styles.listItemLeft}>
                  <Ionicons name="business" size={20} color="#F5A623" />
                  <View>
                    <Text style={styles.listItemText}>{klant.naam}</Text>
                    <Text style={styles.listItemSubtext}>{klant.email}</Text>
                    {klant.uurtarief > 0 && (
                      <Text style={styles.uurtariefText}>{klant.uurtarief}/uur</Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={() => confirmDelete('klant', klant.id, klant.naam)}>
                  <Ionicons name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {klanten.length === 0 && (
              <Text style={styles.emptyText}>Nog geen klanten toegevoegd</Text>
            )}
          </View>
        );
      
      case 'werven':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Werven</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openModal('werf')}>
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
            {werven.map((werf) => {
              const klant = klanten.find(k => k.id === werf.klant_id);
              return (
                <View key={werf.id} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <Ionicons name="construct" size={20} color="#F5A623" />
                    <View>
                      <Text style={styles.listItemText}>{werf.naam}</Text>
                      <Text style={styles.listItemSubtext}>{klant?.naam || 'Onbekende klant'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => confirmDelete('werf', werf.id, werf.naam)}>
                    <Ionicons name="trash-outline" size={20} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              );
            })}
            {werven.length === 0 && (
              <Text style={styles.emptyText}>Nog geen werven toegevoegd</Text>
            )}
          </View>
        );
      
      case 'instellingen':
        return (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Bedrijfsinstellingen</Text>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Bedrijfsnaam</Text>
              <TextInput
                style={styles.textInput}
                value={bedrijfsnaam}
                onChangeText={setBedrijfsnaam}
                placeholder="Uw bedrijfsnaam"
                placeholderTextColor="#6c757d"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>E-mailadres</Text>
              <TextInput
                style={styles.textInput}
                value={bedrijfsEmail}
                onChangeText={setBedrijfsEmail}
                placeholder="info@bedrijf.nl"
                placeholderTextColor="#6c757d"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Telefoon</Text>
              <TextInput
                style={styles.textInput}
                value={bedrijfsTelefoon}
                onChangeText={setBedrijfsTelefoon}
                placeholder="+31 6 12345678"
                placeholderTextColor="#6c757d"
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Adres</Text>
              <TextInput
                style={styles.textInput}
                value={bedrijfsAdres}
                onChangeText={setBedrijfsAdres}
                placeholder="Straatnaam 123"
                placeholderTextColor="#6c757d"
              />
            </View>
            <View style={styles.rowGroup}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Postcode</Text>
                <TextInput
                  style={styles.textInput}
                  value={bedrijfsPostcode}
                  onChangeText={setBedrijfsPostcode}
                  placeholder="1234 AB"
                  placeholderTextColor="#6c757d"
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Stad</Text>
                <TextInput
                  style={styles.textInput}
                  value={bedrijfsStad}
                  onChangeText={setBedrijfsStad}
                  placeholder="Amsterdam"
                  placeholderTextColor="#6c757d"
                />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>KvK Nummer</Text>
              <TextInput
                style={styles.textInput}
                value={kvkNummer}
                onChangeText={setKvkNummer}
                placeholder="12345678"
                placeholderTextColor="#6c757d"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>BTW Nummer</Text>
              <TextInput
                style={styles.textInput}
                value={btwNummer}
                onChangeText={setBtwNummer}
                placeholder="NL123456789B01"
                placeholderTextColor="#6c757d"
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Admin E-mails (komma gescheiden)</Text>
              <TextInput
                style={styles.textInput}
                value={adminEmails}
                onChangeText={setAdminEmails}
                placeholder="admin@bedrijf.nl, manager@bedrijf.nl"
                placeholderTextColor="#6c757d"
                autoCapitalize="none"
              />
              <Text style={styles.helpText}>
                Deze e-mailadressen krijgen admin rechten bij registratie
              </Text>
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveInstellingen}>
              <Text style={styles.saveButtonText}>Opslaan</Text>
            </TouchableOpacity>
          </View>
        );
      
      case 'pdf':
        return (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>PDF Instellingen</Text>
            <Text style={styles.infoText}>
              Configureer hoe uw werkbonnen er uitzien wanneer ze worden geexporteerd als PDF.
            </Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Bedrijfslogo</Text>
              <TouchableOpacity style={styles.logoUploadBtn} onPress={pickLogo}>
                {logoBase64 ? (
                  <View style={styles.logoPreviewContainer}>
                    <View style={styles.logoPreview}>
                      <Text style={styles.logoPreviewText}>Logo geladen</Text>
                      <Ionicons name="checkmark-circle" size={24} color="#28a745" />
                    </View>
                    <Text style={styles.changeLogoText}>Tik om te wijzigen</Text>
                  </View>
                ) : (
                  <View style={styles.logoUploadContent}>
                    <Ionicons name="image-outline" size={32} color="#F5A623" />
                    <Text style={styles.logoUploadText}>Logo uploaden</Text>
                    <Text style={styles.logoUploadSubtext}>PNG of JPG, max 1MB</Text>
                  </View>
                )}
              </TouchableOpacity>
              {logoBase64 && (
                <TouchableOpacity 
                  style={styles.removeLogo} 
                  onPress={() => setLogoBase64(null)}
                >
                  <Text style={styles.removeLogoText}>Logo verwijderen</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>PDF Voettekst / Disclaimer</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={pdfVoettekst}
                onChangeText={setPdfVoettekst}
                placeholder="Tekst die onderaan elke PDF verschijnt..."
                placeholderTextColor="#6c757d"
                multiline
                numberOfLines={4}
              />
              <Text style={styles.helpText}>
                Deze tekst verschijnt onderaan elke werkbon PDF
              </Text>
            </View>
            
            <View style={styles.pdfPreviewSection}>
              <Text style={styles.label}>PDF Bevat:</Text>
              <View style={styles.pdfFeatureList}>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>Bedrijfslogo (indien ingesteld)</Text>
                </View>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>Bedrijfsgegevens (adres, KvK, BTW)</Text>
                </View>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>Klant- en werfgegevens</Text>
                </View>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>Urenregistratie + afkortingen (Z, V, BV, BF)</Text>
                </View>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>KM afstand per dag</Text>
                </View>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>Handtekening klant</Text>
                </View>
                <View style={styles.pdfFeatureItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#28a745" />
                  <Text style={styles.pdfFeatureText}>Totaalbedrag (alleen in e-mail)</Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity style={styles.saveButton} onPress={handleSavePdfSettings}>
              <Text style={styles.saveButtonText}>PDF Instellingen Opslaan</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Beheer</Text>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {(['werknemers', 'teams', 'klanten', 'werven', 'instellingen', 'pdf'] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === 'werknemers' ? 'Werknemers' :
                 tab === 'pdf' ? 'PDF' : 
                 tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ScrollView style={styles.content}>
        {renderTabContent()}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Bewerken' : 'Nieuw'}{' '}
                {modalType === 'team' ? 'Team' :
                 modalType === 'klant' ? 'Klant' : 
                 modalType === 'werknemer' ? 'Werknemer' : 'Werf'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {modalType === 'werknemer' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Naam</Text>
                    <TextInput
                      style={styles.textInput}
                      value={werknemerNaam}
                      onChangeText={setWerknemerNaam}
                      placeholder="Volledige naam"
                      placeholderTextColor="#6c757d"
                      autoFocus
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>E-mail</Text>
                    <TextInput
                      style={[styles.textInput, editingItem && styles.inputDisabled]}
                      value={werknemerEmail}
                      onChangeText={setWerknemerEmail}
                      placeholder="email@bedrijf.nl"
                      placeholderTextColor="#6c757d"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!editingItem}
                    />
                    {editingItem && (
                      <Text style={styles.helpText}>E-mail kan niet worden gewijzigd</Text>
                    )}
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Team (optioneel)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.klantSelector}>
                        <TouchableOpacity
                          style={[styles.klantOption, !werknemerTeamId && styles.klantOptionActive]}
                          onPress={() => setWerknemerTeamId('')}
                        >
                          <Text style={[styles.klantOptionText, !werknemerTeamId && styles.klantOptionTextActive]}>
                            Geen team
                          </Text>
                        </TouchableOpacity>
                        {teams.map((team) => (
                          <TouchableOpacity
                            key={team.id}
                            style={[styles.klantOption, werknemerTeamId === team.id && styles.klantOptionActive]}
                            onPress={() => setWerknemerTeamId(team.id)}
                          >
                            <Text style={[styles.klantOptionText, werknemerTeamId === team.id && styles.klantOptionTextActive]}>
                              {team.naam}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                    <Text style={styles.helpText}>
                      Teamleden verschijnen automatisch op werkbonnen
                    </Text>
                  </View>
                </>
              )}
              
              {modalType === 'team' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Team Naam</Text>
                    <TextInput
                      style={styles.textInput}
                      value={teamNaam}
                      onChangeText={setTeamNaam}
                      placeholder="Bijv. Team Noord"
                      placeholderTextColor="#6c757d"
                      autoFocus
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Team Leden (een per regel)</Text>
                    <TextInput
                      style={[styles.textInput, styles.textArea]}
                      value={teamLeden}
                      onChangeText={setTeamLeden}
                      placeholder={"Jan de Vries\nPiet Jansen\nKlaas Bakker"}
                      placeholderTextColor="#6c757d"
                      multiline
                      numberOfLines={5}
                    />
                    <Text style={styles.helpText}>
                      Deze namen verschijnen automatisch op werkbonnen
                    </Text>
                  </View>
                </>
              )}

              {modalType === 'klant' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Naam</Text>
                    <TextInput
                      style={styles.textInput}
                      value={klantNaam}
                      onChangeText={setKlantNaam}
                      placeholder="Bedrijfsnaam"
                      placeholderTextColor="#6c757d"
                      autoFocus
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>E-mail</Text>
                    <TextInput
                      style={styles.textInput}
                      value={klantEmail}
                      onChangeText={setKlantEmail}
                      placeholder="email@bedrijf.nl"
                      placeholderTextColor="#6c757d"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Telefoon (optioneel)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={klantTelefoon}
                      onChangeText={setKlantTelefoon}
                      placeholder="+31 6 12345678"
                      placeholderTextColor="#6c757d"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Uurtarief</Text>
                    <TextInput
                      style={styles.textInput}
                      value={klantUurtarief}
                      onChangeText={setKlantUurtarief}
                      placeholder="0"
                      placeholderTextColor="#6c757d"
                      keyboardType="numeric"
                    />
                    <Text style={styles.helpText}>
                      Dit tarief wordt alleen in de e-mail getoond, niet aan werknemers
                    </Text>
                  </View>
                </>
              )}

              {modalType === 'werf' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Werf naam</Text>
                    <TextInput
                      style={styles.textInput}
                      value={werfNaam}
                      onChangeText={setWerfNaam}
                      placeholder="Project/locatie naam"
                      placeholderTextColor="#6c757d"
                      autoFocus
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Klant</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.klantSelector}>
                        {klanten.map((klant) => (
                          <TouchableOpacity
                            key={klant.id}
                            style={[
                              styles.klantOption,
                              werfKlantId === klant.id && styles.klantOptionActive
                            ]}
                            onPress={() => setWerfKlantId(klant.id)}
                          >
                            <Text style={[
                              styles.klantOptionText,
                              werfKlantId === klant.id && styles.klantOptionTextActive
                            ]}>
                              {klant.naam}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Adres (optioneel)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={werfAdres}
                      onChangeText={setWerfAdres}
                      placeholder="Straat, stad"
                      placeholderTextColor="#6c757d"
                    />
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Opslaan</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Result Modal for showing password */}
      <Modal
        visible={resultModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setResultModalVisible(false)}
      >
        <View style={styles.resultModalContainer}>
          <View style={styles.resultModalContent}>
            <View style={styles.resultIcon}>
              <Ionicons name="checkmark-circle" size={48} color="#28a745" />
            </View>
            <Text style={styles.resultTitle}>Werknemer Aangemaakt</Text>
            <Text style={styles.resultSubtitle}>{resultData?.naam} is toegevoegd</Text>
            
            <View style={styles.passwordBox}>
              <Text style={styles.passwordLabel}>Tijdelijk wachtwoord:</Text>
              <Text style={styles.passwordValue}>{resultData?.password}</Text>
            </View>
            
            <View style={styles.emailStatusBox}>
              <Ionicons 
                name={resultData?.emailSent ? "mail" : "mail-unread"} 
                size={20} 
                color={resultData?.emailSent ? "#28a745" : "#ffc107"} 
              />
              <Text style={styles.emailStatusText}>
                {resultData?.emailSent 
                  ? 'Welkom e-mail is verzonden' 
                  : 'E-mail niet verzonden - deel wachtwoord handmatig'}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.resultButton} 
              onPress={() => {
                setResultModalVisible(false);
                setResultData(null);
              }}
            >
              <Text style={styles.resultButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  adminBadge: { backgroundColor: '#F5A623', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  adminBadgeText: { color: '#000', fontSize: 12, fontWeight: '600' },
  noAccessContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  noAccessText: { fontSize: 20, fontWeight: '600', color: '#fff', marginTop: 16 },
  noAccessSubtext: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },
  tabsScroll: { maxHeight: 50 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#16213e' },
  activeTab: { backgroundColor: '#F5A623' },
  tabText: { color: '#6c757d', fontSize: 13, fontWeight: '500' },
  activeTabText: { color: '#000' },
  content: { flex: 1 },
  tabContent: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 12 },
  infoText: { color: '#6c757d', fontSize: 13, marginBottom: 16, lineHeight: 20 },
  addBtn: { backgroundColor: '#F5A623', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#16213e', padding: 16, borderRadius: 12, marginBottom: 8 },
  listItemInactive: { opacity: 0.6 },
  listItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  listItemText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  textInactive: { color: '#6c757d' },
  listItemSubtext: { color: '#6c757d', fontSize: 12, marginTop: 2 },
  teamBadge: { color: '#F5A623', fontSize: 11, marginTop: 4, backgroundColor: 'rgba(245, 166, 35, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  uurtariefText: { color: '#F5A623', fontSize: 12, fontWeight: '600', marginTop: 2 },
  emptyText: { color: '#6c757d', textAlign: 'center', marginTop: 24 },
  switchContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: '#6c757d', fontSize: 12 },
  werknemerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteBtn: { padding: 8 },
  formGroup: { marginBottom: 16 },
  rowGroup: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  halfInput: { flex: 1 },
  label: { color: '#a0a0a0', fontSize: 14, marginBottom: 8 },
  textInput: { backgroundColor: '#16213e', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#2d3a5f' },
  inputDisabled: { opacity: 0.5 },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  helpText: { color: '#6c757d', fontSize: 12, marginTop: 4 },
  saveButton: { backgroundColor: '#F5A623', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#000', fontSize: 16, fontWeight: '600' },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  klantSelector: { flexDirection: 'row', gap: 8 },
  klantOption: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#16213e', borderRadius: 8, borderWidth: 1, borderColor: '#2d3a5f' },
  klantOptionActive: { backgroundColor: '#F5A623', borderColor: '#F5A623' },
  klantOptionText: { color: '#6c757d', fontSize: 14 },
  klantOptionTextActive: { color: '#000' },
  // PDF Settings styles
  logoUploadBtn: { backgroundColor: '#16213e', borderRadius: 12, padding: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: '#2d3a5f', alignItems: 'center' },
  logoUploadContent: { alignItems: 'center', gap: 8 },
  logoUploadText: { color: '#F5A623', fontSize: 16, fontWeight: '600' },
  logoUploadSubtext: { color: '#6c757d', fontSize: 12 },
  logoPreviewContainer: { alignItems: 'center', gap: 8 },
  logoPreview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoPreviewText: { color: '#fff', fontSize: 16 },
  changeLogoText: { color: '#6c757d', fontSize: 12 },
  removeLogo: { marginTop: 8, alignItems: 'center' },
  removeLogoText: { color: '#dc3545', fontSize: 14 },
  pdfPreviewSection: { backgroundColor: '#16213e', borderRadius: 12, padding: 16, marginTop: 16 },
  pdfFeatureList: { gap: 10, marginTop: 8 },
  pdfFeatureItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pdfFeatureText: { color: '#a0a0a0', fontSize: 14 },
  // Result modal styles
  resultModalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  resultModalContent: { backgroundColor: '#1a1a2e', borderRadius: 20, padding: 30, width: '85%', alignItems: 'center' },
  resultIcon: { marginBottom: 16 },
  resultTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  resultSubtitle: { fontSize: 14, color: '#6c757d', marginBottom: 24 },
  passwordBox: { backgroundColor: '#16213e', borderRadius: 12, padding: 20, width: '100%', alignItems: 'center', marginBottom: 16 },
  passwordLabel: { color: '#6c757d', fontSize: 12, marginBottom: 8 },
  passwordValue: { color: '#F5A623', fontSize: 24, fontWeight: 'bold', letterSpacing: 2 },
  emailStatusBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  emailStatusText: { color: '#6c757d', fontSize: 12, flex: 1 },
  resultButton: { backgroundColor: '#F5A623', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
  resultButtonText: { color: '#000', fontSize: 16, fontWeight: '600' },
});
