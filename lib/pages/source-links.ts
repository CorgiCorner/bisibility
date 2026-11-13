import { appPath, rankTrackerTabPath } from "@/lib/routing/app-path";
import type { ProjectPageColumnKind } from "./types";

const CONNECT_PROVIDER: Partial<Record<ProjectPageColumnKind, string>> = {
  ai_visibility: "dataforseo",
  analytics: "ga4",
  page_indexing: "gsc",
  pagespeed: "pagespeed",
  search_console: "gsc",
};

export function projectPageColumnConnectHref(projectId: string, kind: ProjectPageColumnKind) {
  const path = appPath(projectId, "providers");
  const provider = CONNECT_PROVIDER[kind];
  return provider ? `${path}?connect=${encodeURIComponent(provider)}` : path;
}

/** Rank Tracker search matches the keyword target URL, so this is a real filtered view. */
export function projectPageKeywordHref(projectId: string, url: string) {
  return `${rankTrackerTabPath(projectId, "tracked")}?q=${encodeURIComponent(url)}`;
}
