import type { Device, SignalSource } from "@/lib/generated/prisma/client";
import type { TimelineFilterKey } from "@/lib/queries/timeline";
import type { useTranslations } from "next-intl";

type TimelineDataTranslations = ReturnType<typeof useTranslations<"projectTimeline.data">>;

export type TimelinePresentation = {
  actorSystem: () => string;
  badgeTestEvent: () => string;
  badgeUrlChanged: () => string;
  byActor: (actor: string) => string;
  detailDeploymentId: () => string;
  detailEnvironment: () => string;
  detailPaths: () => string;
  detailProvider: () => string;
  deviceLabel: (device: Device) => string;
  filterLabel: (key: TimelineFilterKey) => string;
  keyword: (keyword: string) => string;
  rankFirstNotFound: (depth: number) => string;
  rankFirstPosition: (position: number) => string;
  rankPosition: (before: number, after: number) => string;
  rankPositionNotFound: (before: number, depth: number) => string;
  relativeDay: (day: "today" | "yesterday") => string;
  sitemapChange: (added: number, removed: number, changed: number) => string;
  sourceLabel: (source: SignalSource) => string;
  titleDeployCompleted: () => string;
  titleManualNote: () => string;
  titlePageChanged: () => string;
  titleRankingUrlChanged: () => string;
  titleSearchEngineUpdate: () => string;
  titleSitemapChanged: () => string;
  titleUnknown: (type: string) => string;
  titleUrlDeindexed: () => string;
  titleUrlIndexed: () => string;
};

function filterLabel(key: TimelineFilterKey, t: TimelineDataTranslations) {
  switch (key) {
    case "all":
      return t("filterAll");
    case "rankings":
      return t("filterRankings");
    case "pages":
      return t("filterPages");
    case "deploys":
      return t("filterDeploys");
    case "notes":
      return t("filterNotes");
  }
}

function sourceLabel(source: SignalSource, t: TimelineDataTranslations) {
  switch (source) {
    case "api":
      return t("sourceApi");
    case "cms":
      return t("sourceCms");
    case "deploy":
      return t("sourceDeploy");
    case "manual":
      return t("sourceManual");
    case "rank_tracker":
      return t("sourceRankTracker");
    case "search_analytics":
      return t("sourceSearchAnalytics");
    case "search_engine_status":
      return t("sourceSearchEngineStatus");
    case "sitemap":
      return t("sourceSitemap");
    case "url_inspection":
      return t("sourceUrlInspection");
  }
}

export function createTimelinePresentation(t: TimelineDataTranslations): TimelinePresentation {
  return {
    actorSystem: () => t("actorSystem"),
    badgeTestEvent: () => t("badgeTestEvent"),
    badgeUrlChanged: () => t("badgeUrlChanged"),
    byActor: (actor) => t("byActor", { actor }),
    detailDeploymentId: () => t("detailDeploymentId"),
    detailEnvironment: () => t("detailEnvironment"),
    detailPaths: () => t("detailPaths"),
    detailProvider: () => t("detailProvider"),
    deviceLabel: (device) => (device === "mobile" ? t("deviceMobile") : t("deviceDesktop")),
    filterLabel: (key) => filterLabel(key, t),
    keyword: (keyword) => t("keyword", { keyword }),
    rankFirstNotFound: (depth) => t("rankFirstNotFound", { depth }),
    rankFirstPosition: (position) => t("rankFirstPosition", { position }),
    rankPosition: (before, after) => t("rankPosition", { after, before }),
    rankPositionNotFound: (before, depth) => t("rankPositionNotFound", { before, depth }),
    relativeDay: (day) => (day === "today" ? t("today") : t("yesterday")),
    sitemapChange: (added, removed, changed) => t("sitemapChange", { added, changed, removed }),
    sourceLabel: (source) => sourceLabel(source, t),
    titleDeployCompleted: () => t("titleDeployCompleted"),
    titleManualNote: () => t("titleManualNote"),
    titlePageChanged: () => t("titlePageChanged"),
    titleRankingUrlChanged: () => t("titleRankingUrlChanged"),
    titleSearchEngineUpdate: () => t("titleSearchEngineUpdate"),
    titleSitemapChanged: () => t("titleSitemapChanged"),
    titleUnknown: (type) => t("titleUnknown", { type }),
    titleUrlDeindexed: () => t("titleUrlDeindexed"),
    titleUrlIndexed: () => t("titleUrlIndexed"),
  };
}
