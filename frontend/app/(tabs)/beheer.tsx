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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, TeamLid, Klant, Werf } from '../../store/appStore';

type Tab = 'team' | 'klanten' | 'werven' | 'instellingen';

export default function BeheerScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('team');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'team' | 'klant' | 'werf'>('team');
  
  // Form states
  const [teamNaam, setTeamNaam] = useState('');
  const [klantNaam, setKlantNaam] = useState('');
  const [klantEmail, setKlantEmail] = useState('');
  const [klantTelefoon, setKlantTelefoon] = useState('');
  const [werfNaam, setWerfNaam] = useState('');
  const [werfKlantId, setWerfKlantId] = useState('');
  const [werfAdres, setWerfAdres] = useState('');
  
  // Settings
  const [bedrijfsnaam, setBedrijfsnaam] = useState('');
  const [bedrijfsEmail, setBedrijfsEmail] = useState('');
  const [bedrijfsTelefoon, setBedrijfsTelefoon] = useState('');
  
  const {
    teamleden, klanten, werven, instellingen,
    fetchTeamleden, fetchKlanten, fetchWerven, fetchInstellingen,
    addTeamlid, deleteTeamlid,
    addKlant, deleteKlant,
    addWerf, deleteWerf,
    updateInstellingen,
  } = useAppStore();

  useEffect(() => {
    fetchTeamleden();
    fetchKlanten();
    fetchWerven();
    fetchInstellingen();
  }, []);

  useEffect(() => {
    if (instellingen) {
      setBedrijfsnaam(instellingen.bedrijfsnaam || '');
      setBedrijfsEmail(instellingen.email || '');
      setBedrijfsTelefoon(instellingen.telefoon || '');
    }
  }, [instellingen]);

  const openModal = (type: 'team' | 'klant' | 'werf') => {
    setModalType(type);
    setModalVisible(true);
    // Reset forms
    setTeamNaam('');
    setKlantNaam('');
    setKlantEmail('');
    setKlantTelefoon('');
    setWerfNaam('');
    setWerfKlantId('');
    setWerfAdres('');
  };

  const handleSave = async () => {
    try {
      if (modalType === 'team') {
        if (!teamNaam.trim()) {
          Alert.alert('Fout', 'Vul een naam in');
          return;
        }
        await addTeamlid(teamNaam.trim());
      } else if (modalType === 'klant') {
        if (!klantNaam.trim() || !klantEmail.trim()) {
          Alert.alert('Fout', 'Vul naam en e-mail in');
          return;
        }
        await addKlant({
          naam: klantNaam.trim(),
          email: klantEmail.trim(),
          telefoon: klantTelefoon.trim() || undefined,
        });
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
      }
      setModalVisible(false);
    } catch (error: any) {
      Alert.alert('Fout', error.message);
    }
  };

  const handleSaveInstellingen = async () => {
    try {
      await updateInstellingen({
        bedrijfsnaam: bedrijfsnaam.trim(),
        email: bedrijfsEmail.trim(),
        telefoon: bedrijfsTelefoon.trim() || undefined,
      });
      Alert.alert('Opgeslagen', 'Bedrijfsinstellingen zijn bijgewerkt');
    } catch (error: any) {
      Alert.alert('Fout', error.message);
    }
  };

  const confirmDelete = (type: 'team' | 'klant' | 'werf', id: string, naam: string) => {
    Alert.alert(
      'Verwijderen',
      `Weet u zeker dat u "${naam}" wilt verwijderen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            if (type === 'team') await deleteTeamlid(id);
            else if (type === 'klant') await deleteKlant(id);
            else if (type === 'werf') await deleteWerf(id);
          },
        },
      ]
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'team':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Teamleden</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openModal('team')}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {teamleden.map((lid) => (
              <View key={lid.id} style={styles.listItem}>
                <View style={styles.listItemLeft}>
                  <Ionicons name="person" size={20} color="#F5A623" />
                  <Text style={styles.listItemText}>{lid.naam}</Text>
                </View>
                <TouchableOpacity onPress={() => confirmDelete('team', lid.id, lid.naam)}>
                  <Ionicons name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </View>
            ))}
            {teamleden.length === 0 && (
              <Text style={styles.emptyText}>Nog geen teamleden toegevoegd</Text>
            )}
          </View>
        );
      
      case 'klanten':
        return (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Klanten</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openModal('klant')}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {klanten.map((klant) => (
              <View key={klant.id} style={styles.listItem}>
                <View style={styles.listItemLeft}>
                  <Ionicons name="business" size={20} color="#F5A623" />
                  <View>
                    <Text style={styles.listItemText}>{klant.naam}</Text>
                    <Text style={styles.listItemSubtext}>{klant.email}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => confirmDelete('klant', klant.id, klant.naam)}>
                  <Ionicons name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </View>
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
                <Ionicons name="add" size={20} color="#fff" />
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
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveInstellingen}>
              <Text style={styles.saveButtonText}>Opslaan</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Beheer</Text>
      </View>

      <View style={styles.tabs}>
        {(['team', 'klanten', 'werven', 'instellingen'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
                {modalType === 'team' ? 'Nieuw Teamlid' :
                 modalType === 'klant' ? 'Nieuwe Klant' : 'Nieuwe Werf'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {modalType === 'team' && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Naam</Text>
                <TextInput
                  style={styles.textInput}
                  value={teamNaam}
                  onChangeText={setTeamNaam}
                  placeholder="Volledige naam"
                  placeholderTextColor="#6c757d"
                  autoFocus
                />
              </View>
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

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Opslaan</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#16213e',
  },
  activeTab: {
    backgroundColor: '#F5A623',
  },
  tabText: {
    color: '#6c757d',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  addBtn: {
    backgroundColor: '#F5A623',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  listItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  listItemSubtext: {
    color: '#6c757d',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 24,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#a0a0a0',
    fontSize: 14,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  saveButton: {
    backgroundColor: '#F5A623',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  klantSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  klantOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d3a5f',
  },
  klantOptionActive: {
    backgroundColor: '#F5A623',
    borderColor: '#F5A623',
  },
  klantOptionText: {
    color: '#6c757d',
    fontSize: 14,
  },
  klantOptionTextActive: {
    color: '#fff',
  },
});
