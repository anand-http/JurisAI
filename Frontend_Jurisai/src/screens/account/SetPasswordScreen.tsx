import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../api/errors';
import { Button } from '../../components/ui/Button';
import { Banner } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';
import type { RootScreenProps } from '../../navigation/types';
import { FRESH_EMAIL_CODE_MS, useAuthStore } from '../../store/authStore';
import { colors, spacing, type } from '../../theme';

/** Matches PASSWORD_MIN_LENGTH on the backend. */
const MIN_LENGTH = 8;

export function SetPasswordScreen({
  navigation,
}: RootScreenProps<'SetPassword'>) {
  const user = useAuthStore(s => s.user);
  const emailCodeSignInAt = useAuthStore(s => s.emailCodeSignInAt);
  const setPassword = useAuthStore(s => s.setPassword);

  // Right after an email-code sign-in the backend doesn't ask for the old
  // password; it may still ask (e.g. the 15 minutes ran out), and then we show it.
  const recentCode =
    emailCodeSignInAt !== null &&
    Date.now() - emailCodeSignInAt < FRESH_EMAIL_CODE_MS;
  const [askCurrent, setAskCurrent] = useState(
    !!user?.hasPassword && !recentCode,
  );

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (next.length < MIN_LENGTH) {
      setFieldError(`Use at least ${MIN_LENGTH} characters`);
      return;
    }
    if (next !== confirm) {
      setFieldError('The two passwords do not match');
      return;
    }
    setFieldError(null);
    setError(null);
    setLoading(true);
    try {
      await setPassword(next, askCurrent ? current : undefined);
      navigation.goBack();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.serverCode === 'current_password_required'
      ) {
        setAskCurrent(true);
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      footer={<Button title="Save password" onPress={save} loading={loading} />}
    >
      <Text style={type.title}>
        {user?.hasPassword ? 'Change password' : 'Set a password'}
      </Text>
      <Text style={[type.body, styles.subtitle]}>
        You can then sign in with {user?.email ?? 'your email'} and this
        password. Email codes keep working too.
      </Text>

      {askCurrent ? (
        <View style={styles.field}>
          <TextField
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[type.caption, styles.hint]}>
            Forgot it? Sign out, sign in again with an email code, and set a new
            one here within 15 minutes.
          </Text>
        </View>
      ) : null}
      <View style={styles.field}>
        <TextField
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          help={`At least ${MIN_LENGTH} characters`}
        />
      </View>
      <View style={styles.field}>
        <TextField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldError}
          onSubmitEditing={save}
        />
      </View>
      {error ? (
        <Banner tone="error" message={error} style={styles.field} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
  field: { marginTop: spacing.lg },
  hint: { marginTop: spacing.xs },
});
