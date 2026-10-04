import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

export type ReportJson =
  | null
  | boolean
  | number
  | string
  | ReportJson[]
  | { [key: string]: ReportJson };

function boundedJson(value: unknown, maxBytes: number): value is Record<string, ReportJson> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  const seen = new Set<object>();
  while (pending.length) {
    const item = pending.pop();
    if (!item || ++nodes > 20000 || item.depth > 16) return false;
    const current = item.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype)
      return false;
    for (const child of Object.values(current))
      pending.push({ value: child, depth: item.depth + 1 });
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes;
}

const jsonObject = (bytes: number) =>
  z.custom<Record<string, ReportJson>>(
    (value) => boundedJson(value, bytes),
    "Expected a bounded JSON object (maximum depth 16).",
  );

export const agentReportSchema = z
  .object({
    kind: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
    title: z.string().trim().min(1).max(160),
    body: jsonObject(256 * 1024),
    provenance: jsonObject(32 * 1024).default({}),
  })
  .strict();

const reservedProducerKinds = new Set(["site_audit", "ai_visibility", "prompt_explorer"]);

export const externalAgentReportSchema = agentReportSchema.extend({
  kind: agentReportSchema.shape.kind.refine(
    (kind) => !reservedProducerKinds.has(kind.toLowerCase()),
    "This report kind is reserved for application-generated analyses. Use an external analysis kind.",
  ),
});

export const agentReportListSchema = z.object({
  kind: agentReportSchema.shape.kind.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.iso.datetime().optional(),
});

export const agentReportIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "agr"), "Invalid report ID.");
export type AgentReportInput = z.input<typeof agentReportSchema>;
export type AgentReportSummary = { id: string; kind: string; title: string; createdAt: string };
export type AgentReportResource = AgentReportSummary & {
  body: Record<string, ReportJson>;
  provenance: Record<string, ReportJson>;
};
