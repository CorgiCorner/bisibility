import { appPath } from "@/lib/routing/app-path";

export const settingsSearchEntries = [
  {
    label: "Default location",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "tracking-location",
    keywords: "country city market region language",
  },
  {
    label: "Check frequency",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "tracking-frequency",
    keywords: "schedule manual daily weekly monthly cron automatic",
  },
  {
    label: "Stop checks at first match",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "tracking-stop-on-match",
    keywords: "domain first result depth cost",
  },
  {
    label: "Experimental features",
    section: "Experimental",
    path: "settings/experimental",
    anchor: "",
    keywords: "modules preview beta alpha features",
  },
  {
    label: "Project management",
    section: "Advanced",
    path: "settings/advanced",
    anchor: "",
    keywords: "backup export migration self host delete project audit history",
  },
  {
    label: "Project name",
    section: "General",
    path: "settings/general",
    anchor: "general-project-name",
    keywords: "rename project workspace",
  },
  {
    label: "Website domain",
    section: "General",
    path: "settings/general",
    anchor: "general-project-domain",
    keywords: "website url change domain",
  },
  {
    label: "Tags and segments",
    section: "General",
    path: "settings/general",
    anchor: "tags-segments",
    keywords: "organize keywords labels",
  },
  {
    label: "URL inspection limit",
    section: "Data sources",
    path: "settings/data-sources",
    anchor: "url-inspection",
    keywords: "daily quota indexing google search console",
  },
  {
    label: "Search data sync",
    section: "Data sources",
    path: "settings/data-sources",
    anchor: "search-data-sync",
    keywords: "gsc retention months import pause pace",
  },
  {
    label: "Default SERP depth",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "tracking-depth",
    keywords: "top 10 20 50 100 rank check results",
  },
  {
    label: "Default device",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "tracking-device",
    keywords: "mobile desktop",
  },
  {
    label: "Schedule timezone",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "tracking-timezone",
    keywords: "time zone clock utc",
  },
  {
    label: "Domain matching",
    section: "Tracking",
    path: "settings/tracking",
    anchor: "match-scope",
    keywords: "subdomain exact root url scope",
  },
  {
    label: "Competitors and brand aliases",
    section: "Competitors",
    path: "settings/competitors",
    anchor: "",
    keywords: "competition mentions citations",
  },
  {
    label: "Notification channels",
    section: "Notifications",
    path: "settings/notifications",
    anchor: "notification-preferences-form",
    keywords: "email slack webhook alerts digest",
  },
  {
    label: "Members and invitations",
    section: "Team",
    path: "settings/team",
    anchor: "",
    keywords: "users invite role access permissions",
  },
  {
    label: "Application plan",
    section: "Billing",
    path: "settings/billing",
    anchor: "plan",
    keywords: "billing price subscription hosted beta self hosted",
  },
  {
    label: "API keys",
    section: "Developers",
    path: "settings/developers",
    anchor: "api-keys",
    keywords: "api key token access credentials",
  },
  {
    label: "Deploy webhooks",
    section: "Developers",
    path: "settings/developers",
    anchor: "deploy-webhooks",
    keywords: "endpoint secret deploy hook",
  },
  {
    label: "Provider connections",
    section: "Integrations / Connections",
    path: "integrations",
    anchor: "all-providers",
    keywords: "connect disconnect credentials dataforseo serpapi google search console analytics",
  },
  {
    label: "Provider budgets and usage",
    section: "Integrations / Usage",
    path: "integrations",
    query: "tab=usage",
    anchor: "provider-usage",
    keywords: "allocation spending spend cost balance quota credits searches limit",
  },
] as const;

export type SettingsSearchEntry = (typeof settingsSearchEntries)[number];

export function settingsSearchHref(projectRef: string, entry: SettingsSearchEntry) {
  const query = "query" in entry ? `?${entry.query}` : "";
  return `${appPath(projectRef, ...entry.path.split("/"))}${query}${entry.anchor ? `#${entry.anchor}` : ""}`;
}

export function findSettings(query: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const labelMatches = (entry: SettingsSearchEntry) =>
    words.every((word) => entry.label.toLocaleLowerCase().includes(word));
  return settingsSearchEntries
    .filter((entry) => {
      const text = `${entry.label} ${entry.section} ${entry.keywords}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((left, right) => Number(labelMatches(right)) - Number(labelMatches(left)));
}
