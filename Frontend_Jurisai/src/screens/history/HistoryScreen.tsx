import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CloudOff, Files, Search, X } from 'lucide-react-native';

import type { DraftSummary } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Banner, EmptyState, OfflineBanner } from '../../components/ui/misc';
import { documentTypeLabel } from '../../documents/registry';
import { useIsOnline } from '../../hooks/useIsOnline';
import { formatRelative } from '../../lib/format';
import type { TabScreenProps } from '../../navigation/types';
import { useDraftsStore } from '../../store/draftsStore';
import { colors, radius, spacing, type } from '../../theme';

export function HistoryScreen({ navigation }: TabScreenProps<'History'>) {
  const {
    summaries,
    listStatus,
    listError,
    showingCached,
    offlineIds,
    loadList,
    loadMore,
  } = useDraftsStore();
  const online = useIsOnline();
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList]),
  );

  // Reload when the connection comes back.
  useEffect(() => {
    if (online && showingCached) {
      loadList();
    }
  }, [online, showingCached, loadList]);

  // Titles hold party names, so search runs on this device only.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return summaries;
    }
    return summaries.filter(s =>
      `${s.title ?? ''} ${documentTypeLabel(s.docType)}`
        .toLowerCase()
        .includes(q),
    );
  }, [summaries, query]);

  const offlineOnly = showingCached || !online;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={type.title}>My drafts</Text>
        <View style={styles.search}>
          <Search size={18} color={colors.textSubtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by party, client or type"
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search drafts"
          />
          {query ? (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={10}
            >
              <X size={18} color={colors.textSubtle} />
            </Pressable>
          ) : null}
        </View>
        {offlineOnly ? <OfflineBanner /> : null}
        {listError ? (
          <Banner
            tone="error"
            message={listError}
            action={{ label: 'Retry', onPress: () => loadList() }}
          />
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={d => d.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => !query && loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={listStatus === 'refreshing'}
            onRefresh={() => loadList({ refresh: true })}
            tintColor={colors.primary}
          />
        }
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => (
          <DraftRow
            item={item}
            offline={offlineIds.includes(item.id)}
            dimmed={offlineOnly && !offlineIds.includes(item.id)}
            onPress={() =>
              navigation.navigate('DraftReview', { draftId: item.id })
            }
          />
        )}
        ListEmptyComponent={
          listStatus === 'loading' ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : query ? (
            <EmptyState
              icon={Search}
              title="No matches"
              message={`No drafts match "${query}".`}
            />
          ) : (
            <EmptyState
              icon={Files}
              title="No drafts yet"
              message="Your legal notices, bail applications and affidavits will appear here."
            >
              <Button
                title="Create a draft"
                onPress={() => navigation.navigate('NewDraft')}
              />
            </EmptyState>
          )
        }
        ListFooterComponent={
          listStatus === 'loadingMore' ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function DraftRow({
  item,
  offline,
  dimmed,
  onPress,
}: {
  item: DraftSummary;
  offline: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  const label = documentTypeLabel(item.docType);
  const hasCounts = item.citationCount !== undefined && item.citationCount > 0;
  const allVerified =
    hasCounts && item.verifiedCitationCount === item.citationCount;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title ?? label}, ${formatRelative(
        item.updatedAt,
      )}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        dimmed && styles.dimmed,
      ]}
    >
      <View style={styles.flex}>
        <Text style={type.subheading} numberOfLines={2}>
          {item.title ?? label}
        </Text>
        <View style={styles.metaRow}>
          <Text style={type.caption}>
            {item.title ? `${label} · ` : ''}
            {formatRelative(item.updatedAt)}
          </Text>
          {item.status === 'edited' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Edited</Text>
            </View>
          ) : null}
        </View>
        {hasCounts ? (
          <Text
            style={[styles.citations, !allVerified && styles.citationsWarn]}
          >
            {item.verifiedCitationCount} of {item.citationCount} citations
            verified
          </Text>
        ) : null}
      </View>
      {offline ? (
        <View accessibilityLabel="Available offline" style={styles.offlineIcon}>
          <CloudOff size={16} color={colors.textSubtle} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, minHeight: 44, fontSize: 16, color: colors.text },
  list: { padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  separator: { height: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  dimmed: { opacity: 0.5 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  citations: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  citationsWarn: { color: colors.warning },
  offlineIcon: { padding: spacing.xs },
  loading: { marginTop: spacing.xl },
});
