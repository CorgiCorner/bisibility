import type { Prisma } from "@/lib/generated/prisma/client";
import { type CtrDropMetrics, ctrDropSummary } from "./ctr-drop";
import { type AlertTrendCheck, downtrendSummary } from "./downtrend";
import { positionDropAmount } from "./position-drop";
import type { AlertConditionTypeInput } from "./schema";
import type { AlertSeverity } from "./severity";

type AlertPayloadRule = {
  changePct: unknown;
  competitorDomain: string | null;
  conditionType: AlertConditionTypeInput;
  dropPositions: number | null;
  serpFeature: string | null;
  severity: AlertSeverity;
  thresholdPosition: number | null;
  topN: number | null;
};

type AlertPayloadSnapshot = {
  ctrDropMetrics?: CtrDropMetrics | null;
  position: number | null;
  rankingUrl?: string | null;
  recentChecks?: AlertTrendCheck[];
  targetUrl?: string | null;
};

function numberValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPosition(position: number | null) {
  return position ? `#${position}` : "No rank";
}

function formatPlainPosition(position: number | null) {
  return position === null ? "No rank" : String(position);
}

function headlineFor(
  rule: AlertPayloadRule,
  keyword: string,
  before: AlertPayloadSnapshot,
  after: AlertPayloadSnapshot,
) {
  if (rule.conditionType === "enters_top_n") {
    return `${keyword} entered the top ${rule.topN}`;
  }
  if (rule.conditionType === "exits_top_n") {
    return `${keyword} exited the top ${rule.topN}`;
  }
  if (rule.conditionType === "threshold") {
    return `${keyword} crossed below #${rule.thresholdPosition}`;
  }
  if (rule.conditionType === "change_pct") {
    return `${keyword} moved by ${numberValue(rule.changePct)}%`;
  }
  if (rule.conditionType === "ctr_drop") {
    const summary = ctrDropSummary(after.ctrDropMetrics, rule.changePct);
    return summary
      ? `CTR dropped ${Math.round(summary.decreasePct)}% for ${keyword}`
      : "CTR dropped";
  }
  if (rule.conditionType === "position_drop") {
    const amount = positionDropAmount(before.position, after.position) ?? rule.dropPositions;
    return `Dropped ${amount} positions (${formatPlainPosition(before.position)} \u2192 ${formatPlainPosition(after.position)})`;
  }
  if (rule.conditionType === "downtrend") {
    const summary = downtrendSummary(after.recentChecks);
    return summary
      ? `Downtrend: declined in ${summary.declines} of last ${summary.windowSize} checks (${summary.oldest} \u2192 ${summary.newest})`
      : "Downtrend detected";
  }
  if (rule.conditionType === "competitor_overtake") {
    return `${rule.competitorDomain} overtook ${keyword}`;
  }
  if (rule.conditionType === "url_mismatch") {
    return "Ranking URL differs from the target URL";
  }
  return `${keyword} gained ${rule.serpFeature}`;
}

function actionFor(conditionType: AlertConditionTypeInput) {
  if (conditionType === "enters_top_n") {
    return "Momentum: review internal links and protect the gain.";
  }
  if (conditionType === "serp_feature") {
    return "Inspect the SERP feature and adjust the page snippet if needed.";
  }
  if (conditionType === "competitor_overtake") {
    return "Compare the competing result against your ranking page.";
  }
  if (conditionType === "position_drop") {
    return "Inspect the dropped page and compare the latest SERP.";
  }
  if (conditionType === "ctr_drop") {
    return "Review the search snippet and query intent in Google Search Console.";
  }
  if (conditionType === "downtrend") {
    return "Review the last five checks and prioritize the page if the decline continues.";
  }
  if (conditionType === "url_mismatch") {
    return "Review the ranking page against the target URL.";
  }
  return "Review the page that moved and check the latest SERP.";
}

function ctasFor(conditionType: AlertConditionTypeInput) {
  if (conditionType === "competitor_overtake") {
    return ["Compare SERP", "Open keyword"];
  }
  if (conditionType === "serp_feature") {
    return ["View SERP", "Open keyword"];
  }
  return ["Open keyword", "View SERP"];
}

function payloadPositions(
  conditionType: AlertConditionTypeInput,
  before: AlertPayloadSnapshot,
  after: AlertPayloadSnapshot,
) {
  if (conditionType === "ctr_drop") {
    const summary = ctrDropSummary(after.ctrDropMetrics, 0.0001);
    if (summary) {
      const percent = (value: number) => `${(value * 100).toFixed(1)}% CTR`;
      return { current: percent(summary.currentCtr), previous: percent(summary.baselineCtr) };
    }
  }
  const summary = conditionType === "downtrend" ? downtrendSummary(after.recentChecks) : null;
  return summary
    ? { current: formatPosition(summary.newest), previous: formatPosition(summary.oldest) }
    : { current: formatPosition(after.position), previous: formatPosition(before.position) };
}

export function alertPayload(
  rule: AlertPayloadRule,
  keyword: { text: string },
  before: AlertPayloadSnapshot,
  after: AlertPayloadSnapshot,
) {
  const rankingUrl = after.rankingUrl?.trim();
  const targetUrl = after.targetUrl?.trim();
  const positions = payloadPositions(rule.conditionType, before, after);

  return {
    action: actionFor(rule.conditionType),
    conditionType: rule.conditionType,
    ctas: ctasFor(rule.conditionType),
    current: positions.current,
    headline: headlineFor(rule, keyword.text, before, after),
    previous: positions.previous,
    severity: rule.severity,
    ...(rule.conditionType === "url_mismatch" && rankingUrl && targetUrl
      ? { rankingUrl, targetUrl }
      : {}),
  } satisfies Prisma.JsonObject;
}
