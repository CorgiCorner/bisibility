import type {
  MeasurementQuote,
  SettingsIntentCommand,
} from "@/lib/measurement-settings/ui-contracts";
import type { SettingsSource } from "./source";
/** Defaults affect future inherited policy; they never clone or retarget existing keyword identities. */
export function settingsIntentEffect(
  source: SettingsSource,
  selection: SettingsIntentCommand["selection"],
): MeasurementQuote["intentEffect"] {
  const inheritedDepthTargets = source.targets.filter(
    (row) =>
      row.policy.checkSchedule?.serpDepth == null && row.policy.keywordSchedule?.serpDepth == null,
  ).length;
  return {
    existingTargetRetargets: 0,
    newTargets: 0,
    inheritedDepthTargets,
    recurringEstimate:
      selection.depth === source.defaults?.serpDepth || inheritedDepthTargets === 0
        ? "unchanged"
        : "unknown",
  };
}
