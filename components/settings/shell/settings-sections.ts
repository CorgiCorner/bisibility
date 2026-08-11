import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import type { Icon } from "@phosphor-icons/react";
import {
  CodeIcon as Code,
  CreditCardIcon as CreditCard,
  CrosshairIcon as Crosshair,
  PaperPlaneTiltIcon as PaperPlaneTilt,
  ShieldWarningIcon as ShieldWarning,
  SlidersHorizontalIcon as SlidersHorizontal,
  UserPlusIcon as UserPlus,
} from "@phosphor-icons/react/dist/ssr";

export const settingsSections = [
  { icon: SlidersHorizontal, id: "general", label: "General" },
  { icon: Crosshair, id: "tracking", label: "Tracking" },
  { icon: PaperPlaneTilt, id: "notifications", label: "Notifications" },
  { icon: Code, id: "developers", label: "Developers" },
  { icon: CreditCard, id: "usage", label: "Usage & billing" },
  { icon: UserPlus, id: "team", label: "Team" },
  { icon: ShieldWarning, id: "advanced", label: "Advanced" },
] as const satisfies ReadonlyArray<{ icon: Icon; id: string; label: string }>;

export type SettingsSectionId = (typeof settingsSections)[number]["id"];

export type SettingsSection = (typeof settingsSections)[number];

// These are the section anchors rendered by the legacy settings surface. Form-control ids are
// intentionally not routes: no legacy link targets them as a settings destination.
export const legacySettingsHashMap = {
  "#api-keys": "developers",
  "#migration": "advanced",
  "#provider-usage": "usage",
  "#usage-billing": "usage",
} as const satisfies Record<string, SettingsSectionId>;

export function getSettingsSection(id: string): SettingsSection | undefined {
  return settingsSections.find((section) => section.id === id);
}

export function settingsSectionHref(projectRef: ProjectRef, section: SettingsSectionId) {
  return appPath(projectRef, "settings", section);
}

export function resolveLegacySettingsHash(hash: string): SettingsSectionId | undefined {
  return legacySettingsHashMap[hash as keyof typeof legacySettingsHashMap];
}
