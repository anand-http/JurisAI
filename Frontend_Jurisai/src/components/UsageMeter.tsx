import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Crown } from 'lucide-react-native';

import type { Subscription } from '../api/types';
import { draftsRemaining } from '../store/subscriptionStore';
import { colors, radius, spacing, type } from '../theme';

export function UsageMeter({
  subscription,
  onUpgrade,
}: {
  subscription: Subscription | null;
  onUpgrade: () => void;
}) {
  if (!subscription) {
    return null;
  }
  if (subscription.tier === 'pro') {
    return (
      <View style={[styles.box, styles.pro]}>
        <Crown size={18} color={colors.primary} />
        <Text style={[type.body, styles.proText]}>
          Pro plan · {subscription.draftsUsedThisPeriod} drafts this month
        </Text>
      </View>
    );
  }
  const limit = subscription.draftLimit;
  const remaining = draftsRemaining(subscription) ?? 0;
  const used = Math.min(subscription.draftsUsedThisPeriod, limit);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${remaining} of ${limit} free drafts left this month. Upgrade.`}
      onPress={onUpgrade}
      style={styles.box}
    >
      <View style={styles.flex}>
        <Text style={type.subheading}>
          {remaining} of {limit} free drafts left this month
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { flex: used },
              remaining === 0 && styles.fillEmpty,
            ]}
          />
          <View style={{ flex: Math.max(limit - used, 0) }} />
        </View>
      </View>
      <Text style={styles.upgrade}>Upgrade</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pro: { backgroundColor: colors.primaryTint, borderColor: colors.primaryTint },
  proText: { color: colors.primary, fontWeight: '600' },
  flex: { flex: 1 },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { backgroundColor: colors.primary },
  fillEmpty: { backgroundColor: colors.danger },
  upgrade: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});
