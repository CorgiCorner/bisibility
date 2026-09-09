import { type NewMarketCreateInput, parseNewMarketPaste } from "@/lib/markets/create-input";
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

export const deviceOptions = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
  { label: "Both", value: "both" },
];

export function selectedDevice(devices: readonly string[] | undefined) {
  if (devices?.length === 2) return "both";
  return devices?.[0] ?? "";
}

/** Device belongs to the keyword's check, so the sheet states what the default will cost. */
export function deviceNote(devices: readonly string[] | undefined) {
  return devices?.length === 2
    ? "Each keyword is checked on both, so it bills two checks a run."
    : "One check a run per keyword. You can add the other device later.";
}

export function pasteState(method: NewMarketCreateInput["method"] | undefined) {
  if (method?.kind !== "paste") return { error: null, count: 0 };
  try {
    return { error: null, count: parseNewMarketPaste(method.text).length };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "Paste keywords are invalid.",
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
