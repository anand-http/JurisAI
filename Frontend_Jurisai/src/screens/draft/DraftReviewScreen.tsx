import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { FileDown, FolderOpen, Pencil, Share2 } from 'lucide-react-native';

import {
  CitationPanel,
  CitationSummaryBar,
} from '../../components/draft/CitationPanel';
import { DisclaimerBanner } from '../../components/draft/DisclaimerBanner';
import { DraftDocument } from '../../components/draft/DraftDocument';
import { Button } from '../../components/ui/Button';
import { Banner, Card, OfflineBanner } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { documentTypeLabel } from '../../documents/registry';
import { useIsOnline } from '../../hooks/useIsOnline';
import {
  citationsMissingFromText,
  joinParagraphs,
  splitParagraphs,
  summarizeCitations,
} from '../../lib/citations';
import { formatRelative } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import {
  listExports,
  openExport,
  shareExport,
  type LocalExport,
} from '../../services/exportFiles';
import { getReviewState, updateReviewState } from '../../storage/reviewState';
import { useDraftsStore } from '../../store/draftsStore';
import { colors, spacing, type } from '../../theme';

export function DraftReviewScreen({
  navigation,
  route,
}: RootScreenProps<'DraftReview'>) {
  const { draftId } = route.params;
  const draft = useDraftsStore(s => s.drafts[draftId]);
  const loadDraft = useDraftsStore(s => s.loadDraft);
  const saveText = useDraftsStore(s => s.saveText);
  const online = useIsOnline();

  const [loading, setLoading] = useState(!draft);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [firstView, setFirstView] = useState<boolean | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [exports, setExports] = useState<LocalExport[]>([]);

  const [editing, setEditing] = useState(false);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await loadDraft(draftId);
      setFromCache(result.fromCache);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [draftId, loadDraft]);

  useEffect(() => {
    load();
    // The disclaimer can't be collapsed the first time a draft is opened.
    getReviewState(draftId).then(state => {
      setFirstView(!state.disclaimerSeen);
      if (!state.disclaimerSeen) {
        updateReviewState(draftId, { disclaimerSeen: true });
      }
    });
  }, [draftId, load]);

  // Citation checks and exports change on other screens.
  useFocusEffect(
    useCallback(() => {
      getReviewState(draftId).then(s => setCheckedKeys(s.checkedCitations));
      listExports(draftId)
        .then(setExports)
        .catch(() => undefined);
    }, [draftId]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: draft ? documentTypeLabel(draft.docType) : 'Draft',
    });
  }, [navigation, draft]);

  usePreventRemove(dirty, ({ data }) => {
    Alert.alert(
      'Discard changes?',
      'Your edits to this draft have not been saved.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

  const text = editing ? joinParagraphs(paragraphs) : draft?.text ?? '';
  const citations = useMemo(() => draft?.citations ?? [], [draft]);
  const mentions = useMemo(() => draft?.unlinkedMentions ?? [], [draft]);
  const summary = useMemo(
    () => summarizeCitations(text, citations, mentions),
    [text, citations, mentions],
  );
  const missing = useMemo(
    () => citationsMissingFromText(text, citations),
    [text, citations],
  );

  const startEditing = () => {
    if (!draft) {
      return;
    }
    setParagraphs(splitParagraphs(draft.text));
    setActiveIndex(null);
    setDirty(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    const stop = () => {
      setEditing(false);
      setDirty(false);
      setActiveIndex(null);
    };
    if (!dirty) {
      stop();
      return;
    }
    Alert.alert('Discard changes?', 'Your edits will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: stop },
    ]);
  };

  const save = async () => {
    const next = joinParagraphs(paragraphs);
    if (!next.trim()) {
      Alert.alert('Draft is empty', 'Add some text before saving.');
      return;
    }
    setSaving(true);
    try {
      await saveText(draftId, next);
      setDirty(false);
      setEditing(false);
      setActiveIndex(null);
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!draft) {
    return (
      <Screen>
        <Banner
          tone="error"
          title="Could not open this draft"
          message={loadError ?? 'Please try again.'}
          action={{ label: 'Try again', onPress: load }}
        />
      </Screen>
    );
  }

  const footer = editing ? (
    <View style={styles.actions}>
      <Button
        title="Cancel"
        variant="secondary"
        onPress={cancelEditing}
        style={styles.flex}
      />
      <Button
        title="Save changes"
        onPress={save}
        loading={saving}
        disabled={!dirty}
        style={styles.flex}
      />
    </View>
  ) : (
    <View style={styles.actions}>
      <Button
        title="Edit"
        icon={Pencil}
        variant="secondary"
        onPress={startEditing}
        disabled={!online}
        style={styles.flex}
      />
      <Button
        title="Export"
        icon={FileDown}
        onPress={() => navigation.navigate('Export', { draftId })}
        disabled={!online && exports.length === 0}
        style={styles.flex}
      />
    </View>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.stack}>
        {firstView !== null ? (
          <DisclaimerBanner key={String(firstView)} firstView={firstView} />
        ) : null}
        {!online || fromCache ? (
          <OfflineBanner message="Offline copy from this device. Editing and exporting need a connection." />
        ) : null}
        {editing ? (
          <Banner
            tone="info"
            message="Tap a paragraph to edit it. Citations are re-checked against the text when you save."
          />
        ) : null}

        <View>
          <Text style={type.heading}>{draft.title}</Text>
          <Text style={[type.caption, styles.meta]}>
            {draft.status === 'edited' ? 'Edited' : 'Generated'}{' '}
            {formatRelative(draft.updatedAt)}
          </Text>
        </View>
        <CitationSummaryBar summary={summary} />

        <DraftDocument
          paragraphs={editing ? paragraphs : splitParagraphs(draft.text)}
          citations={citations}
          mentions={mentions}
          editing={editing}
          activeIndex={activeIndex}
          onActivate={setActiveIndex}
          onChangeParagraph={(index, value) => {
            setParagraphs(p => p.map((old, i) => (i === index ? value : old)));
            setDirty(true);
          }}
          onPressCitation={citationIndex =>
            navigation.navigate('CitationSource', { draftId, citationIndex })
          }
          onPressUnlinked={unlinkedText =>
            navigation.navigate('CitationSource', { draftId, unlinkedText })
          }
        />

        {!editing ? (
          <CitationPanel
            citations={citations}
            summary={summary}
            missingIndexes={missing}
            checkedKeys={checkedKeys}
            onPressCitation={citationIndex =>
              navigation.navigate('CitationSource', { draftId, citationIndex })
            }
            onPressUnlinked={unlinkedText =>
              navigation.navigate('CitationSource', { draftId, unlinkedText })
            }
          />
        ) : null}

        {!editing && exports.length > 0 ? (
          <Card style={styles.files}>
            <Text style={type.subheading}>Saved on this device</Text>
            {exports.map(file => (
              <View key={file.path} style={styles.fileRow}>
                <View style={styles.flex}>
                  <Text style={type.body} numberOfLines={1}>
                    {file.fileName}
                  </Text>
                  <Text style={type.caption}>
                    Exported {formatRelative(file.createdAt)}
                  </Text>
                </View>
                <Button
                  title="Open"
                  icon={FolderOpen}
                  variant="ghost"
                  compact
                  onPress={() => openExport(file)}
                />
                <Button
                  title="Share"
                  icon={Share2}
                  variant="ghost"
                  compact
                  onPress={() => shareExport(file)}
                />
              </View>
            ))}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stack: { gap: spacing.lg },
  meta: { marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.md },
  files: { gap: spacing.sm },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
