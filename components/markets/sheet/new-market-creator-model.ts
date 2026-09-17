import {
  type MarketPasteIssue,
  MarketPasteValidationError,
  type NewMarketCreateInput,
  parseNewMarketPaste,
} from "@/lib/markets/create-input";
import type { NewMarketSource } from "./NewMarketKeywordMethod";

export function defaults(projectId: string) {
  return {
    canonicalKey: "",
    countryCode: "",
    devices: [],
    kind: "country",
    languageCode: "",
    name: "",
    projectId,
    schedule: null,
  } as const;
}

export function selectedDevice(devices: readonly string[] | undefined) {
  if (devices?.length === 2) return "both";
  return devices?.[0] ?? "";
}

export type MarketPasteError = { issue: MarketPasteIssue | "unknown"; line: number | null };
export type MarketPasteState = { count: number; error: MarketPasteError | null };

export function pasteState(method: NewMarketCreateInput["method"] | undefined): MarketPasteState {
  if (method?.kind !== "paste") return { error: null, count: 0 };
  try {
    return { error: null, count: parseNewMarketPaste(method.text).length };
  } catch (cause) {
    return {
      error:
        cause instanceof MarketPasteValidationError
          ? { issue: cause.issue, line: cause.line }
          : { issue: "unknown", line: null },
      count: 0,
    };
  }
}

export function expectedKeywordCount(
  method: NewMarketCreateInput["method"] | undefined,
  sourceMarkets: readonly NewMarketSource[],
  pasteCount: number,
  devices: readonly string[],
) {
  if (method?.kind === "copy") {
    return (
      (sourceMarkets.find((source) => source.id === method.sourceMarketId)?.keywordCount ?? 0) *
      devices.length
    );
  }
  return method?.kind === "paste" ? pasteCount * devices.length : 0;
}
