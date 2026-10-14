import { isPublicIdOfType } from "@/lib/db/public-id";
import type {
  CapturedObservation,
  RecordedMeasurementCheck,
} from "@/lib/rank-measurements/recorded-check";
import type {
  MeasurementPolicy,
  MeasurementReport,
  MeasurementScope,
  ResolvedMeasurement,
} from "@/lib/rank-measurements/types";
import { z } from "zod";

export const reportWindowSchema = z
  .object({
    basis: z.enum(["observed_at", "recorded_at"]),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .strict()
  .refine(
    (window) => new Date(window.from) <= new Date(window.to),
    "Window start must precede its end",
  )
  .transform((window) => ({
    ...window,
    from: new Date(window.from).toISOString(),
    to: new Date(window.to).toISOString(),
  }));

export const rankReportRequestSchema = z
  .object({
    cursor: z.string().min(1).max(8192).optional(),
    pageLimit: z.int().min(1).max(250),
    projectId: z.string().refine((id) => isPublicIdOfType(id, "prj")),
    resolutionIds: z
      .array(z.string().refine((id) => isPublicIdOfType(id, "kw")))
      .max(250)
      .optional(),
    selectedIds: z
      .array(z.string().refine((id) => isPublicIdOfType(id, "kw")))
      .refine((ids) => new Set(ids).size === ids.length, "Selected IDs must be unique"),
    stream: z.enum(["attempts", "observations", "items"]),
    window: reportWindowSchema,
  })
  .strict()
  .refine(
    (request) => request.resolutionIds?.every((id) => request.selectedIds.includes(id)) ?? true,
    "Resolution IDs must belong to the full selected scope",
  );
export type RankReportRequest = z.infer<typeof rankReportRequestSchema>;

/** Supplied by the trusted server metric/policy registry, never parsed from a client request. */
export type RankReportPolicy = {
  asOf: Date;
  baseline: { mode: "none" } | { mode: "before"; before: Date; notBefore: Date | null };
  baselineExpectedIds?: readonly string[];
  /** Required with an independently retained baseline membership; never today's inferred cohort. */
  baselineProjectId?: string;
  currentNotBefore: Date | null;
  freshForMs: number | null;
  horizon: number;
  metric: { curve: readonly number[]; definitionVersion: string; id: string };
  minimumRequestedDepth: number | null;
  weightProvenance: MeasurementReport["weightProvenance"];
};
export type RankReportLimits = { maxChecks: number; maxItems: number; maxTargets: number };

export type RetainedObservationItem = {
  createdAt: Date;
  id: string;
  blockPosition: number | null;
  businessName: string | null;
  cid: string | null;
  domain: string | null;
  mapsUrl: string | null;
  rankScale?: string | null;
  promotion?: string | null;
  sourcePage?: number | null;
  sourceBlockId?: string | null;
  sourceOrdinal?: number | null;
  observedAt?: Date | null;
  ordinal: number;
  placeId: string | null;
  positionInBlock: number | null;
  rankAbsolute: number | null;
  rankGroup: number | null;
  resultKind: string;
  title: string | null;
  url: string | null;
};

export type RetainedReportCheck = RecordedMeasurementCheck & {
  attemptCount: number;
  checkedAt: Date;
  createdAt: Date;
  deferredReason: string | null;
  errorCode: string | null;
  expectedUrlAtCheck: string | null;
  finishedAt: Date | null;
  id: string;
  observationRun: (CapturedObservation & { items: readonly RetainedObservationItem[] }) | null;
  rankingUrl: string | null;
  /** Original compatibility field; qualification still comes from the shared kernel. */
  previousPosition?: number | null;
  startedAt: Date | null;
  status: string;
  updatedAt: Date;
};
export type RankReportTarget = {
  checks: readonly RetainedReportCheck[];
  /** Explicit per-target comparison tolerance. Null disables an unproved baseline window. */
  baselineWindow?: { before: Date; notBefore: Date } | null;
  /** Captured target cadence+grace/manual TTL. Explicit null never inherits a shared TTL. */
  freshForMs?: number | null;
  expectedScope?: MeasurementScope | null;
  id: string;
  requestedGeo?: MeasurementPolicy["requestedGeo"];
  volume: number | null;
};
export type ResolvedReportTarget = {
  checks: readonly RetainedReportCheck[];
  baselineWindow?: { before: Date; notBefore: Date } | null;
  freshForMs?: number | null;
  comparisonRequested: boolean;
  id: string;
  resolution: ResolvedMeasurement;
  volume: number | null;
};

export type ReportPageKey = { at: string; id: string };
export type ReportSummary = {
  comparison: "requested" | "not_requested";
  metric: MeasurementReport;
  movementCounts:
    | (Record<ResolvedMeasurement["event"], number> & { improved: number; declined: number })
    | null;
  retainedHistory: { checks: number; completeness: "retained_only"; targets: number };
  selectionDigest: string;
  timeBasis: {
    asOf: string;
    baseline: { before: string; notBefore: string | null } | null;
    currentNotBefore: string | null;
  };
};
