import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import dagre from '@dagrejs/dagre';

import {
  normalizeArchiveSlugs,
  normalizeMetadataFields,
  parseChatSelectors,
  parseChatSelectorsDetailed,
  type ParsedChatSelectorToken,
  type ParsedChatSelectors,
} from '../../lib/chatSelectors';
import {
  type ChatRequestOptions,
  type GraphDefinition,
  type RAGScopeOptions,
  type ReasoningResult,
} from '../../services/api';
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export type Source = {
  doc_id: string;
  name: string;
  source_number?: number;
  file_id?: number;
  page_number?: number;
  object_name_page?: string;
  snippet?: string;
};

export type Message = {
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  localOnly?: boolean;
  modelUsed?: string;
  citedSources?: Source[];
  error?: string;
  reasoning?: ReasoningResult;
  telemetry?: Record<string, any>;
};

export type FeedbackKind = 'up' | 'down';

export type NodeRuntimeStatus = 'idle' | 'running' | 'completed' | 'failed';

export type NodeRuntimeState = {
  status: NodeRuntimeStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  lastEventType?: string;
  error?: string;
};

export type GraphRenderNode = {
  key: string;
  label: string;
  kind: string;
  level: number;
  x: number;
  y: number;
  width: number;
};

export type GraphEdgePath = {
  source: string;
  target: string;
  condition: string;
  points: Array<{ x: number; y: number }>;
};

export const COMPOSER_TOKEN_PLACEHOLDER_BASE_SPACES = 2;
export const COMPOSER_TOKEN_PLACEHOLDER_MIN_LENGTH = 10;
export const COMPOSER_METADATA_TOKEN_PLACEHOLDER_MIN_LENGTH = 12;
export const LOCAL_SELECTOR_HELP_LIST_LIMIT = 18;

export const DEFAULT_GRAPH_DEFINITION: GraphDefinition = {
  nodes: [
    { key: 'classify_intent', label: 'Classify intent', kind: 'decision' },
    { key: 'search_response', label: 'Search response', kind: 'terminal_branch' },
    { key: 'resolve_scope', label: 'Resolve scope', kind: 'decision' },
    { key: 'classify_question', label: 'Classify question', kind: 'decision' },
    { key: 'resolve_facts', label: 'Resolve facts', kind: 'decision' },
    { key: 'decide_answerability', label: 'Decide answerability', kind: 'decision' },
    { key: 'retrieve_candidates', label: 'Retrieve candidates', kind: 'retrieval' },
    { key: 'fuse_page_evidence', label: 'Fuse page evidence', kind: 'merge' },
    { key: 'maybe_verify_visual', label: 'Maybe verify visual', kind: 'multimodal' },
    { key: 'synthesize_document_answer', label: 'Synthesize answer', kind: 'synthesis' },
    { key: 'persist_turn', label: 'Persist turn', kind: 'persistence' },
  ],
  edges: [
    { source: 'START', target: 'classify_intent', condition: '' },
    { source: 'classify_intent', target: 'search_response', condition: 'route=search' },
    { source: 'classify_intent', target: 'resolve_scope', condition: 'route=document' },
    { source: 'search_response', target: 'persist_turn', condition: '' },
    { source: 'resolve_scope', target: 'classify_question', condition: '' },
    { source: 'classify_question', target: 'resolve_facts', condition: '' },
    { source: 'resolve_facts', target: 'decide_answerability', condition: '' },
    { source: 'decide_answerability', target: 'retrieve_candidates', condition: 'answerability_route!=metadata' },
    { source: 'decide_answerability', target: 'synthesize_document_answer', condition: 'answerability_route=metadata' },
    { source: 'retrieve_candidates', target: 'fuse_page_evidence', condition: '' },
    { source: 'fuse_page_evidence', target: 'maybe_verify_visual', condition: '' },
    { source: 'maybe_verify_visual', target: 'synthesize_document_answer', condition: '' },
    { source: 'synthesize_document_answer', target: 'persist_turn', condition: '' },
    { source: 'persist_turn', target: 'END', condition: '' },
  ],
  start_node: 'classify_intent',
  end_node: 'persist_turn',
};

export type ChatRequestBuildResult = {
  cleanedQuestion: string;
  selectors: ParsedChatSelectors;
  requestOptions: ChatRequestOptions;
  metadataRequestedExplicitly: boolean;
};

export type ComposerSelectorState = {
  metadataMode: 'auto' | 'metadata_first';
  archiveSlugs: string[];
  metadataFields: string[];
  metadataRequestedExplicitly: boolean;
};

export type SelectorSuggestion = {
  id: string;
  label: string;
  description?: string;
  replacement: string;
  group: 'special' | 'files' | 'metadata';
  kind: 'metadata' | 'file' | 'field';
};

export type SelectorSuggestionGroup = {
  key: 'special' | 'files' | 'metadata';
  label: string;
  items: SelectorSuggestion[];
};

export type UserMessageSelectorChipTone = 'metadata' | 'file' | 'field';

export type UserMessageSelectorChip = {
  id: string;
  label: string;
  tone: UserMessageSelectorChipTone;
};

export type UserMessagePresentation = {
  bodyText: string;
  selectorChips: UserMessageSelectorChip[];
  inlineParts: Array<
    | { id: string; type: 'text'; value: string }
    | { id: string; type: 'chip'; chip: UserMessageSelectorChip; token?: ParsedChatSelectorToken }
  >;
};

export type ComposerInlinePart =
  | UserMessagePresentation['inlineParts'][number]
  | { id: string; type: 'caret' };

