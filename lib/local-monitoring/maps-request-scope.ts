import { LOCAL_SEARCH_LANGUAGES } from "./search-languages";
/** Client-safe request dimensions shared with the registered Maps implementation. */
export const MAPS_REQUEST_SCOPE = Object.freeze({
  engine: "google" as const,
  surface: "maps" as const,
  resultKind: "map_listing" as const,
  rankScale: "maps_organic" as const,
  devices: ["desktop", "mobile"] as const,
  operatingSystems: ["windows", "macos", "android", "ios"] as const,
  languages: LOCAL_SEARCH_LANGUAGES.map((row) => row.value),
  maxCutoff: 20,
  zoomRange: [3, 21] as const,
});
export function localOperatingSystems(device: "desktop" | "mobile") {
  return device === "desktop"
    ? (["windows", "macos"] as const)
    : device === "mobile"
      ? (["android", "ios"] as const)
      : [];
}

export const FINDER_REQUEST_SCOPE = Object.freeze({
  ...MAPS_REQUEST_SCOPE,
  surface: "local_finder" as const,
  resultKind: "listing" as const,
  rankScale: "finder_group" as const,
  zoomRange: [4, 18] as const,
});
