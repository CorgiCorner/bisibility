import type { Actor } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  MeasurementChoices,
  MeasurementPermissions,
  SettingsSnapshot,
} from "@/lib/measurement-settings/ui-contracts";
export type SettingsHostContext = Readonly<{ actor: Actor }>;
export type SettingsHostTransaction = Prisma.TransactionClient;
export type SettingsHostRead =
  | Readonly<{
      kind: "ready";
      snapshot: SettingsSnapshot;
      choices: MeasurementChoices;
      rateVersion: string | null;
      permissions: MeasurementPermissions;
      scheduleChoices: readonly { id: string; label: string }[];
    }>
  | Readonly<{
      kind: "unavailable";
      reason:
        | "measurement_policy_unconfigured"
        | "measurement_policy_unsupported"
        | "source_unavailable"
        | "defaults_missing"
        | "default_geo_unavailable"
        | "provider_missing"
        | "provider_disabled"
        | "provider_disconnected"
        | "needs_reauth"
        | "unsupported_capability"
        | "settings_revision_unavailable";
      permissions: MeasurementPermissions;
    }>;
export type SettingsMutationOperation =
  | "measurement_settings.intent"
  | "measurement_settings.schedule";