export function buildChatRequestOptionsFromComposer(
  question: string,
  scopeOptions: RAGScopeOptions | null | undefined,
  composerSelectors: ComposerSelectorState
): ChatRequestBuildResult {
  const parsedSelectors = parseChatSelectors({ question, scopeOptions });
  const metadataRequestedExplicitly =
    composerSelectors.metadataRequestedExplicitly || /(^|[\s,;])@metadata\b/i.test(question);
  const archiveSlugs = normalizeArchiveSlugs([
    ...composerSelectors.archiveSlugs,
    ...parsedSelectors.archiveSlugs,
  ]);
  const metadataFields = normalizeMetadataFields([
    ...composerSelectors.metadataFields,
    ...parsedSelectors.metadataFields,
  ]);
  const metadataMode: 'auto' | 'metadata_first' =
    composerSelectors.metadataRequestedExplicitly ||
    composerSelectors.metadataMode === 'metadata_first' ||
    parsedSelectors.metadataMode === 'metadata_first' ||
    metadataFields.length > 0
      ? 'metadata_first'
      : 'auto';
  const perDocumentRequested = shouldUsePerDocumentSummary(question, archiveSlugs);
  return {
    cleanedQuestion: parsedSelectors.cleanedQuestion,
    selectors: {
      cleanedQuestion: parsedSelectors.cleanedQuestion,
      metadataMode,
      archiveSlugs,
      metadataFields,
    },
    metadataRequestedExplicitly,
    requestOptions: {
      summary_mode: perDocumentRequested ? 'per_document' : 'default',
      ...(perDocumentRequested
        ? {
            candidate_k: 60,
            min_pages_per_selected_doc: 1,
          }
        : {}),
      metadata_mode: metadataMode,
      archive_slugs: archiveSlugs,
      metadata_fields: metadataFields,
    },
  };
}

export function buildEffectiveComposerQuestionText(requestBuild: ChatRequestBuildResult): string {
  const cleanedQuestion = requestBuild.cleanedQuestion.trim();
  if (cleanedQuestion.length >= 3) return cleanedQuestion;

  const archiveSlugs = requestBuild.selectors.archiveSlugs;
  const metadataFields = requestBuild.selectors.metadataFields;
  const metadataRequested = requestBuild.selectors.metadataMode === 'metadata_first';

  if (metadataFields.length > 0 && archiveSlugs.length > 0) {
    return `Metadata: ${metadataFields.slice(0, 2).join(', ')} en ${archiveSlugs.slice(0, 2).join(', ')}`;
  }
  if (metadataFields.length > 0) {
    return `Metadata: ${metadataFields.slice(0, 3).join(', ')}`;
  }
  if (metadataRequested && archiveSlugs.length > 0) {
    return `Metadata de ${archiveSlugs.slice(0, 3).join(', ')}`;
  }
  if (metadataRequested) {
    return 'Consulta de metadata';
  }
  if (archiveSlugs.length > 0) {
    return `Inventario de ${archiveSlugs.slice(0, 3).join(', ')}`;
  }
  return '';
}

