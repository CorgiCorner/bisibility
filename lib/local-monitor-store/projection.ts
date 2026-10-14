import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { FrozenMonitorCalendar, MonitorDefinition } from "./model";

export type MonitorReadinessReason =
  | "archived"
  | "subject_changed"
  | "keyword_changed"
  | "manual"
  | "paused"
  | "definition_changed"
  | "calendar_changed";
export type CurrentMonitorSources = Readonly<{
  subject: { state: string; role: string; currentRevisionId: string | null } | null;
  keywords: readonly {
    id: string;
    sourceHash: string;
    measurementTargetEpoch: string;
    measurementPolicyEpoch: string;
  }[];
}>;
export function monitorReadiness(input: {
  state: string;
  revisionId: string;
  definition: MonitorDefinition;
  sources: CurrentMonitorSources;
  intent: { mode: string; definitionRevisionId: string; snapshot: unknown };
  currentCalendar: FrozenMonitorCalendar | null;
}) {
  const reasons: MonitorReadinessReason[] = [];
  if (input.state !== "active") reasons.push("archived");
  const subject = input.sources.subject;
  if (
    !subject ||
    subject.state !== "active" ||
    subject.role !== "subject" ||
    subject.currentRevisionId !== input.definition.identityRevisionId
  )
    reasons.push("subject_changed");
  if (
    input.definition.keywords.some(
      (frozen) =>
        !input.sources.keywords.some(
          (current) =>
            current.id === frozen.id &&
            current.sourceHash === frozen.sourceHash &&
            current.measurementTargetEpoch === frozen.measurementTargetEpoch &&
            current.measurementPolicyEpoch === frozen.measurementPolicyEpoch,
        ),
    )
  )
    reasons.push("keyword_changed");
  if (input.intent.mode === "manual" || input.intent.mode === "paused")
    reasons.push(input.intent.mode);
  if (input.intent.definitionRevisionId !== input.revisionId) reasons.push("definition_changed");
  if (
    input.intent.mode === "scheduled" &&
    (!input.currentCalendar ||
      localDigest(input.currentCalendar) !== localDigest(input.intent.snapshot))
  )
    reasons.push("calendar_changed");
  return {
    configurationCurrent: !reasons.some((reason) => !["manual", "paused"].includes(reason)),
    scheduledIntentCurrent: reasons.length === 0,
    reasons,
  };
}

export function publicMonitorDefinition(definition: MonitorDefinition) {
  return {
    name: definition.name,
    identityRevisionId: definition.identityRevisionId,
    locationId: definition.locationId,
    axes: definition.axes,
    grid: definition.grid,
    keywords: definition.keywords.map(({ publicId: id, text }) => ({ id, text })),
  };
}
export function publicMonitorCalendar(snapshot: unknown) {
  if (snapshot === null) return null;
  const value = snapshot as FrozenMonitorCalendar;
  return {
    id: value.publicId,
    measurementEpoch: value.measurementEpoch,
    frequency: value.frequency,
    cronExpression: value.cronExpression,
    timeOfDay: value.timeOfDay,
    timezone: value.timezone,
    jitterMinutes: value.jitterMinutes,
    configuredSerpDepth: value.serpDepth,
    configuredProviderPolicy: value.providerPolicy,
  };
}
