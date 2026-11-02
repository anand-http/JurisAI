import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Scale } from 'lucide-react-native';

import { Button } from '../../components/ui/Button';
import { Banner, MockBadge, SegmentedControl } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';
import { isValidEmail } from '../../lib/validation';
import type { RootScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { colors, spacing, type } from '../../theme';

type Method = 'code' | 'password';

export function LoginScreen({ navigation }: RootScreenProps<'Login'>) {
  const requestOtp = useAuthStore(s => s.requestOtp);
  const loginWithPassword = useAuthStore(s => s.loginWithPassword);
  const [method, setMethod] = useState<Method>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMethod = (next: Method) => {
    setMethod(next);
    setPassword('');
    setPasswordError(null);
    setSubmitError(null);
  };

  const submit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setEmailError('Enter a valid email address');
      return;
    }
    if (method === 'password' && !password) {
      setPasswordError('Enter your password');
      return;
    }
    setEmailError(null);
    setPasswordError(null);
    setSubmitError(null);
    setLoading(true);
    try {
      if (method === 'code') {
        await requestOtp(normalized);
        navigation.navigate('Otp', { email: normalized });
      } else {
        // On success the root navigator swaps to the signed-in stack.
        await loginWithPassword(normalized, password);
      }
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          title={method === 'code' ? 'Email me a code' : 'Sign in'}
          onPress={submit}
          loading={loading}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Scale size={30} color={colors.onPrimary} />
        </View>
        <Text style={styles.appName}>JurisAI</Text>
        <Text style={styles.tagline}>
          Court-ready first drafts, with every citation linked to its source.
        </Text>
        <MockBadge style={styles.centered} />
      </View>

      <Text style={[type.heading, styles.heading]}>Sign in</Text>
      <SegmentedControl
        options={[
          { value: 'code', label: 'Email code' },
          { value: 'password', label: 'Password' },
        ]}
        value={method}
        onChange={switchMethod}
      />
      <View style={styles.field}>
        <TextField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="you@chambers.in"
          error={emailError}
          onSubmitEditing={method === 'code' ? submit : undefined}
        />
      </View>
      {method === 'password' ? (
        <View style={styles.field}>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect={false}
            error={passwordError}
            onSubmitEditing={submit}
          />
        </View>
      ) : null}
      {submitError ? (
        <Banner tone="error" message={submitError} style={styles.banner} />
      ) : null}

      {method === 'code' ? (
        <Text style={[type.caption, styles.note]}>
          We'll email you a one-time code. New here? The code creates your
          account.
        </Text>
      ) : (
        <View style={styles.note}>
          <Text style={type.caption}>
            Forgot your password, or never set one? Sign in with an email code,
            then set a new password from your Account page.
          </Text>
          <Button
            title="Use an email code instead"
            variant="ghost"
            compact
            onPress={() => switchMethod('code')}
            style={styles.link}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  centered: { alignSelf: 'center' },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { ...type.title, fontSize: 28 },
  tagline: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  heading: { marginBottom: spacing.md },
  field: { marginTop: spacing.lg },
  banner: { marginTop: spacing.md },
  note: { marginTop: spacing.md },
  link: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
