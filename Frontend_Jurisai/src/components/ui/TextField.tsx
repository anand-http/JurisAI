import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius, spacing, type } from '../../theme';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  help?: string;
  prefix?: string;
  required?: boolean;
}

export const TextField = forwardRef<
  React.ComponentRef<typeof TextInput>,
  Props
>(function TextFieldImpl(
  { label, error, help, prefix, required, multiline, style, ...rest },
  ref,
) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.multilineWrap,
          !!error && styles.inputError,
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textSubtle}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[styles.input, multiline && styles.multiline, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : help ? (
        <Text style={styles.help}>{help}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...type.label, marginBottom: spacing.xs + 2 },
  required: { color: colors.danger },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  multilineWrap: { alignItems: 'flex-start' },
  inputError: { borderColor: colors.danger },
  prefix: { fontSize: 16, color: colors.textMuted, marginRight: spacing.sm },
  input: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  multiline: { minHeight: 110, maxHeight: 260 },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  help: { ...type.caption, marginTop: spacing.xs },
});
