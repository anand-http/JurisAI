import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FieldRenderer } from '../../components/draft/FieldRenderer';
import { Button } from '../../components/ui/Button';
import { Banner, Card } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import {
  getDocumentType,
  initialAnswers,
  validateStep,
  visibleFields,
  visibleSteps,
} from '../../documents/registry';
import type { FieldDef } from '../../documents/types';
import { formatDate, formatIndianNumber } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useIntakeStore } from '../../store/intakeStore';
import { colors, radius, spacing, type } from '../../theme';

export function DraftIntakeScreen({
  navigation,
  route,
}: RootScreenProps<'DraftIntake'>) {
  const def = getDocumentType(route.params.docTypeId)!;
  const profile = useAuthStore(s => s.user?.profile ?? null);
  const { docTypeId, answers, start, setAnswer } = useIntakeStore();

  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resume answers for the same document type; start fresh otherwise.
  useEffect(() => {
    if (docTypeId !== def.id) {
      start(def.id, initialAnswers(def, profile));
    }
  }, [def, docTypeId, profile, start]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: def.title });
  }, [navigation, def.title]);

  const steps = useMemo(() => visibleSteps(def, answers), [def, answers]);
  const isReview = stepIndex >= steps.length;
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const totalSteps = steps.length + 1;

  const next = () => {
    if (isReview) {
      navigation.navigate('Generating');
      return;
    }
    const stepErrors = validateStep(step, answers);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      setStepIndex(i => i + 1);
    }
  };

  const back = () => {
    setErrors({});
    if (stepIndex === 0) {
      navigation.goBack();
    } else {
      setStepIndex(i => i - 1);
    }
  };

  const onChange = (field: FieldDef, value: string) => {
    setAnswer(field.key, value);
    if (errors[field.key]) {
      setErrors(({ [field.key]: _, ...rest }) => rest);
    }
  };

  return (
    <Screen
      key={stepIndex}
      footer={
        <View style={styles.actions}>
          <Button
            title="Back"
            variant="secondary"
            onPress={back}
            style={styles.backButton}
          />
          <Button
            title={
              isReview
                ? 'Generate draft'
                : stepIndex === steps.length - 1
                ? 'Review'
                : 'Next'
            }
            onPress={next}
            style={styles.flex}
          />
        </View>
      }
    >
      <View style={styles.progressRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[styles.progress, i <= stepIndex && styles.progressOn]}
          />
        ))}
      </View>
      <Text style={type.caption}>
        Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
      </Text>

      {isReview ? (
        <>
          <Text style={[type.title, styles.title]}>Check the details</Text>
          <Text style={[type.body, styles.subtitle]}>
            The draft will be written from these answers. Accurate facts make a
            better draft.
          </Text>
          {steps.map((s, i) => (
            <Card key={s.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={type.subheading}>{s.title}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStepIndex(i)}
                  hitSlop={10}
                >
                  <Text style={styles.edit}>Edit</Text>
                </Pressable>
              </View>
              {visibleFields(s, answers).map(f => (
                <View key={f.key} style={styles.reviewRow}>
                  <Text style={type.caption}>{f.label}</Text>
                  <Text style={type.body}>
                    {displayValue(f, answers[f.key])}
                  </Text>
                </View>
              ))}
            </Card>
          ))}
          <Banner
            tone="info"
            message="Drafting takes about 20–40 seconds. Your case details are sent securely and are not used to train AI models."
          />
        </>
      ) : (
        <>
          <Text style={[type.title, styles.title]}>{step.title}</Text>
          {step.subtitle ? (
            <Text style={[type.body, styles.subtitle]}>{step.subtitle}</Text>
          ) : (
            <View style={styles.spacer} />
          )}
          {visibleFields(step, answers).map(field => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={answers[field.key] ?? ''}
              error={errors[field.key]}
              onChange={v => onChange(field, v)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function displayValue(field: FieldDef, value: string | undefined): string {
  if (!value?.trim()) {
    return '—';
  }
  switch (field.type) {
    case 'select':
      return field.options?.find(o => o.value === value)?.label ?? value;
    case 'date':
      return formatDate(value);
    case 'amount':
      return `₹${formatIndianNumber(value)}`;
    default:
      return value;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md },
  backButton: { minWidth: 100 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },
  progress: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressOn: { backgroundColor: colors.primary },
  title: { marginTop: spacing.md },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  spacer: { height: spacing.xl },
  reviewCard: {
    marginBottom: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewRow: { gap: 2 },
  edit: { color: colors.primary, fontWeight: '600', fontSize: 15 },
});
