import { observationEvidencePolicy } from "@/lib/observation/evidence-metadata";
import { serpApiCapturedMetadata } from "@/lib/observation/provider-metadata";
import type {
  ObservationCompleteness,
  ObservationItemInput,
  ObservationRequestPolicy,
  ObservationRunInput,
  ObservationScope,
} from "@/lib/observation/types";
import { SERPAPI_OBSERVATION_ADAPTER_VERSION } from "./observation-adapter-versions";
import { serpApiLocalPack } from "./serpapi-local-pack";
import { localProofPolicy, type SentWebPage, serpApiEffectiveScope } from "./web-local-proof";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstTextBlockTitle(values: readonly unknown[]) {
  for (const value of values) {
    const block = record(value);
    const title = block ? (text(block.snippet) ?? text(block.title)) : null;
    if (title) return title;
  }
  return null;
}

function aiOverviewItem(item: RecordValue): ObservationItemInput {
  const textBlocks = Array.isArray(item.text_blocks) ? item.text_blocks : [];
  return {
    blockPosition: null,
    businessName: null,
    cid: null,
    domain: null,
    mapsUrl: null,
    placeId: null,
    positionInBlock: 1,
    rankAbsolute: null,
    rankGroup: null,
    rating: null,
    rawFragment: item,
    resultKind: "ai_overview",
    title: firstTextBlockTitle(textBlocks),
    url: null,
  };
}

export function serpApiObservationRun(input: {
  pages: readonly unknown[];
  sentPages?: readonly SentWebPage[];
  requestPolicy: ObservationRequestPolicy;
  completeness: ObservationCompleteness;
  configuredScope: ObservationScope;
  effectiveScope?: ObservationScope | null;
  executedAt: Date;
}): ObservationRunInput {
  const items: ObservationItemInput[] = [];
  const captured = serpApiCapturedMetadata(input.pages);
  const local = serpApiLocalPack(input.pages, input.sentPages);
  const actual = serpApiEffectiveScope(input.pages, input.sentPages);
  const policy = localProofPolicy(
    observationEvidencePolicy(input.requestPolicy, SERPAPI_OBSERVATION_ADAPTER_VERSION),
    local.identityIssues,
    actual.source,
  );

  for (const [pageIndex, value] of input.pages.entries()) {
    const page = record(value);
    if (!page) continue;
    items.push(
      ...local.items.filter((item) =>
        item.sourceBlockId?.startsWith(`serpapi:response:${pageIndex}:`),
      ),
    );

    const aiOverview = record(page.ai_overview);
    if (aiOverview) items.push(aiOverviewItem(aiOverview));
  }

  // Built field by field: spreading `input` would carry whole SERP pages into the run.
  return {
    completeness: input.completeness,
    configuredScope: input.configuredScope,
    effectiveScope: input.effectiveScope ?? actual.scope,
    engine: "google",
    executedAt: input.executedAt,
    items,
    provider: "serpapi",
    requestPolicy: {
      ...policy,
      evidence: {
        ...policy.evidence,
        observedAt: captured.observedAt,
        observedThrough: captured.observedThrough,
      },
    },
    surface: "web_serp",
  };
}
