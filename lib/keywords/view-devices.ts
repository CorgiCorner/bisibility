export type KeywordViewDevice = "desktop" | "mobile";

/** Devices in the already filtered selection; no project-wide or paired-target assumptions. */
export function keywordViewDevices(rows: readonly { device?: string }[]): KeywordViewDevice[] {
  const present = new Set(rows.map((row) => row.device?.toLowerCase()));
  return (["desktop", "mobile"] as const).filter((device) => present.has(device));
}
