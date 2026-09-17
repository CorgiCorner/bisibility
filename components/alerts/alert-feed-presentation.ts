import type { TriggeredAlertFeedView } from "@/lib/alerts/alert-data";
import type { FeedFacetOptions, FeedRowMetadata } from "@/lib/feeds/facets";
import type { useTranslations } from "next-intl";

type FeedTranslations = ReturnType<typeof useTranslations<"projectAlerts.feed">>;

export type AlertFeedCta =
  | "compare_serp"
  | "open_keyword"
  | "set_target_url"
  | "set_winner_url"
  | "view_serp";

export type PresentedAlertFeedView = {
  action: string;
  ctas: AlertFeedCta[];
  current: string;
  deliveryAttempts: {
    channel: string;
    endpoint: string | null;
    error: string | null;
    status: string;
    when: string;
  }[];
  headline: string;
  keyword: string;
  metadata: FeedRowMetadata;
  previous: string;
  when: string;
};

function positionLabel(position: number | null, t: FeedTranslations) {
  return position === null ? t("noRank") : t("rankPosition", { position });
}

function severityLabel(severity: TriggeredAlertFeedView["severity"], t: FeedTranslations) {
  if (severity === "urgent") return t("severityUrgent");
  if (severity === "warning") return t("severityWarning");
  return t("severityInfo");
}

function metadataFor(alert: TriggeredAlertFeedView, t: FeedTranslations): FeedRowMetadata {
  return {
    engine: t("metadataEngineGoogle"),
    ...(alert.feedMeta?.language ? { language: alert.feedMeta.language } : {}),
    ...(alert.feedMeta?.market ? { market: alert.feedMeta.market } : {}),
    severity: severityLabel(alert.severity, t),
    source: t("metadataSourceRank"),
  };
}

/** Only generated enum labels are translated. Project market and language labels stay data. */
export function presentAlertFeedFacetOptions(
  options: FeedFacetOptions,
  t: FeedTranslations,
): FeedFacetOptions {
  return {
    ...options,
    ...(options.engine
      ? {
          engine: options.engine.map((option) =>
            option.value === "google" ? { ...option, label: t("metadataEngineGoogle") } : option,
          ),
        }
      : {}),
    ...(options.module
      ? {
          module: options.module.map((option) =>
            option.value === "rank" ? { ...option, label: t("metadataModuleRank") } : option,
          ),
        }
      : {}),
    ...(options.severity
      ? {
          severity: options.severity.map((option) => {
            if (option.value === "urgent") return { ...option, label: t("severityUrgent") };
            if (option.value === "warning") return { ...option, label: t("severityWarning") };
            if (option.value === "info") return { ...option, label: t("severityInfo") };
            return option;
          }),
        }
      : {}),
  };
}

function relativeTime(value: string, t: FeedTranslations, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return t("justNow");

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t("hoursAgo", { count: hours });

  return t("daysAgo", { count: Math.floor(hours / 24) });
}

function headline(alert: TriggeredAlertFeedView, keyword: string, t: FeedTranslations) {
  const { condition } = alert;
  if (alert.conditionType === "enters_top_n" && condition.topN !== null) {
    return t("headlineEntersTopN", { keyword, position: condition.topN });
  }
  if (alert.conditionType === "exits_top_n" && condition.topN !== null) {
    return t("headlineExitsTopN", { keyword, position: condition.topN });
  }
  if (alert.conditionType === "threshold" && condition.thresholdPosition !== null) {
    return t("headlineThreshold", { keyword, position: condition.thresholdPosition });
  }
  if (alert.conditionType === "change_pct" && condition.changePct !== null) {
    return t("headlineChangePct", { keyword, percent: condition.changePct });
  }
  if (alert.conditionType === "ctr_drop" && condition.changePct !== null) {
    return t("headlineCtrDrop", { keyword, percent: condition.changePct });
  }
  if (alert.conditionType === "position_drop" && condition.dropPositions !== null) {
    return t("headlinePositionDrop", { keyword, positions: condition.dropPositions });
  }
  if (alert.conditionType === "downtrend") return t("headlineDowntrend", { keyword });
  if (alert.conditionType === "competitor_overtake" && condition.competitorDomain) {
    return t("headlineCompetitor", { domain: condition.competitorDomain, keyword });
  }
  if (alert.conditionType === "url_mismatch") return t("headlineUrlMismatch", { keyword });
  if (alert.conditionType === "serp_feature" && condition.serpFeature) {
    return t("headlineSerpFeature", { feature: condition.serpFeature, keyword });
  }
  return t("headlineUnknown", { keyword });
}

function action(alert: TriggeredAlertFeedView, t: FeedTranslations) {
  if (alert.conditionType === "enters_top_n") return t("actionEntersTopN");
  if (alert.conditionType === "serp_feature") return t("actionSerpFeature");
  if (alert.conditionType === "competitor_overtake") return t("actionCompetitor");
  if (alert.conditionType === "position_drop") return t("actionPositionDrop");
  if (alert.conditionType === "ctr_drop") return t("actionCtrDrop");
  if (alert.conditionType === "downtrend") return t("actionDowntrend");
  if (alert.conditionType === "url_mismatch") return t("actionUrlMismatch");
  return t("actionDefault");
}

function ctas(alert: TriggeredAlertFeedView): AlertFeedCta[] {
  if (alert.conditionType === "competitor_overtake") return ["compare_serp", "open_keyword"];
  if (alert.conditionType === "serp_feature") return ["view_serp", "open_keyword"];
  return ["open_keyword", "view_serp"];
}

function attemptStatus(status: string, t: FeedTranslations) {
  if (status === "failed") return t("attemptStatusFailed");
  if (status === "pending") return t("attemptStatusPending");
  if (status === "sent") return t("attemptStatusSent");
  if (status === "skipped") return t("attemptStatusSkipped");
  return t("attemptStatusUnknown", { status });
}

export function presentAlertFeed(
  alert: TriggeredAlertFeedView,
  t: FeedTranslations,
  now = Date.now(),
): PresentedAlertFeedView {
  const keyword = alert.keyword ?? t("unknownKeyword");
  return {
    action: action(alert, t),
    ctas: ctas(alert),
    current: positionLabel(alert.afterPosition, t),
    deliveryAttempts: alert.deliveryAttempts.map((attempt) => ({
      channel: attempt.channel,
      endpoint:
        attempt.webhookEndpoint?.label ??
        (attempt.channel === "webhook" ? t("deletedEndpoint") : null),
      error: attempt.error,
      status: attemptStatus(attempt.status, t),
      when: relativeTime(attempt.attemptedAt, t, now),
    })),
    headline: headline(alert, keyword, t),
    keyword,
    metadata: metadataFor(alert, t),
    previous: positionLabel(alert.beforePosition, t),
    when: relativeTime(alert.firedAt, t, now),
  };
}