export function shouldUsePerDocumentSummary(question: string, archiveSlugs: string[]): boolean {
  if (!archiveSlugs.length) return false;
  const normalized = String(question || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return [
    'por documento',
    'por archivo',
    'cada documento',
    'cada archivo',
    'separa por',
    'agrupa por',
    'compara',
    'comparar',
    'diferencia',
    'diferencias',
    'similitud',
    'similitudes',
    'evidencia',
    'cita',
    'citas',
    'fuente',
    'fuentes',
    'pagina',
    'paginas',
    'page',
    'pages',
    'documentos relevantes',
    'archivos relevantes',
    'which documents',
    'what documents',
    'relevant documents',
  ].some((term) => normalized.includes(term));
}

export function getSelectorSearchContext(value: string, caret: number): { token: string; start: number; end: number } | null {
  const safeValue = String(value || '');
  const safeCaret = Math.max(0, Math.min(Number.isFinite(caret) ? caret : safeValue.length, safeValue.length));
  const uptoCaret = safeValue.slice(0, safeCaret);
  const match = uptoCaret.match(/(^|[\s,;])([@/][^\s,;]*)$/);
  if (!match) return null;
  const token = match[2] || '';
  if (!token) return null;
  return {
    token,
    start: safeCaret - token.length,
    end: safeCaret,
  };
}

export function getSelectorSuggestionMatchRank(value: string, query: string): [number, number, number] {
  const normalizedValue = value.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [0, 0, value.length];
  if (normalizedValue === normalizedQuery) return [0, 0, value.length];
  if (normalizedValue.startsWith(normalizedQuery)) return [1, 0, value.length];
  const wordBoundaryIndex = normalizedValue.indexOf(` ${normalizedQuery}`);
  if (wordBoundaryIndex >= 0) return [2, wordBoundaryIndex, value.length];
  const containsIndex = normalizedValue.indexOf(normalizedQuery);
  if (containsIndex >= 0) return [3, containsIndex, value.length];
  return [4, Number.MAX_SAFE_INTEGER, value.length];
}

export function rankSelectorSuggestionValue(left: string, right: string, query: string): number {
  const leftRank = getSelectorSuggestionMatchRank(left, query);
  const rightRank = getSelectorSuggestionMatchRank(right, query);
  if (leftRank[0] !== rightRank[0]) return leftRank[0] - rightRank[0];
  if (leftRank[1] !== rightRank[1]) return leftRank[1] - rightRank[1];
  if (leftRank[2] !== rightRank[2]) return leftRank[2] - rightRank[2];
  return left.localeCompare(right);
}

export function getSlashSelectorIntent(token: string): {
  showFiles: boolean;
  showMetadata: boolean;
  fileQuery: string;
  fieldQuery: string;
} {
  const normalizedToken = token.toLowerCase();
  if (normalizedToken === '/') {
    return { showFiles: true, showMetadata: true, fileQuery: '', fieldQuery: '' };
  }

  if (normalizedToken.startsWith('/file:')) {
    return {
      showFiles: true,
      showMetadata: false,
      fileQuery: token.slice(6).trim().toLowerCase(),
      fieldQuery: '',
    };
  }

  if (normalizedToken.startsWith('/col:')) {
    return {
      showFiles: false,
      showMetadata: true,
      fileQuery: '',
      fieldQuery: token.slice(5).trim().toLowerCase(),
    };
  }

  const query = token.slice(1).trim().toLowerCase();
  if (['f', 'fi', 'fil', 'file'].includes(query)) {
    return { showFiles: true, showMetadata: false, fileQuery: '', fieldQuery: '' };
  }
  if (['c', 'co', 'col'].includes(query)) {
    return { showFiles: false, showMetadata: true, fileQuery: '', fieldQuery: '' };
  }

  return {
    showFiles: Boolean(query),
    showMetadata: Boolean(query),
    fileQuery: query,
    fieldQuery: query,
  };
}

export function buildSelectorSuggestionGroups(
  input: string,
  caret: number,
  scopeOptions: RAGScopeOptions | null | undefined,
  composerSelectors: ComposerSelectorState,
  composerTokens: ParsedChatSelectorToken[]
): { context: { token: string; start: number; end: number } | null; groups: SelectorSuggestionGroup[] } {
  const context = getSelectorSearchContext(input, caret);
  if (!context) {
    return { context: null, groups: [] };
  }

  const normalizedToken = context.token.toLowerCase();
  const normalizedFiles = Array.isArray(scopeOptions?.files) ? scopeOptions.files : [];
  const normalizedFields = Array.isArray(scopeOptions?.metadata_fields) ? scopeOptions.metadata_fields : [];
  const tokenizedArchiveSlugs = normalizeArchiveSlugs(
    composerTokens.filter((token) => token.kind === 'file').map((token) => token.label)
  );
  const tokenizedMetadataFields = normalizeMetadataFields(
    composerTokens.filter((token) => token.kind === 'field').map((token) => token.label)
  );
  const groups: SelectorSuggestionGroup[] = [];

  if (normalizedToken.startsWith('@')) {
    if ('@metadata'.startsWith(normalizedToken) && !composerSelectors.metadataRequestedExplicitly) {
      groups.push({
        key: 'special',
        label: 'Metadata',
        items: [
          {
            id: 'metadata-mode',
            label: '@metadata',
            description: 'Run metadata first and deepen into documents if needed.',
            replacement: '@metadata ',
            group: 'special',
            kind: 'metadata',
          },
        ],
      });
    }
    return { context, groups };
  }

  if (!normalizedToken.startsWith('/')) {
    return { context, groups: [] };
  }

  const { showFiles, showMetadata, fileQuery, fieldQuery } = getSlashSelectorIntent(context.token);

  if (showFiles) {
    const items = normalizedFiles
      .filter((value) => !tokenizedArchiveSlugs.includes(value))
      .filter((value) => !fileQuery || value.toLowerCase().includes(fileQuery))
      .sort((left, right) => rankSelectorSuggestionValue(left, right, fileQuery))
      .slice(0, 12)
      .map<SelectorSuggestion>((value) => ({
        id: `file-${value}`,
        label: value,
        replacement: `/file:${value} `,
        group: 'files',
        kind: 'file',
      }));
    if (items.length > 0) {
      groups.push({ key: 'files', label: 'Files', items });
    }
  }

  if (showMetadata) {
    const items = normalizedFields
      .filter((value) => !tokenizedMetadataFields.includes(value))
      .filter((value) => !fieldQuery || value.toLowerCase().includes(fieldQuery))
      .map<SelectorSuggestion>((value) => ({
        id: `field-${value}`,
        label: value,
        replacement: `/col:${value} `,
        group: 'metadata',
        kind: 'field',
      }));
    if (items.length > 0) {
      groups.push({ key: 'metadata', label: 'Metadata', items });
    }
  }

  return { context, groups };
}

export function buildSelectorStateFromTelemetry(telemetry?: Record<string, any>): ComposerSelectorState {
  const requestedArchiveSlugs = Array.isArray(telemetry?.requested_archive_slugs)
    ? telemetry.requested_archive_slugs
    : [];
  const requestedMetadataFields = Array.isArray(telemetry?.requested_metadata_fields)
    ? telemetry.requested_metadata_fields
    : [];
  const requestedMetadataMode =
    String(telemetry?.metadata_mode || '').trim().toLowerCase() === 'metadata_first';
  return {
    metadataMode:
      requestedMetadataMode || requestedMetadataFields.length > 0 ? 'metadata_first' : 'auto',
    archiveSlugs: normalizeArchiveSlugs(requestedArchiveSlugs),
    metadataFields: normalizeMetadataFields(requestedMetadataFields),
    metadataRequestedExplicitly: Boolean(telemetry?.metadata_requested_explicitly),
  };
}

export function removeComposerToken(value: string, start: number, end: number): { nextValue: string; nextCaret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsSpace = Boolean(before && after && !/\s$/.test(before) && !/^\s/.test(after));
  const nextValue = `${before}${needsSpace ? ' ' : ''}${after}`.replace(/\s{2,}/g, ' ').trimStart();
  const nextCaret = Math.min(start, nextValue.length);
  return { nextValue, nextCaret };
}

export function replaceComposerToken(
  value: string,
  start: number,
  end: number,
  replacement: string
): { nextValue: string; nextCaret: number } {
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const nextCaret = start + replacement.length;
  return {
    nextValue,
    nextCaret,
  };
}

export function serializeComposerInput(value: string, tokens: ParsedChatSelectorToken[]): string {
  if (tokens.length === 0) return value;
  const ordered = tokens.slice().sort((left, right) => left.start - right.start);
  let cursor = 0;
  let serialized = '';

  for (const token of ordered) {
    serialized += value.slice(cursor, token.start);
    serialized += token.raw;
    cursor = token.end;
  }

  serialized += value.slice(cursor);
  return serialized;
}

export function reconcileComposerTokens(
  previousValue: string,
  nextValue: string,
  tokens: ParsedChatSelectorToken[]
): ParsedChatSelectorToken[] {
  if (tokens.length === 0 || previousValue === nextValue) return tokens;

  let prefixLength = 0;
  while (
    prefixLength < previousValue.length &&
    prefixLength < nextValue.length &&
    previousValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let previousSuffix = previousValue.length;
  let nextSuffix = nextValue.length;
  while (
    previousSuffix > prefixLength &&
    nextSuffix > prefixLength &&
    previousValue[previousSuffix - 1] === nextValue[nextSuffix - 1]
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  const delta = (nextSuffix - prefixLength) - (previousSuffix - prefixLength);

  return tokens
    .flatMap((token) => {
      if (token.end <= prefixLength) {
        return [token];
      }
      if (token.start >= previousSuffix) {
        return [
          {
            ...token,
            start: token.start + delta,
            end: token.end + delta,
          },
        ];
      }
      return [];
    })
    .sort((left, right) => left.start - right.start);
}

export function buildComposerTokenPayload(suggestion: SelectorSuggestion): Pick<ParsedChatSelectorToken, 'kind' | 'label' | 'raw'> {
  if (suggestion.kind === 'metadata') {
    return {
      kind: 'metadata',
      label: 'Metadata',
      raw: '@metadata',
    };
  }
  if (suggestion.kind === 'file') {
    return {
      kind: 'file',
      label: suggestion.label,
      raw: `/file:${suggestion.label}`,
    };
  }
  return {
    kind: 'field',
    label: suggestion.label,
    raw: `/col:${suggestion.label}`,
  };
}

export function insertComposerTokenLabel(
  value: string,
  start: number,
  end: number,
  label: string,
  kind: SelectorSuggestion['kind']
): { nextValue: string; tokenStart: number; tokenEnd: number; nextCaret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsTrailingSpace = after.length === 0 || !/^[\s,.;:!?)]/.test(after);
  const minPlaceholderLength =
    kind === 'metadata'
      ? COMPOSER_METADATA_TOKEN_PLACEHOLDER_MIN_LENGTH
      : COMPOSER_TOKEN_PLACEHOLDER_MIN_LENGTH;
  const placeholderSpaces = ' '.repeat(
    Math.max(COMPOSER_TOKEN_PLACEHOLDER_BASE_SPACES, minPlaceholderLength - label.length)
  );
  const placeholderLabel = `${label}${placeholderSpaces}`;
  const visibleReplacement = `${placeholderLabel}${needsTrailingSpace ? ' ' : ''}`;
  const { nextValue, nextCaret } = replaceComposerToken(value, start, end, visibleReplacement);
  return {
    nextValue,
    tokenStart: before.length,
    tokenEnd: before.length + placeholderLabel.length,
    nextCaret,
  };
}

export function buildSelectorChips(selectorState: ComposerSelectorState): UserMessageSelectorChip[] {
  const selectorChips: UserMessageSelectorChip[] = [];

  if (selectorState.metadataRequestedExplicitly) {
    selectorChips.push({
      id: 'metadata-mode',
      label: 'Metadata',
      tone: 'metadata',
    });
  }

  for (const archiveSlug of selectorState.archiveSlugs) {
    selectorChips.push({
      id: `file-${archiveSlug}`,
      label: archiveSlug,
      tone: 'file',
    });
  }

  for (const metadataField of selectorState.metadataFields) {
    selectorChips.push({
      id: `field-${metadataField}`,
      label: metadataField,
      tone: 'field',
    });
  }

  return selectorChips;
}

export function buildSelectorChipFromToken(token: ParsedChatSelectorToken): UserMessageSelectorChip {
  if (token.kind === 'metadata') {
    return {
      id: 'metadata-mode',
      label: 'Metadata',
      tone: 'metadata',
    };
  }
  if (token.kind === 'file') {
    return {
      id: `file-${token.label}`,
      label: token.label,
      tone: 'file',
    };
  }
  return {
    id: `field-${token.label}`,
    label: token.label,
    tone: 'field',
  };
}

export function buildInlineSelectorParts(
  text: string,
  tokens: ParsedChatSelectorToken[]
): UserMessagePresentation['inlineParts'] {
  if (!tokens.length) {
    return text
      ? [
          {
            id: 'text-0',
            type: 'text',
            value: text,
          },
        ]
      : [];
  }

  const parts: UserMessagePresentation['inlineParts'] = [];
  let cursor = 0;

  tokens
    .slice()
    .sort((left, right) => left.start - right.start)
    .forEach((token, index) => {
      if (token.start > cursor) {
        parts.push({
          id: `text-${cursor}-${index}`,
          type: 'text',
          value: text.slice(cursor, token.start),
        });
      }

      parts.push({
        id: `chip-${token.kind}-${token.start}-${index}`,
        type: 'chip',
        chip: buildSelectorChipFromToken(token),
        token,
      });
      cursor = token.end;
    });

  if (cursor < text.length) {
    parts.push({
      id: `text-${cursor}-tail`,
      type: 'text',
      value: text.slice(cursor),
    });
  }

  return parts;
}

export function buildComposerVisualInlineParts(
  text: string,
  tokens: ParsedChatSelectorToken[],
  caret: number,
  showCaret: boolean
): ComposerInlinePart[] {
  const parts: ComposerInlinePart[] = [];
  const orderedTokens = tokens.slice().sort((left, right) => left.start - right.start);
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  let cursor = 0;
  let caretInserted = false;

  const pushCaret = (id: string) => {
    if (!showCaret || caretInserted) return;
    parts.push({ id, type: 'caret' });
    caretInserted = true;
  };

  const pushText = (start: number, end: number, idSuffix: string) => {
    if (start > end) return;
    if (!showCaret || caretInserted || safeCaret < start || safeCaret > end) {
      if (start < end) {
        parts.push({
          id: `text-${start}-${idSuffix}`,
          type: 'text',
          value: text.slice(start, end),
        });
      }
      return;
    }

    if (start < safeCaret) {
      parts.push({
        id: `text-${start}-${idSuffix}-before-caret`,
        type: 'text',
        value: text.slice(start, safeCaret),
      });
    }

    pushCaret(`caret-${safeCaret}-${idSuffix}`);

    if (safeCaret < end) {
      parts.push({
        id: `text-${safeCaret}-${idSuffix}-after-caret`,
        type: 'text',
        value: text.slice(safeCaret, end),
      });
    }
  };

  orderedTokens.forEach((token, index) => {
    if (token.end <= cursor) return;
    const tokenStart = Math.max(cursor, Math.min(token.start, text.length));
    const tokenEnd = Math.max(tokenStart, Math.min(token.end, text.length));

    if (cursor < tokenStart) {
      pushText(cursor, tokenStart, `${index}`);
    }

    if (showCaret && !caretInserted && safeCaret <= tokenStart) {
      pushCaret(`caret-${safeCaret}-before-chip-${index}`);
    }

    parts.push({
      id: `chip-${token.kind}-${token.start}-${index}`,
      type: 'chip',
      chip: buildSelectorChipFromToken(token),
      token,
    });

    if (showCaret && !caretInserted && safeCaret > tokenStart && safeCaret <= tokenEnd) {
      pushCaret(`caret-${safeCaret}-after-chip-${index}`);
    }

    cursor = tokenEnd;
  });

  if (cursor < text.length || (showCaret && !caretInserted && safeCaret === text.length)) {
    pushText(cursor, text.length, 'tail');
  }

  if (showCaret && !caretInserted) {
    pushCaret(`caret-${safeCaret}-end`);
  }

  return parts;
}

export function buildUserMessagePresentation(
  text: string,
  scopeOptions: RAGScopeOptions | null | undefined,
  telemetry?: Record<string, any>
): UserMessagePresentation {
  const rawText = String(text || '').trim();
  const parsed = parseChatSelectorsDetailed({ question: rawText, scopeOptions });
  const telemetrySelectors = buildSelectorStateFromTelemetry(telemetry);
  const metadataRequestedExplicitly =
    /(^|[\s,;])@metadata\b/i.test(rawText) || telemetrySelectors.metadataRequestedExplicitly;
  const selectorChips = buildSelectorChips({
    metadataMode:
      metadataRequestedExplicitly ||
      parsed.metadataFields.length > 0 ||
      telemetrySelectors.metadataFields.length > 0
        ? 'metadata_first'
        : 'auto',
    archiveSlugs: normalizeArchiveSlugs([
      ...parsed.archiveSlugs,
      ...telemetrySelectors.archiveSlugs,
    ]),
    metadataFields: normalizeMetadataFields([
      ...parsed.metadataFields,
      ...telemetrySelectors.metadataFields,
    ]),
    metadataRequestedExplicitly,
  });

  for (const archiveSlug of [] as string[]) {
    selectorChips.push({
      id: `file-${archiveSlug}`,
      label: `Archivo · ${archiveSlug}`,
      tone: 'file',
    });
  }

  for (const metadataField of [] as string[]) {
    selectorChips.push({
      id: `field-${metadataField}`,
      label: `Columna · ${metadataField}`,
      tone: 'field',
    });
  }

  return {
    bodyText: parsed.cleanedQuestion.trim() || rawText,
    selectorChips,
    inlineParts: buildInlineSelectorParts(rawText, parsed.tokens),
  };
}

export function getUserMessageChipClassName(_tone: UserMessageSelectorChipTone): string {
  return 'border-white/15 bg-white/10 text-white/95';
}

export function getComposerChipClassName(_tone: UserMessageSelectorChipTone): string {
  return 'composer-token-chip border-gray-200 bg-white text-oracle-dark-gray';
}

export function getInlineChipClassName(baseClassName: string): string {
  return `inline-flex h-4 max-w-[18rem] items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0 text-[10px] font-medium leading-none sm:max-w-[22rem] ${baseClassName}`;
}

export function SelectorChipIcon({ tone }: { tone: UserMessageSelectorChipTone }) {
  switch (tone) {
    case 'metadata':
      return (
        <svg
          aria-hidden="true"
          className="h-3 w-3 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 4.5h11" />
          <path d="M4.5 8h7" />
          <path d="M6 11.5h4" />
        </svg>
      );
    case 'file':
      return (
        <svg
          aria-hidden="true"
          className="h-3 w-3 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 2.5h4l2.5 2.5v7.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
          <path d="M9 2.5v2.5h2.5" />
        </svg>
      );
    case 'field':
      return (
        <svg
          aria-hidden="true"
          className="h-3 w-3 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 3.5h11v9h-11z" />
          <path d="M7.75 3.5v9" />
        </svg>
      );
    default:
      return null;
  }
}

export function stripInlineSourcesSection(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const cleanedLines = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^\**\s*(sources?|fuentes?|citations?)\s*:?\**\s*$/i.test(trimmed)) return false;
      if (/^[-*]\s*\**\s*(source|fuente)\b/i.test(trimmed)) return false;
      return true;
    });
  return stripInlineCitationMarkers(cleanedLines.join('\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripInlineCitationMarkers(value: string): string {
  return String(value || '')
    .replace(/(^|[\s(])\[(?:\d{1,3})(?:\s*,\s*\d{1,3})*\](?=([\s).,;:]|$))/g, '$1')
    .replace(/[ \t]+([.,;:])/g, '$1');
}

export const MARKDOWN_TABLE_PATTERN = /(^|\n)\|.+\|\n\|(?:\s*:?-+:?\s*\|)+/m;

export function messageContainsMarkdownTable(value: string): boolean {
  return MARKDOWN_TABLE_PATTERN.test(String(value || ''));
}

export function ChatMarkdownTable({ children }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="chat-markdown-table-scroll not-prose my-3 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-max min-w-full table-auto border-collapse text-left text-xs text-oracle-dark-gray [&_tbody_tr:nth-child(even)]:bg-gray-50/60">
        {children}
      </table>
    </div>
  );
}

