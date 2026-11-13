import { type ConversionSource, isConversionSource } from "./types";

export const CONVERSION_SOURCE_PARAM = "conv";

export type ConversionSourceAvailability = {
  connected: boolean;
  hasData: boolean;
  label: string;
  primary: boolean;
  source: ConversionSource;
};

export type ResolvedConversionSource = {
  /** No connected analytics source. Surfaces show Connect, never a zero. */
  connect: boolean;
  options: ConversionSourceAvailability[];
  selected: ConversionSource | null;
  showSwitch: boolean;
};

export const disconnectedConversionSource: ResolvedConversionSource = Object.freeze({
  connect: true,
  options: [],
  selected: null,
  showSwitch: false,
});

type SourceInput = {
  connected: boolean;
  conversions28?: number;
  label: string;
  lastDay: string | null;
  primary: boolean;
  source: ConversionSource;
};

function hasStoredData(source: SourceInput) {
  return source.lastDay != null || (source.conversions28 ?? 0) > 0;
}

/**
 * Requested `conv` when that source is connected, otherwise the primary
 * connected source, otherwise the connected source that actually has rows.
 */
export function resolveConversionSource(input: {
  requested?: string | null;
  sources: readonly SourceInput[];
}): ResolvedConversionSource {
  const options = input.sources
    .filter((source) => source.connected)
    .map((source) => ({
      connected: true,
      hasData: hasStoredData(source),
      label: source.label,
      primary: source.primary,
      source: source.source,
    }));
  if (options.length === 0) return disconnectedConversionSource;
  const requested = isConversionSource(input.requested)
    ? options.find((source) => source.source === input.requested)
    : undefined;
  const primary = options.find((source) => source.primary);
  const withData = options.find((source) => source.hasData);
  const selected =
    requested?.source ??
    (primary?.hasData ? primary.source : undefined) ??
    withData?.source ??
    primary?.source ??
    options[0].source;
  return {
    connect: false,
    options,
    selected,
    showSwitch: options.filter((source) => source.hasData).length > 1,
  };
}
