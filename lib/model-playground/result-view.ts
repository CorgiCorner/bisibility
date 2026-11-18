import type {
  PlaygroundCitedDomain,
  PlaygroundColumn,
  PlaygroundColumnRequest,
  PlaygroundEntity,
} from "@/lib/ai-research/model-playground-view";
import {
  playgroundCitedDomains,
  playgroundColumns,
  playgroundMentions,
  playgroundVerdict,
} from "@/lib/ai-research/model-playground-view";
import { LEGACY_ANSWER_MAX_LENGTH } from "@/lib/ai-research/normalize";
import { csvRow } from "@/lib/ui/csv";
import type {
  ModelColumnResult,
  ModelConsultedSources,
  ModelCostEvidence,
  ModelCostScope,
  ModelEvidenceTotals,
  ModelMoney,
  ModelUsage,
} from "./types";

const providerLabels = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  vercel_ai_gateway: "Vercel AI Gateway",
};
const unknownMoney: ModelMoney = {
  amount: null,
  currency: "USD",
  certainty: "unknown",
  basis: "unknown",
  rateCardVersion: null,
};
export type ResultColumn = {
  id: string;
  label: string;
  modelId: string | null;
  providerId: string | null;
  providerLabel: string | null;
  provenance: "api_response" | null;
  legacySources: PlaygroundCitedDomain[] | null;
  legacyFunding: "byok" | "platform" | null;
  fundingSource?: "byok" | "platform" | null;
  actualProviderId: string | null;
  actualModelId: string | null;
  resolvedWorkspaceId?: string | null;
  workspaceMismatch?: boolean;
  allowedProviders?: readonly string[];
  routingViolation?: ModelColumnResult["routingViolation"];
  state: ModelColumnResult["state"] | "pending";
  answer: string | null;
  observedAt: string | null;
  durationMs: number | null;
  truncation: ModelColumnResult["truncation"];
  legacyExcerpt: boolean;
  citations: ModelColumnResult["citations"];
  citationTotals: ModelEvidenceTotals;
  consultedSources: ModelConsultedSources;
  usage: ModelUsage | null;
  cost: { money: ModelMoney; scope: ModelCostScope | null };
  costEvidence: ModelCostEvidence | null;
};
export type ResultCell =
  | { kind: "unknown" | "not_named" }
  | { kind: "position"; position: number; cited: boolean };
export type ResultMatrixRow = { entity: PlaygroundEntity; cells: ResultCell[] };

/** Projection only: the selected key provider and actual upstream identity stay separate. */
export function projectColumnResult(
  result: ModelColumnResult,
  label = result.column.modelId,
): ResultColumn {
  const evidence = result.costEvidence;
  const reported = evidence?.providerReported;
  const money =
    reported?.money ??
    (result.providerCost.certainty !== "unknown"
      ? result.providerCost
      : (evidence?.localEstimate ?? result.providerCost));
  return {
    id: result.column.columnId,
    label,
    modelId: result.column.modelId,
    providerId: result.column.providerId,
    providerLabel: providerLabels[result.column.providerId],
    provenance:
      result.state === "cancelled" && result.failure === "refused" ? null : "api_response",
    legacySources: null,
    legacyFunding: null,
    fundingSource: result.column.payment.fundingSource,
    actualProviderId: result.actualProviderId,
    actualModelId: result.actualModelId,
    resolvedWorkspaceId: result.resolvedWorkspaceId ?? null,
    workspaceMismatch:
      result.column.settings.workspaceId !== undefined &&
      result.resolvedWorkspaceId != null &&
      result.column.settings.workspaceId !== result.resolvedWorkspaceId,
    allowedProviders: result.column.settings.allowedProviders,
    routingViolation: result.routingViolation,
    state: result.state,
    answer: result.answer,
    observedAt: result.finishedAt,
    durationMs: result.durationMs,
    truncation: { ...result.truncation },
    legacyExcerpt: false,
    citations: result.citations.map((citation) => ({ ...citation })),
    citationTotals: result.citationTotals ?? { total: null, omitted: null },
    consultedSources: result.consultedSources ?? {
      sources: [],
      total: null,
      omitted: null,
      truncated: false,
    },
    usage: result.usage,
    cost: { money, scope: reported?.scope ?? null },
    costEvidence: evidence ?? null,
  };
}

type LegacyContext = Parameters<typeof playgroundCitedDomains>[1] & {
  funding?: "byok" | "platform" | null;
};
const emptyLegacyContext: LegacyContext = {
  competitorDomains: [],
  excludedNames: [],
  overrides: [],
  ownDomain: null,
};

