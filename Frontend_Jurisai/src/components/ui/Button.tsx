import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { colors, radius, spacing } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const palette: Record<
  Variant,
  { bg: string; fg: string; border: string; pressed: string }
> = {
  primary: {
    bg: colors.primary,
    fg: colors.onPrimary,
    border: colors.primary,
    pressed: colors.primaryPressed,
  },
  secondary: {
    bg: colors.surface,
    fg: colors.primary,
    border: colors.borderStrong,
    pressed: colors.surfaceMuted,
  },
  ghost: {
    bg: 'transparent',
    fg: colors.primary,
    border: 'transparent',
    pressed: colors.primaryTint,
  },
  danger: {
    bg: colors.surface,
    fg: colors.danger,
    border: colors.danger,
    pressed: colors.dangerTint,
  },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading = false,
  disabled = false,
  compact = false,
  style,
  accessibilityHint,
}: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: pressed ? p.pressed : p.bg, borderColor: p.border },
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={18} color={p.fg} strokeWidth={2} /> : null}
          <Text style={[styles.label, { color: p.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 40, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
