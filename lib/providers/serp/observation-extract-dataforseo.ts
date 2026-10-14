import { observationEvidencePolicy } from "@/lib/observation/evidence-metadata";
import { dataForSeoCapturedMetadata } from "@/lib/observation/provider-metadata";
import type {
  ObservationCompleteness,
  ObservationItemInput,
  ObservationRequestPolicy,
  ObservationScope,
  WebObservationRunInput,
} from "@/lib/observation/types";
import { dataForSeoLocalPack } from "./dataforseo-local-pack";
import { DATAFORSEO_OBSERVATION_ADAPTER_VERSION } from "./observation-adapter-versions";
import { dataForSeoEffectiveScope, localProofPolicy, type SentWebScope } from "./web-local-proof";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstChildTitle(values: readonly unknown[]) {
  for (const value of values) {
    const child = record(value);
    const title = child ? (text(child.title) ?? text(child.text)) : null;
    if (title) return title;
  }
  return null;
}

function aiOverviewItem(item: RecordValue, position: number | null): ObservationItemInput {
  const children = Array.isArray(item.items) ? item.items : [];
  return {
    blockPosition: position,
    businessName: null,
    cid: null,
    domain: null,
    mapsUrl: null,
    placeId: null,
    positionInBlock: 1,
    rankAbsolute: finite(item.rank_absolute),
    rankGroup: finite(item.rank_group),
    rating: null,
    rawFragment: item,
    resultKind: "ai_overview",
    title: text(item.title) ?? firstChildTitle(children),
    url: null,
  };
}

export function dataForSeoObservationRun(input: {
  providerResults?: readonly unknown[];
  sentScope?: SentWebScope;
  items: readonly unknown[];
  requestPolicy: ObservationRequestPolicy;
  completeness: ObservationCompleteness;
  configuredScope: ObservationScope;
  effectiveScope?: ObservationScope | null;
  executedAt: Date;
}): WebObservationRunInput {
  const items: ObservationItemInput[] = [];
  const captured = dataForSeoCapturedMetadata(input.providerResults ?? []);
  const local = dataForSeoLocalPack(input.items, input.providerResults ?? []);
  const effectiveScope =
    input.effectiveScope ?? dataForSeoEffectiveScope(input.sentScope, input.providerResults ?? []);
  const policy = localProofPolicy(
    observationEvidencePolicy(input.requestPolicy, DATAFORSEO_OBSERVATION_ADAPTER_VERSION),
    local.identityIssues,
    input.sentScope && effectiveScope ? "sent_request" : null,
  );

  for (let index = 0; index < input.items.length; index += 1) {
    const item = record(input.items[index]);
    if (!item || typeof item.type !== "string") continue;

    if (item.type === "organic") continue;
    if (item.type === "local_pack") {
      items.push(...(local.bySourceIndex.get(index) ?? []));
      continue;
    }

    if (item.type === "ai_overview") {
      items.push(aiOverviewItem(item, finite(item.rank_absolute)));
    }
  }

  // Built field by field: spreading `input` would carry the raw provider items into the run.
  return {
    completeness: input.completeness,
    configuredScope: input.configuredScope,
    effectiveScope,
    engine: "google",
    executedAt: input.executedAt,
    items,
    provider: "dataforseo",
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
