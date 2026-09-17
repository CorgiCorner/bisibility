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
import type { useTranslations } from "next-intl";

export const settingsSections = [
  { icon: SlidersHorizontal, id: "general" },
  { icon: Database, id: "data-sources" },
  { icon: Crosshair, id: "tracking" },
  { icon: Flag, id: "competitors" },
  { icon: PaperPlaneTilt, id: "notifications" },
  { icon: UserPlus, id: "team" },
  { icon: CreditCard, id: "billing" },
  { icon: Code, id: "developers" },
  { icon: Flask, id: "experimental" },
  { icon: ShieldWarning, id: "advanced" },
] as const satisfies ReadonlyArray<{ icon: Icon; id: string }>;

// Keep the old usage id valid for links into the new integrations section.
export type SettingsSectionId = (typeof settingsSections)[number]["id"] | "usage";

export type SettingsSection = (typeof settingsSections)[number];
export type SettingsShellTranslations = ReturnType<typeof useTranslations<"projectSettingsShell">>;

export function settingsSectionLabel(t: SettingsShellTranslations, section: SettingsSectionId) {
  switch (section) {
    case "advanced":
      return t("sections.advanced");
    case "billing":
      return t("sections.billing");
    case "competitors":
      return t("sections.competitors");
    case "data-sources":
      return t("sections.dataSources");
    case "developers":
      return t("sections.developers");
    case "experimental":
      return t("sections.experimental");
    case "general":
      return t("sections.general");
    case "notifications":
      return t("sections.notifications");
    case "team":
      return t("sections.team");
    case "tracking":
      return t("sections.tracking");
    case "usage":
      return t("sections.billing");
  }
}

// These are the section anchors rendered by the legacy settings surface. Form-control ids are
// intentionally not routes: no legacy link targets them as a settings destination.
export const legacySettingsHashMap = {
  "#api-keys": "developers",
  "#migration": "advanced",
  "#provider-usage": "usage",
  "#usage-billing": "billing",
} as const satisfies Record<string, SettingsSectionId>;

export function getSettingsSection(id: string): SettingsSection | undefined {
  return settingsSections.find((section) => section.id === id);
}

export function settingsSectionHref(projectRef: ProjectRef, section: SettingsSectionId) {
  return section === "usage"
    ? `${appPath(projectRef, "integrations")}?tab=usage`
    : appPath(projectRef, "settings", section);
}

export function resolveLegacySettingsHash(hash: string): SettingsSectionId | undefined {
  return legacySettingsHashMap[hash as keyof typeof legacySettingsHashMap];
}
