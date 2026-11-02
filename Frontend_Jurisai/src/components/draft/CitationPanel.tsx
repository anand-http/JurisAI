import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react-native';

import type { Citation } from '../../api/types';
import {
  citationKey,
  citationStatus,
  type CitationSummary,
} from '../../lib/citations';
import { colors, radius, spacing, type } from '../../theme';

interface Props {
  citations: Citation[];
  summary: CitationSummary;
  /** Indexes of citations no longer present in the (edited) text. */
  missingIndexes: number[];
  checkedKeys: string[];
  onPressCitation: (index: number) => void;
  onPressUnlinked: (text: string) => void;
}

const STATUS = {
  verified: {
    icon: CircleCheck,
    fg: colors.citeVerified,
    bg: colors.citeVerifiedBg,
    label: 'Source verified',
  },
  unverified: {
    icon: TriangleAlert,
    fg: colors.citeUnverified,
    bg: colors.citeUnverifiedBg,
    label: 'Not verified',
  },
  unlinked: {
    icon: CircleHelp,
    fg: colors.citeUnlinked,
    bg: colors.citeUnlinkedBg,
    label: 'No source attached',
  },
} as const;

/** Counts + legend, shown above the document. */
export function CitationSummaryBar({ summary }: { summary: CitationSummary }) {
  const items: Array<[keyof typeof STATUS, number]> = [
    ['verified', summary.verified],
    ['unverified', summary.unverified],
    ['unlinked', summary.unlinked],
  ];
  return (
    <View style={styles.summary}>
      {items.map(([key, count]) => {
        const s = STATUS[key];
        const Icon = s.icon;
        return (
          <View key={key} style={[styles.pill, { backgroundColor: s.bg }]}>
            <Icon size={14} color={s.fg} />
            <Text style={[styles.pillText, { color: s.fg }]}>
              {count} {s.label.toLowerCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Every citation and unlinked reference as a chip, below the document. */
export function CitationPanel({
  citations,
  summary,
  missingIndexes,
  checkedKeys,
  onPressCitation,
  onPressUnlinked,
}: Props) {
  if (citations.length === 0 && summary.unlinkedTexts.length === 0) {
    return (
      <Text style={[type.caption, styles.empty]}>
        No statutes or judgments are cited in this draft.
      </Text>
    );
  }
  return (
    <View style={styles.panel}>
      <Text style={type.subheading}>Authorities in this draft</Text>
      <Text style={[type.caption, styles.hint]}>
        Tap to read the source text and mark it as checked.
      </Text>
      {citations.map((citation, index) => {
        const status = citationStatus(citation);
        const s = STATUS[status];
        const Icon = s.icon;
        const checked = checkedKeys.includes(citationKey(citation));
        const missing = missingIndexes.includes(index);
        return (
          <Pressable
            key={`${index}-${citation.text}`}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${citation.text}${
              checked ? ', checked by you' : ''
            }`}
            onPress={() => onPressCitation(index)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: s.bg, borderColor: s.bg },
              pressed && styles.pressed,
            ]}
          >
            <Icon size={18} color={s.fg} />
            <View style={styles.flex}>
              <Text
                style={[styles.chipText, { color: s.fg }]}
                numberOfLines={3}
              >
                {citation.text}
              </Text>
              <Text style={[styles.meta, { color: s.fg }]}>
                {s.label}
                {missing ? ' · removed from text' : ''}
              </Text>
            </View>
            {checked ? (
              <View style={styles.checked}>
                <Text style={styles.checkedText}>Checked</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {summary.unlinkedTexts.map(text => {
        const s = STATUS.unlinked;
        return (
          <Pressable
            key={`unlinked-${text}`}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${text}`}
            onPress={() => onPressUnlinked(text)}
            style={({ pressed }) => [
              styles.chip,
              styles.dashed,
              { backgroundColor: s.bg, borderColor: s.fg },
              pressed && styles.pressed,
            ]}
          >
            <CircleHelp size={18} color={s.fg} />
            <View style={styles.flex}>
              <Text
                style={[styles.chipText, { color: s.fg }]}
                numberOfLines={3}
              >
                {text}
              </Text>
              <Text style={[styles.meta, { color: s.fg }]}>
                {s.label} — verify manually
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  panel: { gap: spacing.sm },
  hint: { marginBottom: spacing.xs },
  empty: { textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  dashed: { borderStyle: 'dashed' },
  pressed: { opacity: 0.75 },
  chipText: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  meta: { fontSize: 12, marginTop: 2, opacity: 0.85 },
  checked: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  checkedText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
});
