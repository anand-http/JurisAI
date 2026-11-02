import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MOCK_OTP } from '../../api/mock/mockAdapter';
import { Button } from '../../components/ui/Button';
import { Banner } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { env } from '../../config/env';
import { maskIdentifier } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing, type } from '../../theme';

const LENGTH = 6;
/** Matches OTP_RESEND_COOLDOWN_SECONDS on the backend. */
const RESEND_AFTER_SEC = 30;

export function OtpScreen({ navigation, route }: RootScreenProps<'Otp'>) {
  const { email } = route.params;
  const verifyOtp = useAuthStore(s => s.verifyOtp);
  const requestOtp = useAuthStore(s => s.requestOtp);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_AFTER_SEC);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const verify = async (value = code) => {
    if (value.length !== LENGTH || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // On success the root navigator swaps to the signed-in stack.
      await verifyOtp(email, value);
    } catch (e) {
      setError((e as Error).message);
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await requestOtp(email);
      setSecondsLeft(RESEND_AFTER_SEC);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen
      footer={
        <Button
          title="Verify"
          onPress={() => verify()}
          loading={loading}
          disabled={code.length !== LENGTH}
        />
      }
    >
      <Text style={type.title}>Enter the code</Text>
      <Text style={[type.body, styles.subtitle]}>
        Emailed to {maskIdentifier(email)}. Check spam if it isn't in your
        inbox.{' '}
        <Text style={styles.link} onPress={() => navigation.goBack()}>
          Change
        </Text>
      </Text>

      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={styles.boxes}
        accessible={false}
      >
        {Array.from({ length: LENGTH }).map((_, i) => {
          const active = i === code.length && !loading;
          return (
            <View
              key={i}
              style={[
                styles.box,
                active && styles.boxActive,
                !!error && styles.boxError,
              ]}
            >
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      {/* One real input drives the boxes so paste and one-time-code autofill work. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={t => {
          const digits = t.replace(/\D/g, '').slice(0, LENGTH);
          setCode(digits);
          if (digits.length === LENGTH) {
            verify(digits);
          }
        }}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        style={styles.hiddenInput}
        accessibilityLabel="One-time code"
      />

      {error ? (
        <Banner tone="error" message={error} style={styles.banner} />
      ) : null}
      {env.useMockApi ? (
        <Banner
          tone="info"
          message={`Mock API: use code ${MOCK_OTP}`}
          style={styles.banner}
        />
      ) : null}

      <View style={styles.resend}>
        {secondsLeft > 0 ? (
          <Text style={type.caption}>Resend code in {secondsLeft}s</Text>
        ) : (
          <Button
            title="Resend code"
            variant="ghost"
            compact
            onPress={resend}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  link: { color: colors.primary, fontWeight: '600' },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary },
  boxError: { borderColor: colors.danger },
  digit: { fontSize: 24, fontWeight: '600', color: colors.text },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  banner: { marginTop: spacing.lg },
  resend: { marginTop: spacing.xl, alignItems: 'flex-start' },
});
