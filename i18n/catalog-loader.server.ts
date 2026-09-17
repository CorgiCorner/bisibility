import "server-only";

import { assertMessageCatalog, mergeMessageCatalogs } from "./catalog-contract";
import type { CoreFragmentFile, CoreFragmentLoaders } from "./catalog-fragments/contract";
import { coreFragments as coreFragmentsEn } from "./catalog-fragments/en";
import { coreFragments as coreFragmentsEsEs } from "./catalog-fragments/es-ES";
import { coreFragments as coreFragmentsJa } from "./catalog-fragments/ja";
import { coreFragments as coreFragmentsPl } from "./catalog-fragments/pl";
import { type ActiveLocale, assertActiveLocale } from "./config";
import type { CoreMessages } from "./core-messages.generated";

export const coreNamespaces = [
  "account",
  "auth",
  "cloudImport",
  "emailPreferences",
  "instanceAdmin",
  "invite",
  "onboarding",
  "projectMarkets",
  "projectSettingsAdvanced",
  "projectSettingsDevelopers",
  "projectSettingsExperimental",
  "projectSettingsGeneral",
  "projectSettingsMigration",
  "projectSettingsNotifications",
  "projectSettingsShell",
  "projectSettingsTeam",
  "projectSettingsTracking",
  "projectSettingsUsage",
  "projectAudit",
  "projectDashboard",
  "projectRuns",
  "projectBacklinks",
  "projectCompetitors",
  "projectDomainOverview",
  "projectTimeline",
  "projectRankTracker",
  "projectAlerts",
  "projectIntegrations",
  "projectGettingStarted",
  "projectCostEstimate",
  "projectInstall",
  "projectResearch",
  "projectSearchInsights",
  "setup",
  "shell",
  "shared",
] as const;
export type CoreNamespace = (typeof coreNamespaces)[number];

// Every active locale ships the same fragment file names, so the namespace registry
// is declared once and each locale contributes only its own static import map.
const coreNamespaceFragments = {
  account: ["account", "account-preferences"],
  auth: ["auth"],
  cloudImport: ["cloud-import"],
  emailPreferences: ["email-preferences"],
  instanceAdmin: ["instance-admin"],
  invite: ["invite"],
  onboarding: ["onboarding"],
  projectMarkets: ["project-markets"],
  projectSettingsAdvanced: ["project-settings-advanced"],
  projectSettingsDevelopers: ["project-settings-developers"],
  projectSettingsExperimental: ["project-settings-experimental"],
  projectSettingsGeneral: ["project-settings-general"],
  projectSettingsMigration: ["project-settings-migration"],
  projectSettingsNotifications: ["project-settings-notifications"],
  projectSettingsShell: ["project-settings-shell"],
  projectSettingsTeam: ["project-settings-team"],
  projectSettingsTracking: ["project-settings-tracking"],
  projectSettingsUsage: ["project-settings-usage"],
  projectAudit: ["project-audit"],
  projectDashboard: ["project-dashboard"],
  projectRuns: ["project-runs", "project-runs-rank-runs", "project-runs-schedules"],
  projectBacklinks: ["project-backlinks"],
  projectCompetitors: ["project-competitors"],
  projectDomainOverview: ["project-domain-overview"],
  projectTimeline: ["project-timeline"],
  projectRankTracker: [
    "project-rank-tracker",
    "project-rank-tracker-keyword-import",
    "project-rank-tracker-keyword-detail",
  ],
  projectAlerts: ["project-alerts"],
  projectIntegrations: ["project-integrations"],
  projectGettingStarted: ["project-getting-started"],
  projectCostEstimate: ["project-cost-estimate"],
  projectInstall: ["project-install"],
  projectResearch: ["project-research"],
  projectSearchInsights: ["project-search-insights"],
  setup: ["setup"],
  shell: ["shell"],
  shared: ["shared"],
} as const satisfies Record<CoreNamespace, readonly CoreFragmentFile[]>;

const coreCatalogLoaders: Record<ActiveLocale, CoreFragmentLoaders> = {
  en: coreFragmentsEn,
  "es-ES": coreFragmentsEsEs,
  ja: coreFragmentsJa,
  pl: coreFragmentsPl,
};

async function loadCoreNamespace<Namespace extends CoreNamespace>(
  locale: ActiveLocale,
  namespace: Namespace,
): Promise<Pick<CoreMessages, Namespace>> {
  const loaders = coreCatalogLoaders[locale];
  const fragments = await Promise.all(
    coreNamespaceFragments[namespace].map(async (fragment) => {
      const catalog = (await loaders[fragment]()).default;
      assertMessageCatalog(catalog);
      return catalog;
    }),
  );
  // The catalog checker generates CoreMessages from these same static JSON fragments.
  return mergeMessageCatalogs(...fragments) as Pick<CoreMessages, Namespace>;
}

/** Loads only the client namespaces requested by the current feature boundary. */
export async function loadCoreMessages<const Namespaces extends readonly CoreNamespace[]>(
  locale: string,
  namespaces: Namespaces,
): Promise<Pick<CoreMessages, Namespaces[number]>> {
  const selectedLocale = assertActiveLocale(locale);
  const messages = await Promise.all(
    namespaces.map((namespace) => loadCoreNamespace(selectedLocale, namespace)),
  );
  return mergeMessageCatalogs(...messages) as Pick<CoreMessages, Namespaces[number]>;
}
