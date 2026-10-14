import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import {
  BusinessLocationConflictError,
  BusinessLocationUnavailableError,
} from "@/lib/business-location-store/errors";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { LocalResultUnavailableError } from "@/lib/local-monitor-results/errors";
import { readMonitorRetryOptions } from "@/lib/local-monitor-retry/read";
import {
  LocalMonitorConflictError,
  LocalMonitorDefinitionInputError,
} from "@/lib/local-monitor-store/model";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import {
  LocalMeasurementConflictError,
  LocalMeasurementUnavailableError,
} from "@/lib/local-monitoring-store/errors";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { z } from "zod";
import { MonitorLaunchUnavailableError } from "./contracts";
import type { ManualLocalDriverFactory } from "./driver";
import { launchMonitor } from "./launch";
import { previewMonitorLaunch } from "./preview";
import { readMonitorLaunchState } from "./read";
import type {
  LaunchMonitorResult,
  MonitorLaunchFailure,
  PreviewMonitorResult,
  ReadMonitorLaunchResult,
} from "./result";

function failure(error: unknown): MonitorLaunchFailure {
  if (error instanceof AuthorizationError || error instanceof ProjectReadOnlyError)
    return { kind: "forbidden" };
  if (error instanceof PreviewTokenError)
    return { kind: error.code === "expired" ? "expired" : "conflict" };
  if (
    error instanceof LocalMonitorConflictError ||
    error instanceof LocalMeasurementConflictError ||
    error instanceof BusinessLocationConflictError
  )
    return { kind: "conflict" };
  if (error instanceof z.ZodError || error instanceof LocalMonitorDefinitionInputError)
    return { kind: "invalid" };
  if (error instanceof MonitorLaunchUnavailableError)
    return { kind: "unavailable", reason: error.reason };
  if (
    error instanceof LocalResultUnavailableError ||
    error instanceof LocalMeasurementUnavailableError ||
    error instanceof BusinessLocationUnavailableError
  )
    return { kind: "unavailable" };
  throw error;
}
export async function previewMonitorFor(
  input: unknown,
  context: LocalStoreContext,
  factory: ManualLocalDriverFactory,
  db?: LocalDatabase,
): Promise<PreviewMonitorResult> {
  try {
    return await previewMonitorLaunch(input, context, factory, db);
  } catch (error) {
    return failure(error);
  }
}
export async function launchMonitorFor(
  input: unknown,
  context: LocalStoreContext,
  db?: LocalDatabase,
): Promise<LaunchMonitorResult> {
  try {
    return {
      kind: "queued",
      receipt: await launchMonitor(input, context, db),
    };
  } catch (error) {
    return failure(error);
  }
}
export async function readMonitorLaunchFor(
  input: unknown,
  context: LocalStoreContext,
  db?: LocalDatabase,
): Promise<ReadMonitorLaunchResult> {
  try {
    return {
      kind: "ready",
      state: await readMonitorLaunchState(input, context, db),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function readMonitorRetryFor(
  input: unknown,
  context: LocalStoreContext,
  db?: LocalDatabase,
) {
  try {
    return { kind: "ready" as const, state: await readMonitorRetryOptions(input, context, db) };
  } catch (error) {
    return failure(error);
  }
}
