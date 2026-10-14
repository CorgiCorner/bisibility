import type { measurementHelpRegistry } from "./registry";

export type HelpCount =
  | "expected"
  | "measured"
  | "metricEligible"
  | "ranked"
  | "knownAbsent"
  | "unknown"
  | "neverChecked"
  | "failed"
  | "stale"
  | "unsupported"
  | "freshDeterminate"
  | "unknownFreshness"
  | "comparable";

export type HelpContext = Readonly<Partial<Record<HelpCount, number | null>>>;
export type HelpEntry = (typeof measurementHelpRegistry)[number];

export type HelpMessageKey =
  | HelpEntry["titleKey" | "shortDefinitionKey" | "interpretationKey" | "limitationKey"]
  | `counts.${HelpCount}`
  | "explain"
  | "close"
  | "glossary"
  | "unknownVersion"
  | "neutralDefinition"
  | "contextLoading"
  | "contextError"
  | "unknownValue";

/** Adapt to the host's existing locale catalog and next-intl formatter. */
export type HelpTranslator = (
  key: HelpMessageKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

export type ResolvedHelp =
  | Readonly<{ status: "invalid_id" | "invalid_version" }>
  | Readonly<{
      status: "supported";
      entry: HelpEntry;
      requestedVersion: string;
      context: HelpContext;
    }>
  | Readonly<{
      status: "unsupported_version";
      entry: Pick<HelpEntry, "metricId" | "kind" | "titleKey" | "glossaryAnchor">;
      requestedVersion: string;
      context: HelpContext;
    }>;
