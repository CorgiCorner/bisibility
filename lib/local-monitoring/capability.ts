import { isoTime, requireToken } from "./key";
import type { ExecutionTargetV1, LocalRankScale, LocalResultKind, LocalSurface } from "./types";

export type LocalCapability = Readonly<{
  version: string;
  provider: string;
  adapterVersion: string;
  expiresAt: string;
  nativeBillingUnit: string;
  implementations: readonly Readonly<{
    evidenceVersion: string;
    engine: "google";
    surface: LocalSurface;
    resultKind: LocalResultKind;
    rankScale: LocalRankScale;
    point: true;
    devices: readonly ("desktop" | "mobile")[];
    operatingSystems: readonly (string | null)[];
    languages: readonly string[];
    maxCutoff: number;
    zoomRange: readonly [number, number] | null;
    asyncSubmitCollect: true;
  }>[];
}>;

/** Empty by design: fixture adapters never register a paid product capability. */
export const NO_LOCAL_IMPLEMENTATIONS: LocalCapability["implementations"] = Object.freeze([]);

export function assertLocalCapability(
  target: ExecutionTargetV1,
  capability: LocalCapability,
  now: Date,
) {
  const time = now.getTime();
  if (!Number.isFinite(time) || isoTime(capability.expiresAt) <= time)
    throw new Error("Local capability expired");
  for (const [label, value] of Object.entries({
    version: capability.version,
    provider: capability.provider,
    adapterVersion: capability.adapterVersion,
    nativeBillingUnit: capability.nativeBillingUnit,
  })) {
    requireToken(value, label);
  }
  const supported = capability.implementations.some((item) => {
    const zoomMatches =
      target.zoom === null
        ? item.zoomRange === null
        : item.zoomRange !== null &&
          item.zoomRange.every(Number.isFinite) &&
          item.zoomRange[0] <= item.zoomRange[1] &&
          target.zoom >= item.zoomRange[0] &&
          target.zoom <= item.zoomRange[1];
    return (
      Boolean(item.evidenceVersion) &&
      item.point === true &&
      item.asyncSubmitCollect === true &&
      item.engine === target.engine &&
      item.surface === target.surface &&
      item.resultKind === target.resultKind &&
      item.rankScale === target.rankScale &&
      item.devices.includes(target.device) &&
      item.operatingSystems.includes(target.operatingSystem) &&
      item.languages.includes(target.language) &&
      Number.isSafeInteger(item.maxCutoff) &&
      item.maxCutoff > 0 &&
      target.cutoff <= item.maxCutoff &&
      zoomMatches
    );
  });
  if (!supported) throw new Error("Local target is not implemented by this adapter");
}