export function ChatMarkdownThead({ children }: ComponentPropsWithoutRef<'thead'>) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function ChatMarkdownTh({ children }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th className="border-b border-gray-200 px-4 py-3 align-top text-left text-[11px] font-semibold uppercase tracking-wide text-oracle-dark-gray whitespace-nowrap">
      {children}
    </th>
  );
}

export function ChatMarkdownTd({ children }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td className="min-w-[7rem] max-w-[28rem] border-t border-gray-100 px-4 py-3 align-top leading-5 whitespace-normal break-words text-oracle-medium-gray">
      {children}
    </td>
  );
}

export function ChatMarkdownH2({ children }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2 className="mt-3 border-b border-gray-200 pb-1 text-[15px] font-semibold leading-6 text-oracle-dark-gray first:mt-0">
      {children}
    </h2>
  );
}

export function ChatMarkdownH3({ children }: ComponentPropsWithoutRef<'h3'>) {
  return <h3 className="mt-2 text-sm font-semibold leading-5 text-oracle-dark-gray">{children}</h3>;
}

export function ChatMarkdownP({ children }: ComponentPropsWithoutRef<'p'>) {
  return <p className="my-1.5 leading-6 text-oracle-dark-gray">{children}</p>;
}

export function ChatMarkdownUl({ children }: ComponentPropsWithoutRef<'ul'>) {
  return <ul className="my-2 space-y-1.5 pl-5 leading-6 marker:text-oracle-red">{children}</ul>;
}

