import "server-only";
import type { AiEngine } from "@/lib/ai-research/engines";

export type EngineBound = {
  model: string;
  outputTokens: number;
  costCents: number;
  measuredAt: string;
};

// Self-hosted and BYOK builds have no hosted Credits bound; engine mode stays unavailable.
export function aiResponseEnginesEnabled(_env: Record<string, string | undefined> = process.env) {
  return false;
}
export function measuredEngineBound(
  _engine: AiEngine,
  _input: { webSearch: boolean; catalogModels: readonly string[]; now?: number; data?: unknown },
): EngineBound | null {
  return null;
}
export function engineOptions(
  _now?: number,
  _data?: unknown,
): { engine: AiEngine; model: string }[] {
  return [];
}
export function engineCalibrationIdentity(engines: readonly AiEngine[], _data?: unknown) {
  return engines.map((engine) => `${engine}:none`).join("|");
}
