import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Check, Crown } from 'lucide-react-native';

import { Button } from '../../components/ui/Button';
import { Banner, Card } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { env } from '../../config/env';
import type { RootScreenProps } from '../../navigation/types';
import { purchasePro } from '../../services/payments';
import { useAuthStore } from '../../store/authStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { colors, radius, spacing, type } from '../../theme';

const FEATURES = [
  'Unlimited drafts every month (fair use)',
  'Legal notices, bail applications and affidavits',
  'Source text for every verified citation',
  'Court-formatted Word export',
  'Offline access to your drafts',
];

export function PaywallScreen({
  navigation,
  route,
}: RootScreenProps<'Paywall'>) {
  const user = useAuthStore(s => s.user);
  const subscription = useSubscriptionStore(s => s.subscription);
  const refresh = useSubscriptionStore(s => s.refresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quota = route.params?.reason === 'quota';
  const isPro = subscription?.tier === 'pro';

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await purchasePro(user);
      if (result.status === 'active') {
        await refresh();
        Alert.alert('Welcome to Pro', 'You can now create unlimited drafts.', [
          { text: 'Continue', onPress: () => navigation.goBack() },
        ]);
      } else if (result.status === 'pending') {
        Alert.alert(
          'Payment received',
          'We are activating your plan. This usually takes under a minute; the Account tab will show Pro once it is active.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        isPro ? (
          <Button title="Close" onPress={() => navigation.goBack()} />
        ) : (
          <>
            <Button
              title={`Subscribe — ${env.proPlan.priceLabel}/${env.proPlan.interval}`}
              onPress={subscribe}
              loading={busy}
            />
            <Text style={[type.caption, styles.terms]}>
              Billed monthly through Razorpay (UPI, cards, netbanking). Renews
              automatically.
            </Text>
          </>
        )
      }
    >
      <View style={styles.hero}>
        <View style={styles.crown}>
          <Crown size={28} color={colors.onPrimary} />
        </View>
        <Text style={[type.title, styles.center]}>
          {isPro
            ? 'You are on Pro'
            : quota
            ? 'You have used your free drafts'
            : env.proPlan.name}
        </Text>
        <Text style={[type.body, styles.subtitle]}>
          {quota
            ? `The free plan includes ${
                subscription?.draftLimit ?? 3
              } drafts a month. Upgrade to keep drafting — your saved drafts stay available either way.`
            : 'Draft faster, with every citation traceable to its source.'}
        </Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{env.proPlan.priceLabel}</Text>
          <Text style={type.caption}>/ {env.proPlan.interval}</Text>
        </View>
        {FEATURES.map(f => (
          <View key={f} style={styles.feature}>
            <Check size={18} color={colors.success} strokeWidth={2.5} />
            <Text style={[type.body, styles.flex]}>{f}</Text>
          </View>
        ))}
      </Card>

      {error ? (
        <Banner tone="error" message={error} style={styles.error} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xl },
  crown: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: { color: colors.textMuted, textAlign: 'center' },
  card: { gap: spacing.md, borderRadius: radius.lg },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  price: { fontSize: 32, fontWeight: '700', color: colors.text },
  feature: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  terms: { textAlign: 'center' },
  error: { marginTop: spacing.lg },
});