export function ChatMarkdownOl({ children }: ComponentPropsWithoutRef<'ol'>) {
  return <ol className="my-2 space-y-2 pl-5 leading-6 marker:font-semibold marker:text-oracle-red">{children}</ol>;
}

export function ChatMarkdownLi({ children }: ComponentPropsWithoutRef<'li'>) {
  return <li className="pl-1 leading-6 text-oracle-dark-gray">{children}</li>;
}

export function ChatMarkdownStrong({ children }: ComponentPropsWithoutRef<'strong'>) {
  return <strong className="font-semibold text-oracle-dark-gray">{children}</strong>;
}

export function ChatMarkdownCode({ children }: ComponentPropsWithoutRef<'code'>) {
  return (
    <code className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[0.82em] text-oracle-dark-gray">
      {children}
    </code>
  );
}

export const CHAT_MARKDOWN_COMPONENTS = {
  h2: ChatMarkdownH2,
  h3: ChatMarkdownH3,
  p: ChatMarkdownP,
  ul: ChatMarkdownUl,
  ol: ChatMarkdownOl,
  li: ChatMarkdownLi,
  strong: ChatMarkdownStrong,
  code: ChatMarkdownCode,
  table: ChatMarkdownTable,
  thead: ChatMarkdownThead,
  th: ChatMarkdownTh,
  td: ChatMarkdownTd,
};

