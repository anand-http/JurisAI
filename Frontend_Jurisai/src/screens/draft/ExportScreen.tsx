import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Download, FolderOpen, Share2 } from 'lucide-react-native';

import type { ExportFormat, PaperSize, ReviewIssue } from '../../api/types';
import { Button } from '../../components/ui/Button';
import {
  Banner,
  Card,
  Checkbox,
  OfflineBanner,
  SegmentedControl,
} from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { env } from '../../config/env';
import { useIsOnline } from '../../hooks/useIsOnline';
import { citationKey, summarizeCitations } from '../../lib/citations';
import { formatRelative } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import {
  exportDraft,
  listExports,
  openExport,
  saveExportToDevice,
  shareExport,
  type LocalExport,
} from '../../services/exportFiles';
import { getReviewState } from '../../storage/reviewState';
import { useDraftsStore } from '../../store/draftsStore';
import { colors, spacing, type } from '../../theme';

export function ExportScreen({ route }: RootScreenProps<'Export'>) {
  const { draftId } = route.params;
  const draft = useDraftsStore(s => s.drafts[draftId]);
  const online = useIsOnline();

  const [format, setFormat] = useState<ExportFormat>('docx');
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [confirmed, setConfirmed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<LocalExport[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      listExports(draftId)
        .then(setFiles)
        .catch(() => undefined);
      getReviewState(draftId).then(s => setCheckedKeys(s.checkedCitations));
    }, [draftId]),
  );

  const summary = useMemo(
    () =>
      draft
        ? summarizeCitations(
            draft.text,
            draft.citations,
            draft.unlinkedMentions,
          )
        : null,
    [draft],
  );
  const reviewable = draft
    ? [
        ...draft.citations.map(c => citationKey(c)),
        ...(summary?.unlinkedTexts ?? []).map(t =>
          citationKey({ source_id: null, text: t }),
        ),
      ]
    : [];
  const checkedCount = reviewable.filter(k => checkedKeys.includes(k)).length;
  const needsAttention = (summary?.unverified ?? 0) + (summary?.unlinked ?? 0);
  // Citations are already counted above; these are the backend's other checks.
  const otherIssues = (draft?.reviewIssues ?? []).filter(
    i => i.type === 'unsupported_fact' || i.type === 'placeholder',
  );

  const runExport = async () => {
    if (!draft) {
      return;
    }
    setExporting(true);
    setError(null);
    try {
      // The button is only enabled once "I have reviewed this draft" is ticked.
      const file = await exportDraft(
        draftId,
        draft.title,
        format,
        paperSize,
        confirmed,
      );
      setFiles(f => [file, ...f.filter(x => x.path !== file.path)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const save = async (file: LocalExport) => {
    try {
      const where = await saveExportToDevice(file);
      if (where) {
        Alert.alert('Saved', where);
      }
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    }
  };

  if (!draft || !summary) {
    return null;
  }

  return (
    <Screen
      footer={
        <Button
          title={`Export ${format.toUpperCase()}`}
          icon={Download}
          onPress={runExport}
          loading={exporting}
          disabled={!confirmed || !online}
        />
      }
    >
      {!online ? (
        <OfflineBanner message="Exporting needs a connection. Files saved earlier are below." />
      ) : null}

      <Text style={type.title}>Export for filing</Text>
      <Text style={[type.body, styles.subtitle]}>{draft.title}</Text>

      <Text style={[type.label, styles.label]}>FORMAT</Text>
      {env.features.pdfExport ? (
        <>
          <SegmentedControl
            options={[
              { value: 'docx', label: 'Word (.docx)' },
              { value: 'pdf', label: 'PDF' },
            ]}
            value={format}
            onChange={setFormat}
          />
          <Text style={[type.label, styles.label]}>PAPER SIZE</Text>
          <SegmentedControl
            options={[
              { value: 'A4', label: 'A4' },
              { value: 'LEGAL', label: 'Legal' },
            ]}
            value={paperSize}
            onChange={setPaperSize}
          />
        </>
      ) : (
        <Text style={type.body}>Word (.docx), court format</Text>
      )}
      <Text style={[type.caption, styles.hint]}>
        Formatted for Indian court filing: Times New Roman, 1.5 line spacing,
        wide left margin for binding, page numbers.
      </Text>

      <Card style={styles.checklist}>
        <Text style={type.subheading}>Before you file</Text>
        <Text style={type.body}>
          {summary.verified} verified · {summary.unverified} not verified ·{' '}
          {summary.unlinked} without a source
        </Text>
        <Text style={type.caption}>
          You have checked {checkedCount} of {reviewable.length} references.
        </Text>
        {needsAttention > 0 ? (
          <Banner
            tone="warning"
            message={`${needsAttention} reference${
              needsAttention === 1 ? '' : 's'
            } could not be verified. Check or remove ${
              needsAttention === 1 ? 'it' : 'them'
            } before filing.`}
          />
        ) : null}
        {otherIssues.length > 0 ? (
          <View style={styles.issues}>
            <Text style={type.subheading}>Also check</Text>
            {otherIssues.slice(0, MAX_LISTED_ISSUES).map((issue, i) => (
              <Text key={i} style={type.caption}>
                • {describeIssue(issue)}
              </Text>
            ))}
            {otherIssues.length > MAX_LISTED_ISSUES ? (
              <Text style={type.caption}>
                …and {otherIssues.length - MAX_LISTED_ISSUES} more
              </Text>
            ) : null}
          </View>
        ) : null}
        <Checkbox
          checked={confirmed}
          onChange={setConfirmed}
          label="I have reviewed this draft, including every citation, and take responsibility for its contents."
        />
      </Card>

      {error ? (
        <Banner tone="error" message={error} style={styles.gap} />
      ) : null}

      {files.length > 0 ? (
        <View style={styles.gap}>
          <Text style={[type.label, styles.label]}>FILES ON THIS DEVICE</Text>
          {files.map(file => (
            <Card key={file.path} style={styles.file}>
              <Text style={type.subheading} numberOfLines={1}>
                {file.fileName}
              </Text>
              <Text style={type.caption}>
                {file.format.toUpperCase()} · exported{' '}
                {formatRelative(file.createdAt)} · available offline
              </Text>
              <View style={styles.fileActions}>
                <Button
                  title="Share"
                  icon={Share2}
                  variant="secondary"
                  compact
                  onPress={() => shareExport(file).catch(() => undefined)}
                  style={styles.flex}
                />
                <Button
                  title="Save"
                  icon={Download}
                  variant="secondary"
                  compact
                  onPress={() => save(file)}
                  style={styles.flex}
                />
                <Button
                  title="Open"
                  icon={FolderOpen}
                  variant="secondary"
                  compact
                  onPress={() => openExport(file).catch(() => undefined)}
                  style={styles.flex}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const MAX_LISTED_ISSUES = 8;

const FACT_LABELS = {
  date: 'Date',
  amount: 'Amount',
  number: 'Number',
  name: 'Name',
} as const;

function describeIssue(issue: ReviewIssue): string {
  switch (issue.type) {
    case 'unsupported_fact':
      return `${FACT_LABELS[issue.kind]} “${issue.text}” is not in your intake answers. Confirm it is correct.`;
    case 'placeholder':
      return `Fill in the blank ${issue.text}`;
    default:
      return issue.text;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  issues: { gap: spacing.xs },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
  label: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    letterSpacing: 0.6,
  },
  hint: { marginTop: spacing.sm },
  checklist: { marginTop: spacing.xl, gap: spacing.sm },
  gap: { marginTop: spacing.lg },
  file: { gap: spacing.xs, marginBottom: spacing.sm },
  fileActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
