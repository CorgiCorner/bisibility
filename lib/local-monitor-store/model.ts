import type { GridRevision } from "@/lib/local-monitoring/types";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { MonitorDefinitionInput } from "./schema";

export type MonitorKeyword = Readonly<{
  id: string;
  publicId: string;
  text: string;
  device: "desktop" | "mobile";
  locationId: string;
  measurementTargetEpoch: string;
  measurementPolicyEpoch: string;
  sourceHash: string;
}>;
export type MonitorDefinition = Readonly<{
  version: 1;
  name: string;
  locationId: string;
  entityId: string;
  identityRevisionId: string;
  grid: GridRevision;
  axes: MonitorDefinitionInput["axes"];
  keywords: readonly MonitorKeyword[];
}>;
export type FrozenMonitorCalendar = Readonly<{
  scheduleId: string;
  publicId: string;
  measurementEpoch: string;
  frequency: string;
  cronExpression: string | null;
  timeOfDay: string | null;
  timezone: string;
  jitterMinutes: number;
  serpDepth: number | null;
  providerPolicy: string | null;
}>;
/** The existing host verifies signed consent/forecast; this port must not buy work or create a schedule. */
export interface MonitorScheduleConsent {
  recordApproval?(
    tx: LocalTransaction,
    input: Readonly<{
      actorId: string;
      projectId: string;
      monitorId: string;
      intentId: string;
      definitionRevisionId: string;
      monitorVersion: number;
      calendar: FrozenMonitorCalendar;
      approvalDigest: string;
      capabilityVersion: string;
      now: Date;
    }>,
  ): Promise<void>;
  verify(
    tx: LocalTransaction,
    input: Readonly<{
      actorId: string;
      projectId: string;
      monitorRevisionId: string;
      calendar: FrozenMonitorCalendar;
      token: string;
      now: Date;
    }>,
  ): Promise<{
    approvalDigest: string;
    capabilityVersion: string;
  }>;
}
export type MonitorMutationReceipt = Readonly<{
  monitorId: string;
  version: number;
  revisionId: string;
  scheduleIntentId: string;
  state: "active" | "archived";
}>;
export class LocalMonitorDefinitionInputError extends Error {
  readonly status = 400;
  constructor(cause: unknown) {
    super("The monitor grid configuration is invalid.", { cause });
  }
}
export class LocalMonitorConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("The monitor, subject, keyword or calendar changed; review again.");
  }
}
