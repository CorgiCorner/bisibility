import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import type { Icon } from "@phosphor-icons/react";
import { CodeIcon as Code } from "@phosphor-icons/react/dist/ssr/Code";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/dist/ssr/CreditCard";
import { CrosshairIcon as Crosshair } from "@phosphor-icons/react/dist/ssr/Crosshair";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { FlagIcon as Flag } from "@phosphor-icons/react/dist/ssr/Flag";
import { FlaskIcon as Flask } from "@phosphor-icons/react/dist/ssr/Flask";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";

export const settingsSections = [
  { icon: SlidersHorizontal, id: "general", label: "General" },
  { icon: Crosshair, id: "tracking", label: "Tracking" },
  { icon: Flag, id: "competitors", label: "Competitors" },
  { icon: Flask, id: "experimental", label: "Experimental" },
  { icon: Database, id: "data-sources", label: "Data sources" },
  { icon: PaperPlaneTilt, id: "notifications", label: "Notifications" },
  { icon: Code, id: "developers", label: "Developers" },
  { icon: CreditCard, id: "usage", label: "Usage and billing" },
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
