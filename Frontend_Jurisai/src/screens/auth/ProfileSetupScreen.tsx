import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LawyerProfile } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Banner, ChipGroup } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { INDIAN_STATES, PRACTICE_AREAS } from '../../documents/constants';
import { isPlausibleEnrolmentNumber } from '../../lib/validation';
import type { RootScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { colors, spacing, type } from '../../theme';

type Errors = Partial<Record<keyof LawyerProfile, string>>;

export function ProfileSetupScreen({
  navigation,
  route,
}: RootScreenProps<'Onboarding' | 'EditProfile'>) {
  const editing = route.name === 'EditProfile';
  const existing = useAuthStore(s => s.user?.profile);
  const saveProfile = useAuthStore(s => s.saveProfile);

  const [form, setForm] = useState<LawyerProfile>(
    existing ?? {
      fullName: '',
      barRegistrationNumber: '',
      enrolmentState: '',
      practiceAreas: [],
      primaryCourt: '',
      city: '',
    },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof LawyerProfile>(
    key: K,
    value: LawyerProfile[K],
  ) => setForm(f => ({ ...f, [key]: value }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (form.fullName.trim().length < 3) {
      e.fullName = 'Enter your name as on the enrolment certificate';
    }
    if (!isPlausibleEnrolmentNumber(form.barRegistrationNumber)) {
      e.barRegistrationNumber =
        'Enter a valid enrolment number, e.g. D/1234/2015';
    }
    if (!form.enrolmentState) {
      e.enrolmentState = 'Select your State Bar Council';
    }
    if (form.practiceAreas.length === 0) {
      e.practiceAreas = 'Pick at least one practice area';
    }
    if (form.primaryCourt.trim().length < 3) {
      e.primaryCourt = 'Enter the court you mostly appear in';
    }
    if (form.city.trim().length < 2) {
      e.city = 'Enter your city';
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await saveProfile({
        ...form,
        fullName: form.fullName.trim(),
        barRegistrationNumber: form.barRegistrationNumber.trim().toUpperCase(),
        primaryCourt: form.primaryCourt.trim(),
        city: form.city.trim(),
      });
      if (editing) {
        navigation.goBack();
      }
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      edges={editing ? ['bottom'] : ['top', 'bottom']}
      footer={
        <Button
          title={editing ? 'Save changes' : 'Continue'}
          onPress={submit}
          loading={saving}
        />
      }
    >
      {!editing ? (
        <>
          <Text style={type.title}>Your practice</Text>
          <Text style={[type.body, styles.subtitle]}>
            These details appear on your drafts and pre-fill court names.
          </Text>
        </>
      ) : null}

      <TextField
        label="Full name"
        required
        value={form.fullName}
        onChangeText={v => set('fullName', v)}
        placeholder="Adv. Priya Sharma"
        textContentType="name"
        autoComplete="name"
        error={errors.fullName}
      />
      <SelectField
        label="State Bar Council"
        required
        value={form.enrolmentState}
        options={INDIAN_STATES.map(s => ({ value: s, label: s }))}
        onChange={v => set('enrolmentState', v)}
        placeholder="Select state / UT"
        error={errors.enrolmentState}
      />
      <TextField
        label="Enrolment number"
        required
        value={form.barRegistrationNumber}
        onChangeText={v => set('barRegistrationNumber', v)}
        placeholder="D/1234/2015"
        autoCapitalize="characters"
        autoCorrect={false}
        help="As printed on your Bar Council enrolment certificate."
        error={errors.barRegistrationNumber}
      />

      <Text style={styles.label}>
        Practice areas<Text style={styles.required}> *</Text>
      </Text>
      <ChipGroup
        options={PRACTICE_AREAS}
        selected={form.practiceAreas}
        onToggle={area =>
          set(
            'practiceAreas',
            form.practiceAreas.includes(area)
              ? form.practiceAreas.filter(a => a !== area)
              : [...form.practiceAreas, area],
          )
        }
      />
      {errors.practiceAreas ? (
        <Text style={styles.error}>{errors.practiceAreas}</Text>
      ) : null}

      <View style={styles.gap} />
      <TextField
        label="Primary court"
        required
        value={form.primaryCourt}
        onChangeText={v => set('primaryCourt', v)}
        placeholder="e.g. Saket District Courts, New Delhi"
        help="Pre-filled as the court in new drafts. You can change it per draft."
        error={errors.primaryCourt}
      />
      <TextField
        label="City"
        required
        value={form.city}
        onChangeText={v => set('city', v)}
        placeholder="e.g. New Delhi"
        error={errors.city}
      />
      {submitError ? <Banner tone="error" message={submitError} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  label: { ...type.label, marginBottom: spacing.sm },
  required: { color: colors.danger },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  gap: { height: spacing.xl },
});
