"use client";

import { StatTile } from "@/components/ui/StatTile";
import type { MoneyLine } from "@/lib/cost-items/tiles";
import { useTranslations } from "next-intl";
import { useMinorMoney } from "./cost-money";

export function CostTiles({
  tiles,
}: Readonly<{
  tiles: {
    custom: MoneyLine[];
    provider: MoneyLine[];
    seo: MoneyLine[];
    subscriptions: MoneyLine[];
  };
}>) {
  const t = useTranslations("projectUsageCosts");
  const money = useMinorMoney();
  const items = [
    ["seo", tiles.seo, "seoHint"],
    ["provider", tiles.provider, "providerHint"],
    ["subscriptions", tiles.subscriptions, "subscriptionsHint"],
    ["custom", tiles.custom, "customHint"],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([key, lines, hint]) => (
        <StatTile
          caption={lines.length ? t(`tiles.${hint}`) : t("tiles.empty")}
          empty={!lines.length}
          key={key}
          label={t(`tiles.${key}`)}
          value={t("dash")}
          valueNode={
            lines.length ? (
              <span className="flex flex-col font-sans tabular-nums text-ui-h1">
                {lines.map((line) => (
                  <span key={line.currency}>{money(line.currency, line.minor)}</span>
                ))}
              </span>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