/** Preserve the matched row's truncation signal even below the legacy answer bound. */
export function projectLegacyColumn(
  column: PlaygroundColumn,
  contentTruncated = column.contentTruncated ?? false,
  context: LegacyContext = emptyLegacyContext,
): ResultColumn {
  return {
    id: column.id,
    label: column.label,
    modelId: column.model,
    providerId: null,
    providerLabel: null,
    provenance: null,
    legacySources: column.answer === null ? [] : playgroundCitedDomains([column], context),
    legacyFunding: context.funding ?? null,
    actualProviderId: null,
    actualModelId: null,
    state: column.failed ? "failed" : column.answer === null ? "pending" : "completed",
    answer: column.answer,
    observedAt: column.observedAt,
    durationMs: null,
    truncation: { provider: false, application: contentTruncated, citations: false },
    legacyExcerpt: contentTruncated || (column.answer?.length ?? 0) >= LEGACY_ANSWER_MAX_LENGTH,
    citations: column.citations.map((citation, index) => ({
      ...citation,
      title: citation.title ?? null,
      occurrenceId: `legacy-${index}`,
      sourceId: citation.url,
      start: null,
      end: null,
    })),
    citationTotals: { total: null, omitted: null },
    consultedSources: { sources: [], total: null, omitted: null, truncated: false },
    usage: null,
    cost: { money: unknownMoney, scope: null },
    costEvidence: null,
  };
}
export function hasCompleteAnswer(column: ResultColumn) {
  return (
    column.state === "completed" &&
    column.answer !== null &&
    !column.legacyExcerpt &&
    !Object.values(column.truncation).some(Boolean)
  );
}
export function resultVerdict(column: ResultColumn, entities: readonly PlaygroundEntity[]) {
  return hasCompleteAnswer(column)
    ? playgroundVerdict(
        column.answer ?? "",
        column.citations.map((c) => ({ ...c, title: c.title ?? undefined })),
        entities,
      )
    : { kind: "unknown" as const, position: null, cited: false };
}
export function resultMentions(column: ResultColumn, entities: readonly PlaygroundEntity[]) {
  return playgroundMentions(
    column.answer ?? "",
    column.citations.map((c) => ({ ...c, title: c.title ?? undefined })),
    entities,
  );
}
export function resultMatrix(
  columns: readonly ResultColumn[],
  entities: readonly PlaygroundEntity[],
): ResultMatrixRow[] {
  const mentions = columns.map((column) => resultMentions(column, entities));
  const named = new Set(mentions.flatMap((items) => items.map((item) => item.entity.id)));
  return entities
    .filter((entity) => entity.kind === "project" || named.has(entity.id))
    .map((entity) => ({
      entity,
      cells: columns.map((column, index): ResultCell => {
        if (!hasCompleteAnswer(column)) return { kind: "unknown" };
        const mention = mentions[index].find((item) => item.entity.id === entity.id);
        return mention
          ? { kind: "position", position: mention.position, cited: mention.cited }
          : { kind: "not_named" };
      }),
    }));
}
export function resultMatrixCsv(
  columns: readonly ResultColumn[],
  rows: readonly ResultMatrixRow[],
  cellText: (cell: ResultCell) => string,
) {
  return [
    [
      "Brand",
      "Brand ID",
      "Column ID",
      "Column",
      "Provider",
      "Model",
      "Actual provider",
      "Actual model",
      "Provenance",
      "Result",
    ],
    ...rows.flatMap((row) =>
      columns.map((column, index) => [
        row.entity.label,
        row.entity.id,
        column.id,
        column.label,
        column.providerId,
        column.modelId,
        column.actualProviderId,
        column.actualModelId,
        column.provenance === "api_response" ? "API response" : null,
        cellText(row.cells[index]),
      ]),
    ),
  ]
    .map((row) => csvRow(row))
    .join("\n");
}

export function projectLegacyColumns(
  requested: readonly PlaygroundColumnRequest[],
  rows: readonly {
    answer: string;
    citations: readonly { title: string; url: string }[];
    engine?: string;
    model: string;
    observedAt: string | null;
    contentTruncated?: boolean;
  }[],
  unfinished: boolean,
  context: LegacyContext = emptyLegacyContext,
) {
  return playgroundColumns(requested, rows, unfinished).map((column) =>
    projectLegacyColumn(column, column.contentTruncated, context),
  );
}
