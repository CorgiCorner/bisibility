import { isReservedAgentReportKind } from "@/lib/agent-reports/kinds";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { modelPlaygroundReportSchema } from "@/lib/model-playground/report-body";
import { z } from "zod";
import { boundedJson } from "./json-budget";

export type ReportJson =
  | null
  | boolean
  | number
  | string
  | ReportJson[]
  | { [key: string]: ReportJson };

const jsonObject = (bytes: number) =>
  z.custom<Record<string, ReportJson>>(
    (value) => boundedJson(value, bytes),
    "Expected a bounded JSON object (maximum depth 16).",
  );

export const storedAgentReportSchema = z
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

export const agentReportSchema = storedAgentReportSchema.superRefine((report, ctx) => {
  if (
    report.body.format === "model_playground" &&
    (report.kind !== "prompt_explorer" ||
      !modelPlaygroundReportSchema.safeParse(report.body).success)
  )
    ctx.addIssue({
      code: "custom",
      path: ["body"],
      message: "Invalid versioned Model Playground report.",
    });
});

export const externalAgentReportSchema = agentReportSchema
  .safeExtend({
    kind: agentReportSchema.shape.kind.refine(
      (kind) => !isReservedAgentReportKind(kind),
      "This report kind is reserved for application-generated analyses. Use an external analysis kind.",
    ),
  })
  .superRefine((report, ctx) => {
    if (report.body.format === "model_playground")
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Model Playground reports require a stored run.",
      });
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
  modelPlaygroundRunId?: string;
};
