import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Check,
  CircleAlert,
  Info,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';

import { env } from '../../config/env';
import { colors, radius, spacing, type } from '../../theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type BannerTone = 'info' | 'warning' | 'error' | 'offline';

const BANNER: Record<
  BannerTone,
  { bg: string; fg: string; border: string; icon: LucideIcon }
> = {
  info: {
    bg: colors.primaryTint,
    fg: colors.primary,
    border: colors.primaryTint,
    icon: Info,
  },
  warning: {
    bg: colors.warningTint,
    fg: colors.warning,
    border: colors.warningBorder,
    icon: TriangleAlert,
  },
  error: {
    bg: colors.dangerTint,
    fg: colors.danger,
    border: colors.dangerTint,
    icon: CircleAlert,
  },
  offline: {
    bg: colors.surfaceMuted,
    fg: colors.textMuted,
    border: colors.border,
    icon: WifiOff,
  },
};

export function Banner({
  tone,
  title,
  message,
  action,
  style,
}: {
  tone: BannerTone;
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  const t = BANNER[tone];
  const Icon = t.icon;
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[
        styles.banner,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <Icon size={18} color={t.fg} style={styles.bannerIcon} />
      <View style={styles.flex}>
        {title ? (
          <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text>
        ) : null}
        <Text style={[styles.bannerText, { color: t.fg }]}>{message}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            hitSlop={8}
          >
            <Text style={[styles.bannerAction, { color: t.fg }]}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function OfflineBanner({ message }: { message?: string }) {
  return (
    <Banner
      tone="offline"
      message={
        message ?? "You're offline. Showing drafts saved on this device."
      }
      style={styles.offline}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  children,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon size={28} color={colors.primary} />
      </View>
      <Text style={[type.heading, styles.center]}>{title}</Text>
      <Text style={[type.body, styles.emptyMessage]}>{message}</Text>
      {children}
    </View>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.checkRow}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? (
          <Check size={16} color={colors.onPrimary} strokeWidth={3} />
        ) : null}
      </View>
      <Text style={[type.body, styles.flex]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map(option => {
        const on = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(option)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small marker so nobody mistakes mock data for real output. */
export function MockBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  if (!env.useMockApi) {
    return null;
  }
  return (
    <View style={[styles.mock, style]}>
      <Text style={styles.mockText}>MOCK API</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerIcon: { marginTop: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  bannerAction: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.xs,
    textDecorationLine: 'underline',
  },
  offline: { marginBottom: spacing.md },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyMessage: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.onPrimary, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentOn: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 15, color: colors.textMuted, fontWeight: '500' },
  segmentTextOn: { color: colors.text, fontWeight: '600' },
  mock: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningTint,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mockText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
    letterSpacing: 0.5,
  },
});