export const SOURCE_HIGHLIGHT_STOPWORDS = new Set([
  'ante',
  'aqui',
  'cada',
  'como',
  'con',
  'cual',
  'cuales',
  'cuando',
  'del',
  'desde',
  'donde',
  'esta',
  'este',
  'esto',
  'estos',
  'para',
  'pero',
  'porque',
  'segun',
  'sobre',
  'tambien',
  'the',
  'that',
  'this',
  'with',
]);

export function extractDocumentPageMarkdown(markdown: string, pageNumber: number): string {
  const content = String(markdown || '');
  const normalizedPage = Math.max(1, Math.floor(Number(pageNumber) || 1));
  const headingRegex = /^##\s+Page\s+(\d+)\s*$/gim;
  const matches = Array.from(content.matchAll(headingRegex));
  if (matches.length === 0) return content.trim();

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const currentPage = Number(current[1]);
    if (currentPage !== normalizedPage || current.index === undefined) continue;
    const sectionStart = current.index + current[0].length;
    const sectionEnd = next?.index ?? content.length;
    return content.slice(sectionStart, sectionEnd).trim();
  }
  return '';
}

export function cleanPageMarkdownForPreview(markdown: string): string {
  return String(markdown || '')
    .replace(/<\s*!?-{2,}\s*images?\s*-{2,}\s*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildSourceHighlightTerms(snippet: string): string[] {
  const text = String(snippet || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];

  const seen = new Set<string>();
  const terms: string[] = [];
  const words = text.match(/[\p{L}\p{N}]{4,}/gu) || [];
  for (const word of words) {
    const normalized = word.toLocaleLowerCase();
    if (SOURCE_HIGHLIGHT_STOPWORDS.has(normalized) || /^\d+$/.test(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    terms.push(word);
    if (terms.length >= 18) break;
  }
  return terms.sort((left, right) => right.length - left.length);
}

export function escapeRegExp(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(value: string, highlightTerms: string[]): ReactNode {
  if (!highlightTerms.length) return value;
  const pattern = highlightTerms.map(escapeRegExp).filter(Boolean).join('|');
  if (!pattern) return value;
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = String(value).split(regex);
  return parts.map((part, index) => {
    if (!part) return null;
    const isMatch = highlightTerms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase());
    if (!isMatch) return part;
    return (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-yellow-200 px-0.5 text-oracle-dark-gray ring-1 ring-yellow-300"
      >
        {part}
      </mark>
    );
  });
}

export function highlightInlineChildren(children: ReactNode, highlightTerms: string[]): ReactNode {
  if (!highlightTerms.length) return children;
  if (typeof children === 'string' || typeof children === 'number') {
    return highlightText(String(children), highlightTerms);
  }
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <span key={index}>{highlightInlineChildren(child, highlightTerms)}</span>
    ));
  }
  if (isValidElement(children)) {
    const element = children as ReactElement<{ children?: ReactNode }>;
    return cloneElement(element, undefined, highlightInlineChildren(element.props.children, highlightTerms));
  }
  return children;
}

export function buildSourcePreviewMarkdownComponents(highlightTerms: string[]) {
  const highlight = (children: ReactNode) => highlightInlineChildren(children, highlightTerms);
  return {
    h2: ({ children }: ComponentPropsWithoutRef<'h2'>) => (
      <h2 className="mt-3 border-b border-gray-200 pb-1 text-base font-semibold leading-6 text-oracle-dark-gray first:mt-0">
        {highlight(children)}
      </h2>
    ),
    h3: ({ children }: ComponentPropsWithoutRef<'h3'>) => (
      <h3 className="mt-2 text-sm font-semibold leading-5 text-oracle-dark-gray">{highlight(children)}</h3>
    ),
    p: ({ children }: ComponentPropsWithoutRef<'p'>) => (
      <p className="my-1.5 text-[13px] leading-6 text-oracle-dark-gray">{highlight(children)}</p>
    ),
    ul: ({ children }: ComponentPropsWithoutRef<'ul'>) => (
      <ul className="my-2 space-y-1.5 pl-5 leading-6 marker:text-oracle-red">{children}</ul>
    ),
    ol: ({ children }: ComponentPropsWithoutRef<'ol'>) => (
      <ol className="my-2 space-y-2 pl-5 leading-6 marker:font-semibold marker:text-oracle-red">{children}</ol>
    ),
    li: ({ children }: ComponentPropsWithoutRef<'li'>) => (
      <li className="pl-1 leading-6 text-oracle-dark-gray">{highlight(children)}</li>
    ),
    strong: ({ children }: ComponentPropsWithoutRef<'strong'>) => (
      <strong className="font-semibold text-oracle-dark-gray">{highlight(children)}</strong>
    ),
    code: ({ children }: ComponentPropsWithoutRef<'code'>) => (
      <code className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[0.82em] text-oracle-dark-gray">
        {highlight(children)}
      </code>
    ),
    table: ChatMarkdownTable,
    thead: ChatMarkdownThead,
    th: ({ children }: ComponentPropsWithoutRef<'th'>) => (
      <th className="border-b border-gray-200 px-4 py-3 align-top text-left text-[11px] font-semibold uppercase tracking-wide text-oracle-dark-gray whitespace-nowrap">
        {highlight(children)}
      </th>
    ),
    td: ({ children }: ComponentPropsWithoutRef<'td'>) => (
      <td className="border-t border-gray-100 px-4 py-3 align-top leading-5 whitespace-normal break-words text-oracle-medium-gray">
        {highlight(children)}
      </td>
    ),
  };
}

export function buildMessageMergeSignature(message: Message): string {
  const normalizedText = String(message.text || '').trim().replace(/\s+/g, ' ');
  return `${message.role}::${normalizedText}`;
}

export function mergeLoadedConversationMessages(loaded: Message[], optimistic: Message[]): Message[] {
  if (optimistic.length === 0) {
    return loaded;
  }

  const loadedSignatures = new Set(loaded.map(buildMessageMergeSignature));
  const missingOptimisticMessages = optimistic.filter((message) => {
    if (!String(message.messageId || '').startsWith('local-')) {
      return false;
    }
    return !loadedSignatures.has(buildMessageMergeSignature(message));
  });

  if (missingOptimisticMessages.length === 0) {
    return loaded;
  }

  return [...loaded, ...missingOptimisticMessages].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime()
  );
}

