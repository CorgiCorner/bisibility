import { opaqueIdentifier } from "@/lib/observation/opaque-identifier";
import type {
  ObservationItemInput,
  ObservationRequestPolicy,
  ObservationScope,
} from "@/lib/observation/types";
import { objectValue } from "@/lib/rank-measurements/recorded-check";

export const WEB_LOCAL_PROOF_VERSION = 1;
export const positiveOrdinal = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
export const nonempty = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
export const object = objectValue;
export function identifier(value: unknown) {
  const parsed = opaqueIdentifier(value);
  return { value: parsed, invalid: value !== null && value !== undefined && parsed === null };
}
export type PackExtraction = { items: ObservationItemInput[]; identityIssues: number };
export type SentWebScope = {
  scope: ObservationScope;
  locationCode?: number | null;
  wireLocation?: string;
};
export type SentWebPage = SentWebScope & { engine: "google"; start: number };
/** The caller supplies the actual sent/resolved parameters, not original requested settings. */
export function dataForSeoEffectiveScope(
  sent: SentWebScope | undefined,
  results: readonly unknown[],
) {
  if (!sent) return null;
  for (const value of results) {
    const row = object(value);
    if (
      !row ||
      (row.language_code !== undefined && row.language_code !== sent.scope.language) ||
      (row.device !== undefined && row.device !== sent.scope.device) ||
      (row.location_code !== undefined &&
        sent.locationCode != null &&
        row.location_code !== sent.locationCode) ||
      (row.location_name !== undefined && row.location_name !== sent.scope.location)
    )
      return null;
  }
  return { ...sent.scope };
}
/** No requested depth, item count or organic end-of-results can certify a whole local pack. */
export function localProofPolicy(
  policy: ObservationRequestPolicy & {
    evidence: NonNullable<ObservationRequestPolicy["evidence"]>;
  },
  identityIssues: number,
  scopeSource: "sent_request" | "provider_echo" | null,
): ObservationRequestPolicy & { evidence: NonNullable<ObservationRequestPolicy["evidence"]> } {
  return {
    ...policy,
    evidence: {
      ...policy.evidence,
      completeThrough: { ...policy.evidence.completeThrough, local_pack: null },
      webLocalPack: {
        version: WEB_LOCAL_PROOF_VERSION,
        identityIssues,
        scopeSource,
        completeness: "unknown" as const,
      },
    },
  };
}

function pageStart(value: unknown): number | null {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed % 10 === 0
    ? parsed
    : null;
}
/** Validate explicit response provenance before interpreting a Google web block or used-location echo. */
export function serpApiWebPageProof(page: unknown, actual?: SentWebPage) {
  const params = object(object(page)?.search_parameters);
  if (
    (params?.engine !== undefined && params.engine !== "google") ||
    (params?.tbm !== undefined && params.tbm !== null && params.tbm !== "")
  ) {
    return { valid: false, page: null, reason: "surface_conflict" as const };
  }
  if (!actual && params?.engine !== "google")
    return { valid: false, page: null, reason: "surface_unavailable" as const };
  const sentStart = actual ? pageStart(actual.start) : null;
  const echoedStart = params?.start === undefined ? null : pageStart(params.start);
  if (
    (actual && sentStart === null) ||
    (params?.start !== undefined && echoedStart === null) ||
    (sentStart !== null && echoedStart !== null && sentStart !== echoedStart)
  ) {
    return { valid: false, page: null, reason: "page_conflict" as const };
  }
  const start = echoedStart ?? sentStart ?? 0;
  return { valid: true, page: start / 10 + 1, reason: null };
}

/** Returned used-location wins; only a proved alias of the actual sent label maps to canonical naming. */
export function serpApiEffectiveScope(
  pages: readonly unknown[],
  sent: readonly SentWebPage[] = [],
) {
  const values = pages.map((page, index) => {
    const params = object(object(page)?.search_parameters),
      actual = sent[index];
    if (!serpApiWebPageProof(page, actual).valid) return null;
    const used = nonempty(params?.location_used),
      language = nonempty(params?.hl),
      device = nonempty(params?.device);
    if (used && language && device)
      return {
        source: "provider_echo" as const,
        scope: {
          location: actual && used === actual.wireLocation ? actual.scope.location : used,
          language,
          device,
        },
      };
    if (
      !actual ||
      (params?.engine !== undefined && params.engine !== actual.engine) ||
      (language && language !== actual.scope.language) ||
      (device && device !== actual.scope.device) ||
      (used && used !== actual.wireLocation)
    )
      return null;
    return { source: "sent_request" as const, scope: { ...actual.scope } };
  });
  const first = values[0];
  if (
    !first ||
    values.some(
      (value) =>
        !value ||
        value.scope.location !== first.scope.location ||
        value.scope.language !== first.scope.language ||
        value.scope.device !== first.scope.device,
    )
  )
    return { scope: null, source: null };
  return {
    scope: first.scope,
    source: values.every((value) => value?.source === "provider_echo")
      ? ("provider_echo" as const)
      : ("sent_request" as const),
  };
}

/** Numeric handles are rendered through the exact resolved mapping used to build this submitted payload. */
export function dataForSeoSentScope(
  payload: unknown,
  resolved?: { primaryGeoCode: number | null; primaryGeoName: string },
): SentWebScope | undefined {
  const value = object(payload);
  if (!value) return undefined;
  const code = positiveOrdinal(value.location_code);
  if (value.location_code !== undefined && code === null) return undefined;
  const location =
    nonempty(value.location_name) ??
    (code !== null && resolved && code === resolved.primaryGeoCode
      ? resolved.primaryGeoName
      : null);
  const language = nonempty(value.language_code),
    device = nonempty(value.device);
  if (!location || !language || !device) return undefined;
  return { scope: { location, language, device }, locationCode: code };
}
