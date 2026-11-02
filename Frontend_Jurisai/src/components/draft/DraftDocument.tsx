import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Citation } from '../../api/types';
import {
  citationStatus,
  isHeading,
  segmentParagraph,
} from '../../lib/citations';
import { colors, documentFont, radius, spacing } from '../../theme';

const THIN = ' ';

interface Props {
  paragraphs: string[];
  citations: Citation[];
  mentions: string[];
  editing: boolean;
  activeIndex: number | null;
  onActivate: (index: number) => void;
  onChangeParagraph: (index: number, value: string) => void;
  onPressCitation: (citationIndex: number) => void;
  onPressUnlinked: (text: string) => void;
}

/**
 * Renders the draft like a sheet of paper. Every legal reference is drawn as
 * a tappable, colour-coded span — never as plain text. In edit mode each
 * paragraph can be tapped and edited in place.
 */
export function DraftDocument({
  paragraphs,
  citations,
  mentions,
  editing,
  activeIndex,
  onActivate,
  onChangeParagraph,
  onPressCitation,
  onPressUnlinked,
}: Props) {
  return (
    <View style={styles.paper}>
      {paragraphs.map((paragraph, index) => {
        const heading = isHeading(paragraph);
        if (editing && activeIndex === index) {
          return (
            <TextInput
              key={index}
              value={paragraph}
              onChangeText={v => onChangeParagraph(index, v)}
              multiline
              autoFocus
              scrollEnabled={false}
              accessibilityLabel={`Edit paragraph ${index + 1}`}
              style={[styles.text, styles.input, heading && styles.heading]}
            />
          );
        }
        const body = (
          <Paragraph
            text={paragraph}
            heading={heading}
            citations={citations}
            mentions={mentions}
            onPressCitation={editing ? undefined : onPressCitation}
            onPressUnlinked={editing ? undefined : onPressUnlinked}
          />
        );
        return editing ? (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityHint="Edit this paragraph"
            onPress={() => onActivate(index)}
            style={styles.editable}
          >
            {body}
          </Pressable>
        ) : (
          <View key={index} style={styles.block}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const Paragraph = memo(function ParagraphText({
  text,
  heading,
  citations,
  mentions,
  onPressCitation,
  onPressUnlinked,
}: {
  text: string;
  heading: boolean;
  citations: Citation[];
  mentions: string[];
  onPressCitation?: (index: number) => void;
  onPressUnlinked?: (text: string) => void;
}) {
  const segments = segmentParagraph(text, citations, mentions);
  return (
    <Text style={[styles.text, heading && styles.heading]}>
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          return segment.text;
        }
        if (segment.kind === 'unlinked') {
          return (
            <Text
              key={i}
              accessibilityRole="link"
              accessibilityLabel={`Reference without a source: ${segment.text}. Double tap for details.`}
              onPress={
                onPressUnlinked
                  ? () => onPressUnlinked(segment.text)
                  : undefined
              }
              style={[styles.chip, styles.unlinked]}
            >
              {THIN}
              {segment.text}
              {THIN}?{THIN}
            </Text>
          );
        }
        const status = citationStatus(citations[segment.citationIndex]);
        return (
          <Text
            key={i}
            accessibilityRole="link"
            accessibilityLabel={`${
              status === 'verified'
                ? 'Verified citation'
                : 'Unverified citation'
            }: ${segment.text}. Double tap to view source.`}
            onPress={
              onPressCitation
                ? () => onPressCitation(segment.citationIndex)
                : undefined
            }
            style={[
              styles.chip,
              status === 'verified' ? styles.verified : styles.unverified,
            ]}
          >
            {THIN}
            {segment.text}
            {THIN}
            {status === 'verified' ? '✓' : '⚠︎'}
            {THIN}
          </Text>
        );
      })}
    </Text>
  );
});

const styles = StyleSheet.create({
  paper: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  block: { marginBottom: spacing.md },
  editable: {
    marginBottom: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  text: {
    fontFamily: documentFont,
    fontSize: 16,
    lineHeight: 26,
    color: colors.text,
  },
  heading: { fontWeight: '700', textAlign: 'center' },
  input: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
    textAlignVertical: 'top',
  },
  chip: { fontSize: 15, fontWeight: '600' },
  verified: {
    color: colors.citeVerified,
    backgroundColor: colors.citeVerifiedBg,
  },
  unverified: {
    color: colors.citeUnverified,
    backgroundColor: colors.citeUnverifiedBg,
  },
  unlinked: {
    color: colors.citeUnlinked,
    backgroundColor: colors.citeUnlinkedBg,
  },
});
