import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronRight,
  FileText,
  Gavel,
  Mail,
  type LucideIcon,
} from 'lucide-react-native';

import { UsageMeter } from '../../components/UsageMeter';
import { MockBadge } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { DOCUMENT_TYPES } from '../../documents/registry';
import type { DocumentIcon } from '../../documents/types';
import type { TabScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import {
  draftsRemaining,
  useSubscriptionStore,
} from '../../store/subscriptionStore';
import { colors, radius, spacing, type } from '../../theme';

const ICONS: Record<DocumentIcon, LucideIcon> = {
  notice: Mail,
  bail: Gavel,
  affidavit: FileText,
};

export function DocumentTypeScreen({ navigation }: TabScreenProps<'NewDraft'>) {
  const firstName = useAuthStore(
    s => s.user?.profile?.fullName.replace(/^Adv\.?\s*/i, '').split(' ')[0],
  );
  const subscription = useSubscriptionStore(s => s.subscription);
  const refresh = useSubscriptionStore(s => s.refresh);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const start = (docTypeId: string) => {
    if (draftsRemaining(subscription) === 0) {
      navigation.navigate('Paywall', { reason: 'quota' });
      return;
    }
    navigation.navigate('DraftIntake', { docTypeId });
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={type.caption}>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={type.title}>New draft</Text>
        </View>
        <MockBadge />
      </View>

      <UsageMeter
        subscription={subscription}
        onUpgrade={() => navigation.navigate('Paywall')}
      />

      <Text style={[type.label, styles.section]}>WHAT ARE YOU DRAFTING?</Text>
      <View style={styles.list}>
        {DOCUMENT_TYPES.map(doc => {
          const Icon = ICONS[doc.icon];
          return (
            <Pressable
              key={doc.id}
              accessibilityRole="button"
              accessibilityLabel={`${doc.title}. ${doc.description}`}
              onPress={() => start(doc.id)}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.icon}>
                <Icon size={22} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={type.subheading}>{doc.title}</Text>
                <Text style={[type.caption, styles.description]}>
                  {doc.description}
                </Text>
                <Text style={styles.steps}>
                  Up to {doc.steps.length} short steps
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textSubtle} />
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.caption, styles.footnote]}>
        Litigation documents only for now. Every draft is AI-assisted and must
        be reviewed by you before filing.
      </Text>
    </Screen>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    letterSpacing: 0.6,
  },
  list: { gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: { marginTop: 2 },
  steps: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  footnote: { marginTop: spacing.xl, textAlign: 'center' },
});
