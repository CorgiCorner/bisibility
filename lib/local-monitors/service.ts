import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import {
  BusinessLocationConflictError,
  BusinessLocationUnavailableError,
} from "@/lib/business-location-store/errors";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import {
  LocalMonitorConflictError,
  LocalMonitorDefinitionInputError,
} from "@/lib/local-monitor-store/model";
import {
  archiveMonitorSchema,
  createMonitorSchema,
  reviseMonitorSchema,
} from "@/lib/local-monitor-store/schema";
import {
  archiveLocalMonitor,
  createLocalMonitor,
  reviseLocalMonitor,
} from "@/lib/local-monitor-store/write";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { z } from "zod";
import type { MonitorSaveResult } from "./contracts";

const commandSchema = z.discriminatedUnion("operation", [
  createMonitorSchema.extend({ operation: z.literal("create") }),
  reviseMonitorSchema.extend({ operation: z.literal("revise") }),
  archiveMonitorSchema.extend({ operation: z.literal("archive") }),
]);
/** Setup only: delegates fresh identity/membership, locking, CAS and replay to the persisted authority. */
export async function saveMonitorFor(
  input: unknown,
  context: LocalStoreContext,
  db?: LocalDatabase,
): Promise<MonitorSaveResult> {
  try {
    const command = commandSchema.parse(input);
    const { operation, ...data } = command;
    const result =
      operation === "create"
        ? await createLocalMonitor(data, context, { db })
        : operation === "revise"
          ? await reviseLocalMonitor(data, context, { db })
          : await archiveLocalMonitor(data, context, { db });
    return { kind: "saved", receipt: result.receipt };
  } catch (error) {
    if (
      error instanceof LocalMonitorConflictError ||
      error instanceof BusinessLocationConflictError
    )
      return { kind: "conflict" };
    if (
      error instanceof z.ZodError ||
      error instanceof RangeError ||
      error instanceof LocalMonitorDefinitionInputError
    )
      return { kind: "invalid" };
    if (error instanceof AuthorizationError || error instanceof ProjectReadOnlyError)
      return { kind: "forbidden" };
    if (
      error instanceof LocalMeasurementUnavailableError ||
      error instanceof BusinessLocationUnavailableError
    )
      return { kind: "unavailable" };
    throw error;
  }
}
