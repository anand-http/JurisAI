import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';

import { formatDate, parseIsoDate, toIsoDate } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme';
import { Button } from './Button';

interface Props {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string | null;
  help?: string;
  required?: boolean;
}

/** Stores dates as yyyy-mm-dd; displays them as "27 Sep 2026". */
export function DateField({
  label,
  value,
  onChange,
  error,
  help,
  required,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Date>(new Date());
  const current = parseIsoDate(value);

  const openPicker = () => {
    setPending(current ?? new Date());
    setOpen(true);
  };

  const onAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) {
      onChange(toIsoDate(date));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${
          current ? formatDate(current) : 'not set'
        }`}
        onPress={openPicker}
        style={[styles.field, !!error && styles.fieldError]}
      >
        <Text style={[styles.value, !current && styles.placeholder]}>
          {current ? formatDate(current) : 'Select date'}
        </Text>
        <Calendar size={18} color={colors.textSubtle} />
      </Pressable>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : help ? (
        <Text style={styles.help}>{help}</Text>
      ) : null}

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={pending}
          mode="date"
          onChange={onAndroidChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.iosSheet}>
            <Text style={[type.subheading, styles.iosTitle]}>{label}</Text>
            <DateTimePicker
              value={pending}
              mode="date"
              display="inline"
              themeVariant="light"
              onChange={(_, date) => date && setPending(date)}
            />
            <Button
              title="Done"
              onPress={() => {
                onChange(toIsoDate(pending));
                setOpen(false);
              }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...type.label, marginBottom: spacing.xs + 2 },
  required: { color: colors.danger },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  fieldError: { borderColor: colors.danger },
  value: { fontSize: 16, color: colors.text },
  placeholder: { color: colors.textSubtle },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  help: { ...type.caption, marginTop: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  iosSheet: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  iosTitle: { marginBottom: spacing.sm },
});
