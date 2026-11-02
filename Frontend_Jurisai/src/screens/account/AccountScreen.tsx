import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { KeyRound, LogOut, SquarePen, Trash2 } from 'lucide-react-native';

import { UsageMeter } from '../../components/UsageMeter';
import { Button } from '../../components/ui/Button';
import { Card, MockBadge } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { formatDate } from '../../lib/format';
import type { TabScreenProps } from '../../navigation/types';
import { deleteAllExports, listExports } from '../../services/exportFiles';
import { useAuthStore } from '../../store/authStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { colors, spacing, type } from '../../theme';

export function AccountScreen({ navigation }: TabScreenProps<'Account'>) {
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const subscription = useSubscriptionStore(s => s.subscription);
  const refresh = useSubscriptionStore(s => s.refresh);
  const [fileCount, setFileCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      refresh();
      listExports()
        .then(f => setFileCount(f.length))
        .catch(() => undefined);
    }, [refresh]),
  );

  const profile = user?.profile;

  const confirmSignOut = () =>
    Alert.alert(
      'Sign out?',
      'Drafts and exported files saved on this device will be removed. Your drafts stay in your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
      ],
    );

  const confirmClearFiles = () =>
    Alert.alert(
      'Remove downloaded files?',
      'You can export them again at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteAllExports();
            setFileCount(0);
          },
        },
      ],
    );

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <Text style={type.title}>Account</Text>
        <MockBadge />
      </View>

      <Card style={styles.card}>
        <Text style={type.heading}>{profile?.fullName ?? 'Advocate'}</Text>
        <Row label="Enrolment no." value={profile?.barRegistrationNumber} />
        <Row label="Bar Council" value={profile?.enrolmentState} />
        <Row label="Primary court" value={profile?.primaryCourt} />
        <Row label="Practice areas" value={profile?.practiceAreas.join(', ')} />
        <Row label="Email" value={user?.email} />
        <Button
          title="Edit profile"
          icon={SquarePen}
          variant="secondary"
          compact
          onPress={() => navigation.navigate('EditProfile')}
          style={styles.edit}
        />
      </Card>

      <Text style={[type.label, styles.section]}>SIGN-IN</Text>
      <Card style={styles.card}>
        <Text style={type.body}>
          {user?.hasPassword
            ? 'You can sign in with your password or an email code.'
            : 'You sign in with an email code. Set a password to sign in without waiting for an email.'}
        </Text>
        <Button
          title={user?.hasPassword ? 'Change password' : 'Set a password'}
          icon={KeyRound}
          variant="secondary"
          compact
          onPress={() => navigation.navigate('SetPassword')}
          style={styles.edit}
        />
      </Card>

      <Text style={[type.label, styles.section]}>PLAN</Text>
      <UsageMeter
        subscription={subscription}
        onUpgrade={() => navigation.navigate('Paywall')}
      />
      {subscription?.tier === 'pro' && subscription.renewsAt ? (
        <Text style={[type.caption, styles.note]}>
          Renews on {formatDate(subscription.renewsAt)}
        </Text>
      ) : null}

      <Text style={[type.label, styles.section]}>THIS DEVICE</Text>
      <Card style={styles.card}>
        <Text style={type.body}>
          {fileCount} exported file{fileCount === 1 ? '' : 's'} saved for
          offline use
        </Text>
        <Text style={type.caption}>
          Draft copies on this device are encrypted and removed when you sign
          out.
        </Text>
        {fileCount > 0 ? (
          <Button
            title="Remove downloaded files"
            icon={Trash2}
            variant="ghost"
            compact
            onPress={confirmClearFiles}
            style={styles.edit}
          />
        ) : null}
      </Card>

      <Button
        title="Sign out"
        icon={LogOut}
        variant="danger"
        onPress={confirmSignOut}
        style={styles.section}
      />

      {/* Required attribution: the judgments dataset is licensed CC-BY-4.0. */}
      <Text style={[type.caption, styles.sources]}>
        Legal sources: bare acts from India Code (Legislative Department,
        Government of India). Supreme Court judgments from the Indian Supreme
        Court Judgments dataset by Dattam Labs (CC BY 4.0).
      </Text>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[type.caption, styles.rowLabel]}>{label}</Text>
      <Text style={[type.body, styles.rowValue]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  rowLabel: { width: 110 },
  rowValue: { flex: 1 },
  edit: { alignSelf: 'flex-start', marginTop: spacing.sm },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    letterSpacing: 0.6,
  },
  note: { marginTop: spacing.sm, color: colors.textMuted },
  sources: { marginTop: spacing.xl, color: colors.textMuted },
});
