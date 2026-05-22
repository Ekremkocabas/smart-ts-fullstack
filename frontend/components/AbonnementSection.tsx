import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, apiClient, PlanInfo } from '../context/AuthContext';

interface Props {
  highlight?: boolean;
}

const PLAN_FEATURES_TABLE: Array<{ label: string; basic: string | boolean; pro: string | boolean }> = [
  { label: 'Werknemers', basic: 'Max 5', pro: 'Onbeperkt' },
  { label: 'Klanten', basic: 'Max 10', pro: 'Onbeperkt' },
  { label: 'Werven', basic: 'Max 5', pro: 'Onbeperkt' },
  { label: 'Werkbon types', basic: 'Alleen uren', pro: 'Alle types' },
  { label: 'Planning', basic: 'Basis', pro: 'Uitgebreid' },
  { label: 'PDF templates', basic: 'Standaard', pro: 'Aangepast + kleuren' },
  { label: 'Rapporten export', basic: false, pro: true },
  { label: 'Billit-koppeling', basic: false, pro: true },
  { label: 'Berichten', basic: false, pro: true },
];

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === true) return <Ionicons name="checkmark-circle" size={20} color="#16a34a" />;
  if (value === false) return <Ionicons name="close-circle" size={20} color="#9ca3af" />;
  return <Text style={styles.cellText}>{value}</Text>;
}

export default function AbonnementSection({ highlight }: Props) {
  const { planInfo, refreshPlanInfo } = useAuth();
  const [info, setInfo] = useState<PlanInfo | null>(planInfo);
  const [loading, setLoading] = useState(false);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);

  useEffect(() => {
    setInfo(planInfo);
  }, [planInfo]);

  useEffect(() => {
    (async () => {
      const fresh = await refreshPlanInfo();
      if (fresh) setInfo(fresh);
    })();
  }, []);

  const handleSelect = async (target: 'basic' | 'pro') => {
    if (info?.plan === target) return;
    const confirmMsg = target === 'pro'
      ? 'Wilt u upgraden naar het Pro-abonnement (€49/maand)?'
      : 'Wilt u terugschakelen naar het Basic-abonnement (€29/maand)? Functies boven uw nieuwe limiet blijven zichtbaar maar worden bevroren.';
    if (typeof window !== 'undefined' && window.confirm) {
      if (!window.confirm(confirmMsg)) return;
    }
    setBusyTarget(target);
    setLoading(true);
    try {
      await apiClient.post('/api/subscription/select-plan', { plan: target });
      const fresh = await refreshPlanInfo();
      if (fresh) setInfo(fresh);
      Alert.alert('Abonnement bijgewerkt', target === 'pro' ? 'U bent nu op het Pro-abonnement.' : 'U bent nu op het Basic-abonnement.');
    } catch (err: any) {
      Alert.alert('Fout', err?.response?.data?.detail || err?.message || 'Kon abonnement niet wijzigen');
    } finally {
      setLoading(false);
      setBusyTarget(null);
    }
  };

  const currentPlan = info?.plan || 'basic';
  const usage = info?.usage || { werknemers: 0, klanten: 0, werven: 0 };
  const limits = info?.limits || { werknemers: null, klanten: null, werven: null };

  const Usage = ({ label, used, limit }: { label: string; used: number; limit: number | null }) => {
    const isUnlimited = limit === null;
    const ratio = isUnlimited ? 0 : limit > 0 ? Math.min(1, used / limit) : 0;
    const warn = !isUnlimited && limit > 0 && ratio >= 0.8;
    const full = !isUnlimited && limit > 0 && used >= limit;
    return (
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={[styles.usageValue, full && { color: '#dc2626' }, warn && !full && { color: '#d97706' }]}>
          {used}{isUnlimited ? '' : ` / ${limit}`}
          {isUnlimited && <Text style={styles.usageInfinite}>  ∞</Text>}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, highlight && { borderColor: '#22C55E', borderWidth: 2 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Abonnement</Text>
        {info?.subscription?.status === 'trial' && (
          <View style={styles.trialBadge}>
            <Text style={styles.trialBadgeText}>Proefperiode — {info.subscription.days_remaining ?? 0} dagen</Text>
          </View>
        )}
        {currentPlan === 'free' && (
          <View style={[styles.trialBadge, { backgroundColor: '#22C55E' }]}>
            <Text style={styles.trialBadgeText}>Gratis (Signybon)</Text>
          </View>
        )}
      </View>

      <View style={styles.usageCard}>
        <Text style={styles.cardTitle}>Huidig gebruik</Text>
        <Usage label="Werknemers" used={usage.werknemers} limit={limits.werknemers} />
        <Usage label="Klanten" used={usage.klanten} limit={limits.klanten} />
        <Usage label="Werven" used={usage.werven} limit={limits.werven} />
      </View>

      {currentPlan !== 'free' && (
        <View style={styles.cards}>
          <PlanCard
            name="Basic"
            price="€29"
            current={currentPlan === 'basic'}
            features={['Max 5 werknemers', 'Max 10 klanten', 'Max 5 werven', 'Alleen uren-werkbon', 'Standaard PDF']}
            onSelect={() => handleSelect('basic')}
            disabled={loading}
            busy={busyTarget === 'basic'}
          />
          <PlanCard
            name="Pro"
            price="€49"
            highlight
            current={currentPlan === 'pro'}
            features={['Onbeperkt alles', 'Alle werkbon types', 'Berichten', 'Billit-koppeling', 'Aangepaste PDF + kleuren', 'Rapporten export']}
            onSelect={() => handleSelect('pro')}
            disabled={loading}
            busy={busyTarget === 'pro'}
          />
        </View>
      )}

      <View style={styles.tableCard}>
        <Text style={styles.cardTitle}>Vergelijking</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.cellText, styles.tableHeaderCell, { flex: 1.4 }]}>Functie</Text>
          <Text style={[styles.cellText, styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Basic</Text>
          <Text style={[styles.cellText, styles.tableHeaderCell, { flex: 1, textAlign: 'center', color: '#22C55E' }]}>Pro</Text>
        </View>
        {PLAN_FEATURES_TABLE.map((row) => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={[styles.cellText, { flex: 1.4 }]}>{row.label}</Text>
            <View style={{ flex: 1, alignItems: 'center' }}><FeatureCell value={row.basic} /></View>
            <View style={{ flex: 1, alignItems: 'center' }}><FeatureCell value={row.pro} /></View>
          </View>
        ))}
      </View>
    </View>
  );
}

