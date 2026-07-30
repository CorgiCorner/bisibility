import type { BacklinksHistoryMonth } from "@/lib/backlinks/types";

type SummaryTrend = {
  backlinks: number[];
  referringDomains: number[];
};

function monthNet(month: BacklinksHistoryMonth, kind: "links" | "domains") {
  return kind === "links"
    ? month.newLinks - month.lostLinks
    : month.newReferringDomains - month.lostReferringDomains;
}

function trendFromCurrent(
  history: readonly BacklinksHistoryMonth[],
  current: number,
  kind: "links" | "domains",
) {
  let value = current;
  const reversed = [...history].reverse().map((month) => {
    const monthEnd = value;
    value -= monthNet(month, kind);
    return monthEnd;
  });
  return [value, ...reversed.reverse()];
}

export function summaryTrends(
  history: readonly BacklinksHistoryMonth[],
  backlinks: number,
  referringDomains: number,
): SummaryTrend {
  return {
    backlinks: trendFromCurrent(history, backlinks, "links"),
    referringDomains: trendFromCurrent(history, referringDomains, "domains"),
  };
}

export function latestHistoryDeltas(history: readonly BacklinksHistoryMonth[]) {
  const latest = history.at(-1);
  return {
    backlinks: latest ? monthNet(latest, "links") : 0,
    referringDomains: latest ? monthNet(latest, "domains") : 0,
  };
}

function monthName(month: string) {
  const parsed = new Date(`${month}-01T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? month
    : new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(parsed);
}

export function historyFooter(history: readonly BacklinksHistoryMonth[]) {
  const net = history.reduce((sum, month) => sum + month.newLinks - month.lostLinks, 0);
  const biggestLoss = history.reduce<BacklinksHistoryMonth | null>(
    (biggest, month) => (!biggest || month.lostLinks > biggest.lostLinks ? month : biggest),
    null,
  );
  return {
    biggestLoss: biggestLoss?.lostLinks ?? 0,
    biggestLossMonth: biggestLoss ? monthName(biggestLoss.month) : "n/a",
    net,
  };
}

export function signedNumber(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}
