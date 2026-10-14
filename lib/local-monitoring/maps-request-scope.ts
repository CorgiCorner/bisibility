/** Client-safe request dimensions shared with the registered Maps implementation. */
export const MAPS_REQUEST_SCOPE = Object.freeze({
  engine: "google" as const,
  surface: "maps" as const,
  resultKind: "map_listing" as const,
  rankScale: "maps_organic" as const,
  devices: ["desktop", "mobile"] as const,
  operatingSystems: ["windows", "macos", "android", "ios"] as const,
  languages: ["en"] as const,
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
