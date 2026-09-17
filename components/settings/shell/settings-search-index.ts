import {
  type SettingsSectionId,
  type SettingsShellTranslations,
  settingsSectionLabel,
} from "@/components/settings/shell/settings-sections";
import { appPath } from "@/lib/routing/app-path";

type SearchEntryDefinition = {
  anchor?: string;
  label: (t: SettingsShellTranslations) => string;
  keywords: (t: SettingsShellTranslations) => string;
  path: string;
  query?: string;
  section: (t: SettingsShellTranslations) => string;
};

function searchEntry(
  section: SettingsSectionId | ((t: SettingsShellTranslations) => string),
  path: string,
  copy: (t: SettingsShellTranslations) => { keywords: string; label: string },
  options: Pick<SearchEntryDefinition, "anchor" | "query"> = {},
): SearchEntryDefinition {
  return {
    ...options,
    label: (t) => copy(t).label,
    keywords: (t) => copy(t).keywords,
    path,
    section: typeof section === "function" ? section : (t) => settingsSectionLabel(t, section),
  };
}

export const settingsSearchEntries = [
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.defaultLocation.label"),
      keywords: t("search.entries.defaultLocation.keywords"),
    }),
    { anchor: "tracking-location" },
  ),
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.checkFrequency.label"),
      keywords: t("search.entries.checkFrequency.keywords"),
    }),
    { anchor: "tracking-frequency" },
  ),
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.stopOnMatch.label"),
      keywords: t("search.entries.stopOnMatch.keywords"),
    }),
    { anchor: "tracking-stop-on-match" },
  ),
  searchEntry("experimental", "settings/experimental", (t) => ({
    label: t("search.entries.experimentalFeatures.label"),
    keywords: t("search.entries.experimentalFeatures.keywords"),
  })),
  searchEntry("advanced", "settings/advanced", (t) => ({
    label: t("search.entries.projectManagement.label"),
    keywords: t("search.entries.projectManagement.keywords"),
  })),
  searchEntry(
    "general",
    "settings/general",
    (t) => ({
      label: t("search.entries.projectName.label"),
      keywords: t("search.entries.projectName.keywords"),
    }),
    { anchor: "general-project-name" },
  ),
  searchEntry(
    "general",
    "settings/general",
    (t) => ({
      label: t("search.entries.websiteDomain.label"),
      keywords: t("search.entries.websiteDomain.keywords"),
    }),
    { anchor: "general-project-domain" },
  ),
  searchEntry(
    "general",
    "settings/general",
    (t) => ({
      label: t("search.entries.tagsAndSegments.label"),
      keywords: t("search.entries.tagsAndSegments.keywords"),
    }),
    { anchor: "tags-segments" },
  ),
  searchEntry(
    "data-sources",
    "settings/data-sources",
    (t) => ({
      label: t("search.entries.urlInspectionLimit.label"),
      keywords: t("search.entries.urlInspectionLimit.keywords"),
    }),
    { anchor: "url-inspection" },
  ),
  searchEntry(
    "data-sources",
    "settings/data-sources",
    (t) => ({
      label: t("search.entries.searchDataSync.label"),
      keywords: t("search.entries.searchDataSync.keywords"),
    }),
    { anchor: "search-data-sync" },
  ),
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.defaultSerpDepth.label"),
      keywords: t("search.entries.defaultSerpDepth.keywords"),
    }),
    { anchor: "tracking-depth" },
  ),
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.defaultDevice.label"),
      keywords: t("search.entries.defaultDevice.keywords"),
    }),
    { anchor: "tracking-device" },
  ),
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.scheduleTimezone.label"),
      keywords: t("search.entries.scheduleTimezone.keywords"),
    }),
    { anchor: "tracking-timezone" },
  ),
  searchEntry(
    "tracking",
    "settings/tracking",
    (t) => ({
      label: t("search.entries.domainMatching.label"),
      keywords: t("search.entries.domainMatching.keywords"),
    }),
    { anchor: "match-scope" },
  ),
  searchEntry("competitors", "settings/competitors", (t) => ({
    label: t("search.entries.competitors.label"),
    keywords: t("search.entries.competitors.keywords"),
  })),
  searchEntry(
    "notifications",
    "settings/notifications",
    (t) => ({
      label: t("search.entries.notificationChannels.label"),
      keywords: t("search.entries.notificationChannels.keywords"),
    }),
    { anchor: "notification-preferences-form" },
  ),
  searchEntry("team", "settings/team", (t) => ({
    label: t("search.entries.members.label"),
    keywords: t("search.entries.members.keywords"),
  })),
  searchEntry(
    "billing",
    "settings/billing",
    (t) => ({
      label: t("search.entries.applicationPlan.label"),
      keywords: t("search.entries.applicationPlan.keywords"),
    }),
    { anchor: "plan" },
  ),
  searchEntry(
    "developers",
    "settings/developers",
    (t) => ({
      label: t("search.entries.apiKeys.label"),
      keywords: t("search.entries.apiKeys.keywords"),
    }),
    { anchor: "api-keys" },
  ),
  searchEntry(
    "developers",
    "settings/developers",
    (t) => ({
      label: t("search.entries.deployWebhooks.label"),
      keywords: t("search.entries.deployWebhooks.keywords"),
    }),
    { anchor: "deploy-webhooks" },
  ),
  searchEntry(
    (t) => t("search.sections.providerConnections"),
    "integrations",
    (t) => ({
      label: t("search.entries.providerConnections.label"),
      keywords: t("search.entries.providerConnections.keywords"),
    }),
    { anchor: "all-providers" },
  ),
  searchEntry(
    (t) => t("search.sections.providerUsage"),
    "integrations",
    (t) => ({
      label: t("search.entries.providerBudgets.label"),
      keywords: t("search.entries.providerBudgets.keywords"),
    }),
    { anchor: "provider-usage", query: "tab=usage" },
  ),
] as const satisfies readonly SearchEntryDefinition[];

export type SettingsSearchEntry = (typeof settingsSearchEntries)[number];

export function settingsSearchHref(projectRef: string, entry: SettingsSearchEntry) {
  const query = entry.query ? `?${entry.query}` : "";
  return `${appPath(projectRef, ...entry.path.split("/"))}${query}${entry.anchor ? `#${entry.anchor}` : ""}`;
}

export function findSettings(query: string, t: SettingsShellTranslations) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const labelMatches = (entry: SettingsSearchEntry) =>
    words.every((word) => entry.label(t).toLocaleLowerCase().includes(word));
  return settingsSearchEntries
    .filter((entry) => {
      const text = `${entry.label(t)} ${entry.section(t)} ${entry.keywords(t)}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((left, right) => Number(labelMatches(right)) - Number(labelMatches(left)));
}
