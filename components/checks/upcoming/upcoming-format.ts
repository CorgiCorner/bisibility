import type { UpcomingBlockedGroup, UpcomingBlockReason } from "@/lib/checks/contract";
import { centsToDollars } from "@/lib/format/currency";

const countFormatter = new Intl.NumberFormat("en-US");
const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});
const capFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  style: "currency",
});

export function formatCount(count: number) {
  return countFormatter.format(count);
}

export function formatCheckCount(count: number) {
  return `${formatCount(count)} ${count === 1 ? "check" : "checks"}`;
}

export function formatKeywordCount(count: number) {
  return `${formatCount(count)} ${count === 1 ? "keyword" : "keywords"}`;
}

export function formatEstimatedCost(cents: number) {
  return `~${moneyFormatter.format(centsToDollars(cents))}`;
}

export function formatCap(cents: number) {
  return capFormatter.format(centsToDollars(cents));
}

export function formatForecastDate(isoDate: string) {
  const dateOnly = isoDate.slice(0, 10);
  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function findBlockedGroup(blocked: UpcomingBlockedGroup[], reason: UpcomingBlockReason) {
  return blocked.find((group) => group.reason === reason);
}

export function fuzzySampleTime(
  nextCheckAt: string,
  dayLabel: string,
  now: Date,
  timeZone: string,
) {
  const next = new Date(nextCheckAt);
  if (dayLabel === "Today") {
    const hours = Math.max(1, Math.round((next.getTime() - now.getTime()) / 3_600_000));
    return `~${hours}h`;
  }

  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone,
  })
    .formatToParts(next)
    .find((part) => part.type === "hour")?.value;

  return `~${hour ?? "00"}:00`;
}

export function blockedChipLabel(blocked: UpcomingBlockedGroup[]) {
  const labels: string[] = [];
  const noProvider = findBlockedGroup(blocked, "no_provider");
  const migrationHold = findBlockedGroup(blocked, "migration_hold");
  const budgetExhausted = findBlockedGroup(blocked, "budget_exhausted");

  if (noProvider) labels.push(`${formatCount(noProvider.keywordCount)} will never run`);
  if (migrationHold) labels.push(`${formatCount(migrationHold.keywordCount)} on hold`);
  if (budgetExhausted) labels.push(`${formatCount(budgetExhausted.keywordCount)} over budget`);

  return labels.join(" · ");
}
