import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BookOpen,
  CircleCheck,
  CircleHelp,
  ExternalLink,
  TriangleAlert,
} from 'lucide-react-native';

import { draftsApi } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { CitationSource } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Banner, Card } from '../../components/ui/misc';
import { Screen } from '../../components/ui/Screen';
import { citationKey, citationStatus } from '../../lib/citations';
import { formatDate } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { getEncrypted, setEncrypted } from '../../storage/encryptedStore';
import { getReviewState, updateReviewState } from '../../storage/reviewState';
import { useDraftsStore } from '../../store/draftsStore';
import { colors, documentFont, radius, spacing, type } from '../../theme';

type SourceState =
  | { status: 'loading' }
  | { status: 'loaded'; source: CitationSource }
  | { status: 'missing'; message: string }
  | { status: 'error'; message: string };

const sourceCacheKey = (draftId: string, sourceId: string) =>
  `source:${draftId}:${sourceId}`;

/**
 * Shows the retrieved source text for a citation so the lawyer can verify
 * it. The text comes from the backend's legal database — never from the model.
 */
export function CitationSourceScreen({
  navigation,
  route,
}: RootScreenProps<'CitationSource'>) {
  const { draftId, citationIndex, unlinkedText } = route.params;
  const draft = useDraftsStore(s => s.drafts[draftId]);
  const citation =
    citationIndex !== undefined ? draft?.citations[citationIndex] : undefined;
  const status = citation ? citationStatus(citation) : 'unlinked';
  const key = citationKey(
    citation ?? { source_id: null, text: unlinkedText ?? '' },
  );

  const [source, setSource] = useState<SourceState>({ status: 'loading' });
  const [checked, setChecked] = useState(false);

  const fetchSource = useCallback(async () => {
    const sourceId = citation?.source_id;
    if (!sourceId) {
      return;
    }
    setSource({ status: 'loading' });
    const cacheKey = sourceCacheKey(draftId, sourceId);
    try {
      const fresh = await draftsApi.citationSource(draftId, sourceId);
      setSource({ status: 'loaded', source: fresh });
      setEncrypted(cacheKey, fresh).catch(() => undefined);
    } catch (e) {
      const error = e as ApiError;
      if (error.code === 'NOT_FOUND') {
        setSource({
          status: 'missing',
          message:
            error.serverCode === 'source_not_found'
              ? 'No source exists in the legal database for this citation, so it could not be verified.'
              : error.message,
        });
        return;
      }
      const cached = await getEncrypted<CitationSource>(cacheKey);
      if (cached) {
        setSource({ status: 'loaded', source: cached });
      } else {
        setSource({ status: 'error', message: error.message });
      }
    }
  }, [citation?.source_id, draftId]);

  useEffect(() => {
    fetchSource();
    getReviewState(draftId).then(s =>
      setChecked(s.checkedCitations.includes(key)),
    );
  }, [draftId, fetchSource, key]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: status === 'unlinked' ? 'Unlinked reference' : 'Citation source',
    });
  }, [navigation, status]);

  const toggleChecked = async () => {
    const state = await getReviewState(draftId);
    const next = checked
      ? state.checkedCitations.filter(k => k !== key)
      : [...state.checkedCitations, key];
    await updateReviewState(draftId, { checkedCitations: next });
    setChecked(!checked);
  };

  const cited = citation?.text ?? unlinkedText ?? '';

  return (
    <Screen
      footer={
        <Button
          title={
            checked ? 'Checked by you — undo' : 'I have checked this reference'
          }
          icon={CircleCheck}
          variant={checked ? 'secondary' : 'primary'}
          onPress={toggleChecked}
        />
      }
    >
      <StatusHeader status={status} />

      <Text style={[type.label, styles.section]}>AS CITED IN YOUR DRAFT</Text>
      <Card>
        <Text style={styles.cited}>{cited}</Text>
      </Card>

      {status === 'unlinked' ? (
        <Banner
          tone="error"
          title="No source was retrieved for this reference"
          message="The draft names this authority, but it is not backed by any source the system retrieved, so it has not been verified. Check it in an official source (India Code, the court's website or a law report) before filing, or remove it."
          style={styles.section}
        />
      ) : null}

      {citation?.source_id ? (
        <View style={styles.section}>
          {source.status === 'loading' ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={type.caption}>Fetching source text…</Text>
            </View>
          ) : source.status === 'missing' ? (
            <Banner
              tone="error"
              title="Source not found"
              message={source.message}
            />
          ) : source.status === 'error' ? (
            <Banner
              tone="error"
              message={source.message}
              action={{ label: 'Try again', onPress: fetchSource }}
            />
          ) : (
            <SourceDetails source={source.source} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function StatusHeader({
  status,
}: {
  status: 'verified' | 'unverified' | 'unlinked';
}) {
  const config = {
    verified: {
      icon: CircleCheck,
      fg: colors.citeVerified,
      bg: colors.citeVerifiedBg,
      title: 'Source verified',
      text: 'The system matched this citation to the source below. Read it to confirm it supports your point.',
    },
    unverified: {
      icon: TriangleAlert,
      fg: colors.citeUnverified,
      bg: colors.citeUnverifiedBg,
      title: 'Not verified',
      text: 'The citation does not match a retrieved source. It may be wrong or misquoted — verify it before relying on it.',
    },
    unlinked: {
      icon: CircleHelp,
      fg: colors.citeUnlinked,
      bg: colors.citeUnlinkedBg,
      title: 'No source attached',
      text: 'This reference appears in the draft without any supporting source.',
    },
  }[status];
  const Icon = config.icon;
  return (
    <View style={[styles.status, { backgroundColor: config.bg }]}>
      <Icon size={22} color={config.fg} />
      <View style={styles.flex}>
        <Text style={[styles.statusTitle, { color: config.fg }]}>
          {config.title}
        </Text>
        <Text style={[styles.statusText, { color: config.fg }]}>
          {config.text}
        </Text>
      </View>
    </View>
  );
}

function SourceDetails({ source }: { source: CitationSource }) {
  return (
    <View style={styles.sourceStack}>
      {!source.verified && source.verificationDetail ? (
        <Banner
          tone="warning"
          title="Why it isn't verified"
          message={`${source.verificationDetail}${
            source.claimedSection
              ? `\nThe draft claimed: ${source.claimedSection}`
              : ''
          }`}
        />
      ) : null}

      <Text style={[type.label, styles.sectionLabel]}>
        {source.kind === 'statute' ? 'STATUTE' : 'JUDGMENT'}
      </Text>
      <Card style={styles.sourceCard}>
        <Text style={type.heading}>{source.title}</Text>
        {source.reference ? (
          <Text style={[type.subheading, styles.reference]}>
            {source.reference}
          </Text>
        ) : null}
        {source.court || source.date ? (
          <Text style={type.caption}>
            {[
              source.court,
              source.date && /^\d{4}-\d{2}-\d{2}/.test(source.date)
                ? formatDate(source.date.slice(0, 10))
                : source.date,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}

        <View style={styles.provenance}>
          <BookOpen size={14} color={colors.success} />
          <Text style={styles.provenanceText}>
            Source text from the JurisAI legal database — not written by AI
          </Text>
        </View>
        <Text selectable style={styles.sourceText}>
          {source.text}
        </Text>

        {source.url ? (
          <Button
            title="Open official source"
            icon={ExternalLink}
            variant="ghost"
            compact
            onPress={() => Linking.openURL(source.url!)}
            style={styles.link}
          />
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginTop: spacing.lg },
  sectionLabel: { letterSpacing: 0.6 },
  status: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statusTitle: { fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  cited: {
    fontFamily: documentFont,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  sourceStack: { gap: spacing.sm },
  sourceCard: { gap: spacing.xs },
  reference: { color: colors.textMuted },
  provenance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  provenanceText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
    flex: 1,
  },
  sourceText: {
    fontFamily: documentFont,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  link: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 0,
  },
});
