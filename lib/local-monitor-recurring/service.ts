import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import type { LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { z } from "zod";
import { approveRecurringMonitor } from "./approve";
import { pauseRecurringMonitor } from "./pause";
import { previewRecurringMonitor } from "./preview";

function failure(error: unknown) {
  if (error instanceof AuthorizationError || error instanceof ProjectReadOnlyError)
    return { kind: "forbidden" as const };
  if (error instanceof LocalMonitorConflictError) return { kind: "conflict" as const };
  if (
    error instanceof z.ZodError ||
    error instanceof PreviewTokenError ||
    error instanceof RangeError
  )
    return { kind: "invalid" as const };
  throw error;
}
export async function previewRecurringFor(input: unknown, context: LocalStoreContext) {
  try {
    return await previewRecurringMonitor(input, context);
  } catch (error) {
    return failure(error);
  }
}
export async function approveRecurringFor(input: unknown, context: LocalStoreContext) {
  try {
    return {
      kind: "saved" as const,
      receipt: (await approveRecurringMonitor(input, context)).receipt,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function pauseRecurringFor(input: unknown, context: LocalStoreContext) {
  try {
    return {
      kind: "saved" as const,
      receipt: (await pauseRecurringMonitor(input, context)).receipt,
    };
  } catch (error) {
    return failure(error);
  }
}
