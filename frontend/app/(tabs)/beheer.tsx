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
import { useRouter } from 'expo-router';
import { showAlert } from '../../utils/alerts';

type Tab = 'overzicht' | 'werknemers' | 'teams' | 'klanten' | 'werven' | 'instellingen' | 'pdf';

export default function BeheerScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.rol === 'admin';
  
  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'team' | 'klant' | 'werf' | 'werknemer'>('team');
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Form states
  const [teamNaam, setTeamNaam] = useState('');
  const [teamLeden, setTeamLeden] = useState('');
  const [klantNaam, setKlantNaam] = useState('');
  const [klantEmail, setKlantEmail] = useState('');
  const [klantTelefoon, setKlantTelefoon] = useState('');
  const [klantAdres, setKlantAdres] = useState('');
  const [klantUurtarief, setKlantUurtarief] = useState('');
  const [klantPrijsafspraak, setKlantPrijsafspraak] = useState('');
  const [klantBtwNummer, setKlantBtwNummer] = useState('');
  const [werfNaam, setWerfNaam] = useState('');
  const [werfKlantId, setWerfKlantId] = useState('');
  const [werfAdres, setWerfAdres] = useState('');
  
  // Werknemer form states
  const [werknemerNaam, setWerknemerNaam] = useState('');
  const [werknemerEmail, setWerknemerEmail] = useState('');
  const [werknemerTeamId, setWerknemerTeamId] = useState('');
  
  // Result modal for showing password
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultTitle, setResultTitle] = useState('Werknemer Aangemaakt');
  const [resultData, setResultData] = useState<{naam: string; password: string; emailSent: boolean; emailError?: string} | null>(null);
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
  // Feature Toggles
  const [selfieActiveren, setSelfieActiveren] = useState(false);
  const [smsVerificatieActiveren, setSmsVerificatieActiveren] = useState(false);
  const [automatischNaarKlant, setAutomatischNaarKlant] = useState(false);
  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewStatus, setOverviewStatus] = useState<'alles' | 'concept' | 'ondertekend' | 'verzonden'>('alles');
  
  const {
    teams, klanten, werven, werknemers, werkbonnen, instellingen,
    fetchTeams, fetchKlanten, fetchWerven, fetchWerkbonnen, fetchInstellingen, fetchWerknemers,
    addTeam, updateTeam, deleteTeam,
    addKlant, updateKlant, deleteKlant,
    addWerf, updateWerf, deleteWerf,
    addWerknemer, updateWerknemer, resendWerknemerInfo, deleteWerknemer,
    updateInstellingen,
  } = useAppStore();

  useEffect(() => {
    if (!user?.id) return;
    fetchTeams();
    fetchKlanten();
    fetchWerven();
    fetchWerkbonnen({ userId: user.id, isAdmin: true });
    fetchInstellingen();
    fetchWerknemers();
  }, [user?.id]);

  const calculateWerkbonHours = (uren: any[] = []) => {
    return uren.reduce((sum, regel) => {
      return sum + (regel.maandag || 0) + (regel.dinsdag || 0) + (regel.woensdag || 0) + (regel.donderdag || 0) + (regel.vrijdag || 0) + (regel.zaterdag || 0) + (regel.zondag || 0);
    }, 0);
  };

  const filteredWerkbonnen = werkbonnen.filter((werkbon) => {
    const search = overviewSearch.trim().toLowerCase();
    const matchesStatus = overviewStatus === 'alles' || werkbon.status === overviewStatus;
    if (!search) return matchesStatus;

    const searchable = [werkbon.klant_naam, werkbon.werf_naam, werkbon.ingevuld_door_naam, werkbon.week_nummer?.toString()].join(' ').toLowerCase();
    return matchesStatus && searchable.includes(search);
  });

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
      setSelfieActiveren(instellingen.selfie_activeren || false);
      setSmsVerificatieActiveren(instellingen.sms_verificatie_activeren || false);
      setAutomatischNaarKlant(instellingen.automatisch_naar_klant || false);
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
        setKlantAdres(item.adres || '');
        setKlantUurtarief(item.uurtarief?.toString() || '0');
        setKlantPrijsafspraak(item.prijsafspraak || '');
        setKlantBtwNummer(item.btw_nummer || '');
      } else if (type === 'werf') {
        setWerfNaam(item.naam);
        setWerfKlantId(item.klant_id || '');
        setWerfAdres(item.adres || '');
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
      setKlantAdres('');
      setKlantUurtarief('0');
      setKlantPrijsafspraak('');
      setKlantBtwNummer('');
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
          showAlert('Fout', 'Vul een teamnaam in');
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
          showAlert('Fout', 'Vul naam en e-mail in');
          return;
        }
        const klantData = {
          naam: klantNaam.trim(),
          email: klantEmail.trim(),
          telefoon: klantTelefoon.trim() || undefined,
          adres: klantAdres.trim() || undefined,
          uurtarief: parseFloat(klantUurtarief) || 0,
          prijsafspraak: klantPrijsafspraak.trim() || undefined,
          btw_nummer: klantBtwNummer.trim() || undefined,
        };
        if (editingItem) {
          await updateKlant(editingItem.id, klantData);
        } else {
          await addKlant(klantData);
        }
      } else if (modalType === 'werf') {
        if (!werfNaam.trim() || !werfKlantId) {
          showAlert('Fout', 'Vul werf naam in en selecteer een klant');
          return;
        }
        const werfData = {
          naam: werfNaam.trim(),
          klant_id: werfKlantId,
          adres: werfAdres.trim() || undefined,
        };
        if (editingItem) {
          await updateWerf(editingItem.id, werfData);
        } else {
          await addWerf(werfData);
        }
      } else if (modalType === 'werknemer') {
        if (!werknemerNaam.trim() || !werknemerEmail.trim()) {
          showAlert('Fout', 'Vul naam en e-mail in');
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
          setResultTitle('Werknemer Aangemaakt');
          setResultData({
            naam: werknemerNaam,
            password: result.tempPassword,
            emailSent: result.emailSent,
            emailError: result.emailError,
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
      showAlert('Fout', error.message || 'Er is een fout opgetreden');
    }
  };

  const handleResendInfoMail = async (werknemer: User) => {
    try {
      const result = await resendWerknemerInfo(werknemer.id);
      setResultTitle('Info Mail Verstuurd');
      setResultData({
        naam: werknemer.naam,
        password: result.tempPassword,
        emailSent: result.emailSent,
        emailError: result.emailError,
      });
      setResultModalVisible(true);
    } catch (error: any) {
      showAlert('Fout', error.message || 'Info mail versturen mislukt');
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
      showAlert('Opgeslagen', 'Bedrijfsinstellingen zijn bijgewerkt');
    } catch (error: any) {
      showAlert('Fout', error.message);
    }
  };

  const handleSavePdfSettings = async () => {
    try {
      await updateInstellingen({
        pdf_voettekst: pdfVoettekst.trim(),
        logo_base64: logoBase64 || undefined,
        selfie_activeren: selfieActiveren,
        sms_verificatie_activeren: smsVerificatieActiveren,
        automatisch_naar_klant: automatischNaarKlant,
      });
      showAlert('Opgeslagen', 'PDF/App instellingen zijn bijgewerkt');
    } catch (error: any) {
      showAlert('Fout', error.message);
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
      showAlert('Fout', 'Kan afbeelding niet laden');
    }
  };

  const performDelete = async (type: 'team' | 'klant' | 'werf' | 'werknemer', id: string) => {
    try {
      if (type === 'team') await deleteTeam(id);
      else if (type === 'klant') await deleteKlant(id);
      else if (type === 'werf') await deleteWerf(id);
      else if (type === 'werknemer') await deleteWerknemer(id);
    } catch (error: any) {
      showAlert('Fout', error.message || 'Verwijderen mislukt');
    }
  };

  const confirmDelete = (type: 'team' | 'klant' | 'werf' | 'werknemer', id: string, naam: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Weet u zeker dat u "${naam}" wilt verwijderen?`)) {
        performDelete(type, id);
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
            onPress: async () => performDelete(type, id),
          },
        ]
      );
    }
  };

  const toggleWerknemerActief = async (werknemer: User) => {
    try {
      await updateWerknemer(werknemer.id, { actief: !werknemer.actief });
    } catch (error: any) {
      showAlert('Fout', error.message);
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
      case 'overzicht':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Werkbon Overzicht</Text>
              <TouchableOpacity
                testID="beheer-overview-refresh-button"
                style={styles.addBtn}
                onPress={() => user?.id && fetchWerkbonnen({ userId: user.id, isAdmin: true })}
              >
                <Ionicons name="refresh" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoText}>
              Hier ziet u alle werkbonnen van alle accounts. U kunt de status volgen en direct doorklikken naar de details.
            </Text>

            <View style={styles.overviewStatsRow}>
              <View style={styles.overviewStatCard}>
                <Text style={styles.overviewStatLabel}>Totaal</Text>
                <Text style={styles.overviewStatValue}>{werkbonnen.length}</Text>
              </View>
              <View style={styles.overviewStatCard}>
                <Text style={styles.overviewStatLabel}>Concept</Text>
                <Text style={styles.overviewStatValue}>{werkbonnen.filter(w => w.status === 'concept').length}</Text>
              </View>
              <View style={styles.overviewStatCard}>
                <Text style={styles.overviewStatLabel}>Ondertekend</Text>
                <Text style={styles.overviewStatValue}>{werkbonnen.filter(w => w.status === 'ondertekend').length}</Text>
              </View>
              <View style={styles.overviewStatCard}>
                <Text style={styles.overviewStatLabel}>Verzonden</Text>
                <Text style={styles.overviewStatValue}>{werkbonnen.filter(w => w.status === 'verzonden').length}</Text>
              </View>
            </View>

            <TextInput
              testID="beheer-overview-search-input"
              style={styles.textInput}
              value={overviewSearch}
              onChangeText={setOverviewSearch}
              placeholder="Zoek op werknemer, klant, werf of week"
              placeholderTextColor="#6c757d"
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusFilterScroll}>
              <View style={styles.klantSelector}>
                {[
                  { key: 'alles', label: 'Alles' },
                  { key: 'concept', label: 'Concept' },
                  { key: 'ondertekend', label: 'Ondertekend' },
                  { key: 'verzonden', label: 'Verzonden' },
                ].map((statusOption) => (
                  <TouchableOpacity
                    key={statusOption.key}
                    testID={`beheer-overview-filter-${statusOption.key}`}
                    style={[styles.klantOption, overviewStatus === statusOption.key && styles.klantOptionActive]}
                    onPress={() => setOverviewStatus(statusOption.key as typeof overviewStatus)}
                  >
                    <Text style={[styles.klantOptionText, overviewStatus === statusOption.key && styles.klantOptionTextActive]}>
                      {statusOption.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {filteredWerkbonnen.map((werkbon) => (
              <TouchableOpacity
                key={werkbon.id}
                testID={`beheer-werkbon-row-${werkbon.id}`}
                style={styles.overviewCard}
                onPress={() => router.push(`/werkbon/${werkbon.id}`)}
              >
                <View style={styles.overviewCardHeader}>
                  <View style={styles.weekMiniBadge}>
                    <Text style={styles.weekMiniBadgeText}>Week {werkbon.week_nummer}</Text>
                  </View>
                  <View style={[
                    styles.overviewStatusBadge,
                    werkbon.status === 'concept'
                      ? styles.statusConcept
                      : werkbon.status === 'ondertekend'
                        ? styles.statusOndertekend
                        : styles.statusVerzonden
                  ]}>
                    <Text style={styles.overviewStatusText}>{werkbon.status}</Text>
                  </View>
                </View>

                <Text style={styles.listItemText}>{werkbon.klant_naam}</Text>
                <Text style={styles.listItemSubtext}>{werkbon.werf_naam}</Text>
                <Text style={styles.listItemSubtext}>Ingevuld door: {werkbon.ingevuld_door_naam}</Text>
                <Text style={styles.listItemSubtext}>Totaal uren: {calculateWerkbonHours(werkbon.uren)}</Text>
                <Text style={styles.listItemSubtext}>
                  Mailstatus: {werkbon.email_verzonden ? 'PDF verzonden' : 'Nog niet verzonden'}
                </Text>
              </TouchableOpacity>
            ))}

            {filteredWerkbonnen.length === 0 && (
              <Text style={styles.emptyText}>Geen werkbonnen gevonden voor deze filter.</Text>
            )}
          </View>
        );

      case 'werknemers':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Werknemers</Text>
              <TouchableOpacity testID="werknemer-add-button" style={styles.addBtn} onPress={() => openModal('werknemer')}>
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoText}>
              Voeg werknemers toe door hun e-mailadres in te voeren. Ze kunnen dan inloggen met een tijdelijk wachtwoord.
            </Text>
            <View style={styles.noticeCard}>
              <Ionicons name="mail-open-outline" size={18} color="#F5A623" />
              <Text style={styles.noticeText}>
                Bij elke nieuwe werknemer proberen we automatisch een info mail te sturen. Met de knop{' '}
                <Text style={styles.noticeBold}>Info mail</Text> kunt u later opnieuw een nieuw tijdelijk wachtwoord sturen.
              </Text>
            </View>
            {werknemers.filter(w => w.rol !== 'admin').map((werknemer) => {
              const team = teams.find(t => t.id === werknemer.team_id);
              return (
                <View 
                  key={werknemer.id} 
                  testID={`werknemer-row-${werknemer.id}`}
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
                      testID={`werknemer-active-switch-${werknemer.id}`}
                      value={werknemer.actief}
                      onValueChange={() => toggleWerknemerActief(werknemer)}
                      trackColor={{ false: '#2d3a5f', true: '#F5A623' }}
                      thumbColor="#fff"
                    />
                    <TouchableOpacity
                      testID={`werknemer-info-mail-button-${werknemer.id}`}
                      style={styles.mailBtn}
                      onPress={() => handleResendInfoMail(werknemer)}
                    >
                      <Ionicons name="mail-outline" size={18} color="#F5A623" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      testID={`werknemer-delete-button-${werknemer.id}`}
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
                    {!!klant.adres && <Text style={styles.listItemSubtext}>{klant.adres}</Text>}
                    {klant.uurtarief > 0 && (
                      <Text style={styles.uurtariefText}>{klant.uurtarief}/uur</Text>
                    )}
                    {!!klant.prijsafspraak && (
                      <Text style={styles.teamBadge}>{klant.prijsafspraak}</Text>
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
                <TouchableOpacity key={werf.id} style={styles.listItem} onPress={() => openModal('werf', werf)}>
                  <View style={styles.listItemLeft}>
                    <Ionicons name="construct" size={20} color="#F5A623" />
                    <View>
                      <Text style={styles.listItemText}>{werf.naam}</Text>
                      <Text style={styles.listItemSubtext}>{klant?.naam || 'Onbekende klant'}</Text>
                      {!!werf.adres && <Text style={styles.listItemSubtext}>{werf.adres}</Text>}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => confirmDelete('werf', werf.id, werf.naam)}>
                    <Ionicons name="trash-outline" size={20} color="#dc3545" />
                  </TouchableOpacity>
                </TouchableOpacity>
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
            <TouchableOpacity testID="instellingen-save-button" style={styles.saveButton} onPress={handleSaveInstellingen}>
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
            
            <TouchableOpacity testID="pdf-settings-save-button" style={styles.saveButton} onPress={handleSavePdfSettings}>
              <Text style={styles.saveButtonText}>PDF Instellingen Opslaan</Text>
            </TouchableOpacity>

            {/* App Feature Toggles */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>App Instellingen</Text>
            <Text style={styles.helpText}>Schakel functies in of uit voor de app</Text>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="camera" size={18} color="#F5A623" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Selfie bij handtekening</Text>
                  <Text style={styles.toggleSubLabel}>Optionele selfie op het handtekeningscherm</Text>
                </View>
              </View>
              <Switch
                value={selfieActiveren}
                onValueChange={setSelfieActiveren}
                trackColor={{ false: '#2d3a5f', true: '#F5A62380' }}
                thumbColor={selfieActiveren ? '#F5A623' : '#555'}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="chatbubble" size={18} color="#6c757d" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>SMS verificatie</Text>
                  <Text style={styles.toggleSubLabel}>SMS code bevestiging (binnenkort beschikbaar)</Text>
                </View>
              </View>
              <Switch
                value={smsVerificatieActiveren}
                onValueChange={setSmsVerificatieActiveren}
                trackColor={{ false: '#2d3a5f', true: '#F5A62380' }}
                thumbColor={smsVerificatieActiveren ? '#F5A623' : '#555'}
                disabled={true}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="mail" size={18} color="#F5A623" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Automatisch naar klant sturen</Text>
                  <Text style={styles.toggleSubLabel}>Werkbon e-mail standaard ook naar klant</Text>
                </View>
              </View>
              <Switch
                value={automatischNaarKlant}
                onValueChange={setAutomatischNaarKlant}
                trackColor={{ false: '#2d3a5f', true: '#F5A62380' }}
                thumbColor={automatischNaarKlant ? '#F5A623' : '#555'}
              />
            </View>

            <TouchableOpacity style={[styles.saveButton, { marginTop: 16 }]} onPress={handleSavePdfSettings}>
              <Text style={styles.saveButtonText}>App Instellingen Opslaan</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
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
          {(['overzicht', 'werknemers', 'teams', 'klanten', 'werven', 'instellingen', 'pdf'] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              testID={`beheer-tab-${tab}`}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === 'overzicht' ? 'Overzicht' :
                 tab === 'werknemers' ? 'Werknemers' :
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
                      testID="werknemer-naam-input"
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
                      testID="werknemer-email-input"
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
                      testID="klant-naam-input"
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
                      testID="klant-email-input"
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
                    <Text style={styles.label}>Adres</Text>
                    <TextInput
                      style={styles.textInput}
                      value={klantAdres}
                      onChangeText={setKlantAdres}
                      placeholder="Straat + stad"
                      placeholderTextColor="#6c757d"
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
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Prijsafspraak / Notitie</Text>
                    <TextInput
                      style={[styles.textInput, styles.textAreaSmall]}
                      value={klantPrijsafspraak}
                      onChangeText={setKlantPrijsafspraak}
                      placeholder="Bijv. 55€/uur of vaste prijsafspraak"
                      placeholderTextColor="#6c757d"
                      multiline
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>BTW Nummer (optioneel)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={klantBtwNummer}
                      onChangeText={setKlantBtwNummer}
                      placeholder="Bijv. BE0123456789"
                      placeholderTextColor="#6c757d"
                      autoCapitalize="characters"
                    />
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

            <TouchableOpacity testID="beheer-modal-save-button" style={styles.saveButton} onPress={handleSave}>
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
            <Text style={styles.resultTitle}>{resultTitle}</Text>
            <Text style={styles.resultSubtitle}>
              {resultTitle === 'Info Mail Verstuurd'
                ? `Nieuwe inloggegevens voor ${resultData?.naam}`
                : `${resultData?.naam} is toegevoegd`}
            </Text>
            
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
                  ? 'Info mail is verzonden' 
                  : 'E-mail niet verzonden - deel wachtwoord handmatig'}
              </Text>
            </View>
            {!resultData?.emailSent && !!resultData?.emailError && (
              <Text testID="werknemer-email-error-text" style={styles.emailErrorText}>
                {resultData.emailError}
              </Text>
            )}
            
            <TouchableOpacity 
              testID="werknemer-result-ok-button"
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
  noticeCard: { flexDirection: 'row', gap: 10, backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2d3a5f' },
  noticeText: { color: '#a0a0a0', fontSize: 12, flex: 1, lineHeight: 18 },
  noticeBold: { color: '#F5A623', fontWeight: '600' },
  overviewStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  overviewStatCard: { backgroundColor: '#16213e', borderRadius: 12, padding: 14, minWidth: 100, borderWidth: 1, borderColor: '#2d3a5f' },
  overviewStatLabel: { color: '#6c757d', fontSize: 12, marginBottom: 6 },
  overviewStatValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
  statusFilterScroll: { marginBottom: 16 },
  overviewCard: { backgroundColor: '#16213e', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2d3a5f' },
  overviewCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  weekMiniBadge: { backgroundColor: '#2d3a5f', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  weekMiniBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  overviewStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  overviewStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statusConcept: { backgroundColor: '#ffc107' },
  statusOndertekend: { backgroundColor: '#28a745' },
  statusVerzonden: { backgroundColor: '#F5A623' },
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
  mailBtn: { padding: 8 },
  deleteBtn: { padding: 8 },
  formGroup: { marginBottom: 16 },
  rowGroup: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  halfInput: { flex: 1 },
  label: { color: '#a0a0a0', fontSize: 14, marginBottom: 8 },
  textInput: { backgroundColor: '#16213e', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#2d3a5f' },
  inputDisabled: { opacity: 0.5 },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  textAreaSmall: { minHeight: 80, textAlignVertical: 'top' },
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3a5f',
  },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  toggleLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  toggleSubLabel: { color: '#6c757d', fontSize: 12, marginTop: 2 },
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
  emailErrorText: { color: '#ffc107', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  resultButton: { backgroundColor: '#F5A623', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
  resultButtonText: { color: '#000', fontSize: 16, fontWeight: '600' },
});
