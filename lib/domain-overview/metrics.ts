import type { DomainRankMetrics } from "@/lib/providers/types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function snapshotMetrics(value: unknown): DomainRankMetrics | null {
  if (value === null) return null;
  const source = record(value);
  if (source._noData === true || Object.keys(source).length === 0) return null;
  return {
    count: nullableNumber(source.count),
    etv: nullableNumber(source.etv),
    estimatedTrafficCostCents: nullableNumber(source.estimatedTrafficCostCents),
    isDown: number(source.isDown),
    isLost: number(source.isLost),
    isNew: number(source.isNew),
    isUp: number(source.isUp),
    pos1: number(source.pos1),
    pos11_20: number(source.pos11_20),
    pos21_30: number(source.pos21_30),
    pos2_3: number(source.pos2_3),
    pos31_40: number(source.pos31_40),
    pos41_50: number(source.pos41_50),
    pos4_10: number(source.pos4_10),
    pos51_60: number(source.pos51_60),
    pos61_70: number(source.pos61_70),
    pos71_80: number(source.pos71_80),
    pos81_90: number(source.pos81_90),
    pos91_100: number(source.pos91_100),
  };
}