function PlanCard({ name, price, features, onSelect, current, highlight, disabled, busy }: { name: string; price: string; features: string[]; onSelect: () => void; current?: boolean; highlight?: boolean; disabled?: boolean; busy?: boolean }) {
  return (
    <View style={[styles.planCard, highlight && styles.planCardHighlight, current && styles.planCardCurrent]}>
      {highlight && (
        <View style={styles.planBadge}><Text style={styles.planBadgeText}>POPULAIR</Text></View>
      )}
      <Text style={styles.planName}>{name}</Text>
      <Text style={styles.planPrice}>{price}<Text style={styles.planPriceSuffix}> /maand</Text></Text>
      <View style={styles.planFeatures}>
        {features.map((f) => (
          <View key={f} style={styles.planFeatureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={styles.planFeatureText}>{f}</Text>
          </View>
        ))}
      </View>
      {current ? (
        <View style={styles.currentBtn}><Text style={styles.currentBtnText}>Huidig plan</Text></View>
      ) : (
        <TouchableOpacity style={[styles.selectBtn, highlight && styles.selectBtnHighlight, disabled && { opacity: 0.6 }]} disabled={disabled} onPress={onSelect}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.selectBtnText}>{highlight ? 'Upgrade naar Pro' : 'Schakel naar Basic'}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  trialBadge: { backgroundColor: '#0F172A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  trialBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  usageCard: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  usageLabel: { color: '#475569', fontSize: 14 },
  usageValue: { color: '#0F172A', fontSize: 14, fontWeight: '600' },
  usageInfinite: { color: '#16a34a', fontSize: 14, fontWeight: '700' },
  cards: { flexDirection: 'row', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  planCard: { flex: 1, minWidth: 240, backgroundColor: '#fff', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#e2e8f0' },
  planCardHighlight: { borderColor: '#22C55E', borderWidth: 2 },
  planCardCurrent: { backgroundColor: '#f0fdf4', borderColor: '#16a34a' },
  planBadge: { position: 'absolute', top: -8, right: 12, backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  planBadgeText: { color: '#0F172A', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  planPrice: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  planPriceSuffix: { fontSize: 14, fontWeight: '500', color: '#64748b' },
  planFeatures: { gap: 8, marginVertical: 14 },
  planFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planFeatureText: { color: '#334155', fontSize: 13, flex: 1 },
  selectBtn: { backgroundColor: '#0F172A', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  selectBtnHighlight: { backgroundColor: '#22C55E' },
  selectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  currentBtn: { backgroundColor: '#dcfce7', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  currentBtnText: { color: '#16a34a', fontWeight: '700', fontSize: 14 },
  tableCard: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 14 },
  tableHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 4 },
  tableHeaderCell: { fontWeight: '700', color: '#0F172A' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  cellText: { color: '#475569', fontSize: 13 },
});
