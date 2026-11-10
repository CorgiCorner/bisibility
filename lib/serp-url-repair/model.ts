import { isGoogleRedirectUrl, isResolvableRedirect } from "@/lib/providers/serp/google-redirect";
import { z } from "zod";

export const urlRepairTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("check"), checkId: z.string().regex(/^check_[a-z0-9]{8,80}$/) })
    .strict(),
  z
    .object({
      kind: z.literal("comparison"),
      runId: z.uuid(),
      provider: z.enum(["dataforseo", "serpapi"]),
    })
    .strict(),
]);
export type UrlRepairTarget = z.infer<typeof urlRepairTargetSchema>;
export type UrlRepairState = {
  version: 1;
  workflowId: string;
  runId: string;
  status: "running" | "completed" | "failed";
  updatedAt: string;
  mappings: Record<string, string>;
  resolved: number;
  unresolved: number;
};
export type UrlRepairView = Pick<
  UrlRepairState,
  "status" | "resolved" | "unresolved" | "updatedAt"
>;
export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function storedUrlRepair(value: unknown): UrlRepairState | null {
  const parsed = z
    .object({
      version: z.literal(1),
      workflowId: z.string(),
      runId: z.string(),
      status: z.enum(["running", "completed", "failed"]),
      updatedAt: z.iso.datetime(),
      mappings: z.record(z.string(), z.string()),
      resolved: z.number().int().nonnegative(),
      unresolved: z.number().int().nonnegative(),
    })
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function repairView(value: unknown): UrlRepairView | undefined {
  const state = storedUrlRepair(value);
  return state
    ? {
        status: state.status,
        resolved: state.resolved,
        unresolved: state.unresolved,
        updatedAt: state.updatedAt,
      }
    : undefined;
}
export function destinationUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !isGoogleRedirectUrl(value)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Display enrichment never changes the saved source rows or a historical position. */
export function repairedUrl(original: string, repair: unknown): string {
  if (!isResolvableRedirect(original)) return original;
  return destinationUrl(storedUrlRepair(repair)?.mappings[original]) ?? original;
}
