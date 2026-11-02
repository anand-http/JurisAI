import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react-native';

import { colors, radius, spacing } from '../../theme';

interface Props {
  /** First time this draft is opened: the full banner cannot be collapsed. */
  firstView: boolean;
}

/**
 * Always visible on a draft. On first view it is fixed open; afterwards the
 * lawyer may collapse it to a one-line strip, but never remove it.
 */
export function DisclaimerBanner({ firstView }: Props) {
  const [collapsed, setCollapsed] = useState(!firstView);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.row}>
        <TriangleAlert size={20} color={colors.warning} />
        <Text style={styles.title}>
          AI-assisted draft — verify before filing
        </Text>
        {!firstView ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              collapsed ? 'Show disclaimer details' : 'Collapse disclaimer'
            }
            onPress={() => setCollapsed(c => !c)}
            hitSlop={12}
          >
            {collapsed ? (
              <ChevronDown size={20} color={colors.warning} />
            ) : (
              <ChevronUp size={20} color={colors.warning} />
            )}
          </Pressable>
        ) : null}
      </View>
      {!collapsed ? (
        <Text style={styles.body}>
          This draft was prepared with AI assistance. Check every fact, date,
          section and case citation against its source before filing. Tap any
          highlighted reference to read the source text. You remain responsible
          for the final document.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warningTint,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.warning },
  body: { fontSize: 14, lineHeight: 20, color: colors.warning },
});
