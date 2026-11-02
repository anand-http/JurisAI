import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { ApiError } from '../../api/errors';
import { Button } from '../../components/ui/Button';
import { Banner } from '../../components/ui/misc';
import {
  collectVisibleAnswers,
  getDocumentType,
} from '../../documents/registry';
import type { RootScreenProps } from '../../navigation/types';
import { useDraftsStore } from '../../store/draftsStore';
import { useIntakeStore } from '../../store/intakeStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { colors, radius, spacing, type } from '../../theme';

/**
 * The backend answers POST /drafts/generate in one response, so stages
 * advance on a timer while it runs. The last stage never completes until
 * the server has actually responded.
 */
const STAGES = [
  { label: 'Reading your case details', startsAt: 0 },
  { label: 'Retrieving relevant sections and judgments', startsAt: 1500 },
  { label: 'Drafting the document', startsAt: 6000 },
  { label: 'Checking every citation against its source', startsAt: 14000 },
];

type Phase = 'running' | 'done' | 'error';

export function GeneratingScreen({
  navigation,
}: RootScreenProps<'Generating'>) {
  // Snapshot the answers: the intake store is cleared once the draft exists.
  const [{ def, answers }] = useState(() => {
    const intake = useIntakeStore.getState();
    return {
      def: intake.docTypeId ? getDocumentType(intake.docTypeId) : undefined,
      answers: intake.answers,
    };
  });
  const reset = useIntakeStore(s => s.reset);
  const generate = useDraftsStore(s => s.generate);
  const refreshSubscription = useSubscriptionStore(s => s.refresh);

  const [stage, setStage] = useState(0);
  const [phase, setPhase] = useState<Phase>('running');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!def) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('running');
    setError(null);
    setStage(0);
    const timers = STAGES.slice(1).map((s, i) =>
      setTimeout(() => setStage(i + 1), s.startsAt),
    );
    try {
      const draft = await generate(
        def.id,
        collectVisibleAnswers(def, answers),
        controller.signal,
      );
      timers.forEach(clearTimeout);
      setStage(STAGES.length);
      setPhase('done');
      reset(); // case facts no longer needed in memory
      refreshSubscription();
      setTimeout(
        () =>
          // Drop the wizard from history: Back from the draft goes home.
          navigation.reset({
            index: 1,
            routes: [
              { name: 'Main' },
              { name: 'DraftReview', params: { draftId: draft.id } },
            ],
          }),
        500,
      );
    } catch (e) {
      timers.forEach(clearTimeout);
      if (controller.signal.aborted) {
        return;
      }
      if (e instanceof ApiError && e.code === 'QUOTA_EXCEEDED') {
        refreshSubscription();
        navigation.replace('Paywall', { reason: 'quota' });
        return;
      }
      setPhase('error');
      setError((e as Error).message);
    }
  }, [answers, def, generate, navigation, refreshSubscription, reset]);

  useEffect(() => {
    run();
    return () => controllerRef.current?.abort();
    // Re-run only when the user taps "Try again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (!def) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={type.title}>
          {phase === 'error'
            ? 'Drafting failed'
            : `Preparing your ${def.title.toLowerCase()}`}
        </Text>
        <Text style={[type.body, styles.subtitle]}>
          {phase === 'error'
            ? 'Your answers are still here — nothing was lost.'
            : 'This usually takes 20–40 seconds. Please keep the app open.'}
        </Text>

        <View style={styles.stages}>
          {STAGES.map((s, i) => {
            const done = i < stage;
            const active = i === stage && phase === 'running';
            return (
              <View
                key={s.label}
                style={styles.stage}
                accessibilityLiveRegion={active ? 'polite' : 'none'}
              >
                <View
                  style={[
                    styles.marker,
                    done && styles.markerDone,
                    active && styles.markerActive,
                  ]}
                >
                  {done ? (
                    <Check size={14} color={colors.onPrimary} strokeWidth={3} />
                  ) : active ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.stageLabel,
                    (done || active) && styles.stageLabelOn,
                  ]}
                >
                  {s.label}
                  {active ? '…' : ''}
                </Text>
              </View>
            );
          })}
        </View>

        {error ? <Banner tone="error" message={error} /> : null}
      </View>

      <View style={styles.footer}>
        {phase === 'error' ? (
          <>
            <Button title="Try again" onPress={() => setAttempt(a => a + 1)} />
            <Button
              title="Edit details"
              variant="secondary"
              onPress={() => navigation.goBack()}
            />
          </>
        ) : (
          <Button
            title="Cancel"
            variant="ghost"
            disabled={phase === 'done'}
            onPress={() => {
              controllerRef.current?.abort();
              navigation.goBack();
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxl * 1.5 },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  stages: { gap: spacing.lg, marginBottom: spacing.xl },
  stage: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  marker: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerActive: { borderColor: colors.primaryTint },
  markerDone: { backgroundColor: colors.success, borderColor: colors.success },
  stageLabel: { fontSize: 16, color: colors.textSubtle, flex: 1 },
  stageLabelOn: { color: colors.text },
  footer: { padding: spacing.lg, gap: spacing.sm },
});