export function formatJsonForDisplay(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractNodeResponseText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const obj = value as Record<string, any>;
  const candidates = [
    obj.answer_text,
    obj.response_text,
    obj.answer?.answer_text,
    obj.answer?.text,
    obj.result?.answer_text,
    obj.result?.answer?.answer_text,
    obj.final_response?.answer,
    obj.final_response?.answer_text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

export const NODE_HEIGHT = 48;
export const NODE_WIDTH_MIN = 100;
export const NODE_WIDTH_MAX = 260;
export const CHAR_WIDTH_APPROX = 8;
export const NODE_PADDING_X = 24;

export function computeNodeWidth(label: string, key: string): number {
  const maxLen = Math.max(label.length, key.length);
  const contentWidth = maxLen * CHAR_WIDTH_APPROX;
  const total = NODE_PADDING_X * 2 + contentWidth;
  return Math.max(NODE_WIDTH_MIN, Math.min(NODE_WIDTH_MAX, total));
}

export function buildGraphWithDagre(
  baseNodes: GraphDefinition['nodes'],
  baseEdges: GraphDefinition['edges']
): { nodes: GraphRenderNode[]; edgePaths: GraphEdgePath[] } {
  const startNode = { key: 'START', label: 'START', kind: 'terminal' };
  const endNode = { key: 'END', label: 'END', kind: 'terminal' };
  const mergedNodes = [startNode, ...baseNodes, endNode];
  const nodeByKey = new Map<string, { key: string; label: string; kind: string }>();
  for (const node of mergedNodes) {
    nodeByKey.set(node.key, node);
  }
  const edges = baseEdges.filter((e) => nodeByKey.has(e.source) && nodeByKey.has(e.target));

  const g = new dagre.graphlib.Graph({ compound: false });
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({ points: [] }));

  for (const node of mergedNodes) {
    const w = computeNodeWidth(node.label, node.key);
    g.setNode(node.key, { width: w, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {});
  }

  dagre.layout(g);

  const nodes: GraphRenderNode[] = [];
  for (const key of g.nodes()) {
    const n = g.node(key);
    const meta = nodeByKey.get(key);
    if (!n || !meta) continue;
    const w = (n as { width?: number }).width ?? computeNodeWidth(meta.label, meta.key);
    nodes.push({
      key: meta.key,
      label: meta.label,
      kind: meta.kind,
      level: (n as { rank?: number }).rank ?? 0,
      x: n.x,
      y: n.y,
      width: w,
    });
  }

  const edgePaths: GraphEdgePath[] = [];
  for (const edge of edges) {
    const e = g.edge(edge.source, edge.target);
    const points = e?.points as Array<{ x: number; y: number }> | undefined;
    if (points && points.length >= 2) {
      edgePaths.push({
        source: edge.source,
        target: edge.target,
        condition: edge.condition || '',
        points,
      });
    } else {
      const src = g.node(edge.source);
      const tgt = g.node(edge.target);
      if (src && tgt) {
        edgePaths.push({
          source: edge.source,
          target: edge.target,
          condition: edge.condition || '',
          points: [
            { x: src.x, y: src.y + NODE_HEIGHT / 2 },
            { x: tgt.x, y: tgt.y - NODE_HEIGHT / 2 },
          ],
        });
      }
    }
  }

  return { nodes, edgePaths };
}

export function mapSourcesFromArray(sourceItems: Array<Record<string, any>>): Source[] {
  return sourceItems.map((item: Record<string, any>, index: number) => {
    const sourceNumber = Number(item?.source_number ?? 0);
    const pageNumber = Number(item?.page_number ?? 0);
    const fileName = String(item?.file_name || item?.name || 'document').trim();
    const snippet = String(item?.snippet || '').trim();
    return {
      doc_id: String(sourceNumber || index + 1),
      name: `${fileName} - page ${pageNumber || '?'}`,
      source_number: sourceNumber || undefined,
      file_id: Number(item?.file_id ?? 0) || undefined,
      page_number: pageNumber || undefined,
      object_name_page: String(item?.object_name_page ?? ''),
      snippet: snippet || undefined,
    };
  });
}

export function mapSourcesByMetadataKey(metadata: Record<string, any>, key: string): Source[] {
  const sourceItems = Array.isArray(metadata?.[key]) ? (metadata[key] as Array<Record<string, any>>) : [];
  if (sourceItems.length === 0) return [];
  return mapSourcesFromArray(sourceItems);
}

export function mapCitedSourcesFromMetadata(metadata: Record<string, any>): Source[] {
  return mapSourcesByMetadataKey(metadata, 'cited_sources');
}

export function mapReasoningFromMetadata(metadata: Record<string, any>): ReasoningResult | undefined {
  const strategy = String(metadata?.strategy || '').trim();
  const answerMode = String(metadata?.answer_mode || '').trim();
  const visualConfirmationUsed = Boolean(metadata?.visual_confirmation_used);
  const analyzedPages = Array.isArray(metadata?.analyzed_pages)
    ? metadata.analyzed_pages
        .map((value: unknown) => Number(value))
        .filter((value: number) => !Number.isNaN(value))
    : [];
  const confidenceNotes = Array.isArray(metadata?.confidence_notes)
    ? metadata.confidence_notes
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => Boolean(value))
    : [];
  if (!strategy && !answerMode && !visualConfirmationUsed && analyzedPages.length === 0 && confidenceNotes.length === 0) {
    return undefined;
  }
  return {
    strategy,
    answer_mode: answerMode,
    visual_confirmation_used: visualConfirmationUsed,
    analyzed_pages: analyzedPages,
    confidence_notes: confidenceNotes,
  };
}

export function formatInferredScopeLabel(telemetry?: Record<string, any>): string {
  if (!telemetry || typeof telemetry !== 'object') return '';
  const origin = String(telemetry.scope_origin || '').trim().toLowerCase();
  if (origin !== 'inferred') return '';
  const codes = Array.isArray(telemetry.scope_document_codes)
    ? telemetry.scope_document_codes
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => Boolean(value))
    : [];
  if (codes.length === 0) return '';
  const scopeCount = Number(telemetry.resolved_scope_file_count ?? 0) || 0;
  const suffix = scopeCount > 0 ? ` (${scopeCount} docs)` : '';
  return `Scope inferred: ${codes.join(', ')}${suffix}`;
}

