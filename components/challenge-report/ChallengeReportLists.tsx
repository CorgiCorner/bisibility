"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatTile } from "@/components/ui/StatTile";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { UnavailableTile } from "./ChallengeReportTiles";
import { useReportFigure, useReportRound } from "./report-figures";

type Body = ChallengeReportBody;
type PageRow = { clicks: number; id: string; path: string; rank: number };

const providerCurrency = "USD";

function money(format: ReturnType<typeof useFormatter>, minor: number, currency: string) {
  const digits = currency === "JPY" ? 0 : 2;
  return format.number(minor / 10 ** digits, {
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  });
}

export function TopPagesTile({ tile }: Readonly<{ tile: Body["tiles"]["topPages"] }>) {
  const t = useTranslations("challengeReport");
  const figure = useReportFigure();
  const rows = useMemo<PageRow[]>(
    () =>
      tile.state === "ok"
        ? tile.pages.map((page, index) => ({ ...page, id: page.path, rank: index + 1 }))
        : [],
    [tile],
  );
  const columns = useMemo<DataTableColumn<PageRow>[]>(
    () => [
      {
        accessorKey: "rank",
        enableSorting: false,
        header: t("rank"),
        id: "rank",
        meta: { align: "end" },
        size: 48,
      },
      {
        accessorKey: "path",
        enableSorting: false,
        header: t("path"),
        id: "path",
        meta: { flex: 1 },
      },
      {
        accessorKey: "clicks",
        cell: ({ row }) => figure(row.original.clicks),
        enableSorting: false,
        header: t("clicks"),
        id: "clicks",
        meta: { align: "end" },
        size: 96,
      },
    ],
    [figure, t],
  );
  if (tile.state !== "ok") {
    return <UnavailableTile label={t("tiles.topPages")} reason={tile.reason} state={tile.state} />;
  }
  return (
    <StatTile
      label={t("tiles.topPages")}
      source={t("sources.search_console")}
      value=""
      valueNode={<span className="sr-only">{t("topPagesTable")}</span>}
    >
      <div className="-mx-4 -mb-4 min-w-0">
        <DataTable
          ariaLabel={t("topPagesTable")}
          bordered={false}
          columns={columns}
          density="compact"
          id="challenge-top-pages"
          onSortingChange={() => undefined}
          rows={rows}
          sorting={null}
        />
      </div>
    </StatTile>
  );
}

export function CostTile({ tile }: Readonly<{ tile: Body["tiles"]["cost"] }>) {
  const t = useTranslations("challengeReport");
  const format = useFormatter();
  const figure = useReportFigure();
  const round = useReportRound();
  if (tile.state !== "ok") {
    return <UnavailableTile label={t("tiles.cost")} reason={tile.reason} state={tile.state} />;
  }
  const currency = tile.currency;
  const amount = (minor: number, lineCurrency: string) => {
    const digits = lineCurrency === "JPY" ? 0 : 2;
    const major = minor / 10 ** digits;
    if (round && Math.abs(major) >= 1000) return figure(Math.round(major));
    return money(format, minor, lineCurrency);
  };
  const lines = [
    ...tile.subscriptions.map((line) => ({
      amount: amount(line.minor, line.currency),
      key: `sub-${line.currency}`,
      label: t("costSubscriptions"),
    })),
    ...(tile.rankChecksMinor > 0
      ? [
          {
            amount: amount(tile.rankChecksMinor, providerCurrency),
            key: "rank",
            label: t("costRankChecks"),
          },
        ]
      : []),
    ...(tile.aiAnswersMinor > 0
      ? [{ amount: amount(tile.aiAnswersMinor, providerCurrency), key: "ai", label: t("costAi") }]
      : []),
    ...tile.other.map((line) => ({
      amount: amount(line.minor, line.currency),
      key: `other-${line.currency}`,
      label: t("costOther"),
    })),
  ];
  const total = currency && tile.totalMinor !== null ? amount(tile.totalMinor, currency) : null;
  return (
    <StatTile
      caption={
        total && tile.perDayMinor !== null
          ? t("perDayAmount", { amount: amount(tile.perDayMinor, currency ?? providerCurrency) })
          : undefined
      }
      label={t("tiles.cost")}
      source={t("sources.usage")}
      value={total ?? t("costMixed")}
      empty={!total}
    >
      {lines.length ? (
        <div className="grid gap-1">
          {lines.map((line) => (
            <p
              className="m-0 flex items-baseline justify-between gap-3 text-ui-caption"
              key={line.key}
            >
              <span>{line.label}</span>
              <span className="tabular-nums">{line.amount}</span>
            </p>
          ))}
        </div>
      ) : null}
    </StatTile>
  );
}