export type LocalComposerCommandKind = 'files' | 'metadata';

export function resolveLocalComposerCommand(value: string): LocalComposerCommandKind | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (['/', '/f', '/fi', '/fil', '/file', '/files'].includes(normalized)) {
    return 'files';
  }
  if (['@', '@m', '@me', '@met', '@meta', '@metad', '@metada', '@metadat', '@metadata'].includes(normalized)) {
    return 'metadata';
  }
  if (['/c', '/co', '/col', '/cols', '/field', '/fields'].includes(normalized)) {
    return 'metadata';
  }
  return null;
}

export function formatLocalSelectorHelpList(values: string[], emptyMessage: string): string {
  const normalizedValues = values
    .map((value) => String(value || '').trim())
    .filter((value) => Boolean(value));
  if (normalizedValues.length === 0) {
    return emptyMessage;
  }
  const visibleValues = normalizedValues.slice(0, LOCAL_SELECTOR_HELP_LIST_LIMIT);
  const lines = visibleValues.map((value) => `- \`${value}\``);
  if (normalizedValues.length > visibleValues.length) {
    lines.push(`- ... and ${normalizedValues.length - visibleValues.length} more`);
  }
  return lines.join('\n');
}

export function buildLocalComposerCommandMessages(
  rawInput: string,
  scopeOptions: RAGScopeOptions | null | undefined
): { userText: string; assistantText: string } | null {
  const userText = String(rawInput || '').trim();
  const command = resolveLocalComposerCommand(userText);
  if (!command) return null;

  if (command === 'files') {
    const files = normalizeArchiveSlugs(scopeOptions?.files || []);
    return {
      userText,
      assistantText: [
        'Available documents:',
        '',
        formatLocalSelectorHelpList(files, 'No documents are available yet.'),
        '',
        'Use `/file:DOCUMENT_NAME` at the start of your question to place the tag before the text.',
        'Example: `/file:RM797_ID_5515 summarize the contract rent`',
        '',
        'You can also type `@metadata` to inspect metadata fields first.',
      ].join('\n'),
    };
  }

  const metadataFields = normalizeMetadataFields(scopeOptions?.metadata_fields || []);
  return {
    userText,
    assistantText: [
      'Available metadata fields:',
      '',
      formatLocalSelectorHelpList(metadataFields, 'No metadata fields are available yet.'),
      '',
      'Use `@metadata` to prioritize metadata and add `/col:FIELD_NAME` before your question.',
      'Example: `@metadata /col:Región list the available regions`',
      '',
      'You can type `/files` to list the accessible documents.',
    ].join('\n'),
  };
}
