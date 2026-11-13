"use client";

import { Card } from "@/components/ui/Card";
import type { SeoCostWidget } from "@/lib/conversions/surface";
import { minorDigits } from "@/lib/cost-items/money";
import type { MoneyLine } from "@/lib/cost-items/tiles";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { useFormatter, useTranslations } from "next-intl";
import { DashboardWidgetLink } from "./DashboardWidgetLink";

function money(
  line: MoneyLine | undefined,
  currency: string,
  format: ReturnType<typeof useFormatter>,
) {
  const minor = line?.minor ?? 0;
  const digits = minorDigits(currency);
  return format.number(minor / 10 ** digits, {
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  });
}

export function SeoCostCard({
  model,
  projectRef,
}: Readonly<{ model: SeoCostWidget | null; projectRef: ProjectRef }>) {
  const t = useTranslations("projectDashboard.seoCost");
  const format = useFormatter();
  const tiles = model?.kind === "ready" ? model.tiles : null;
  return (
    <Card>
      <h2 className="m-0 text-ui-section font-semibold">{t("title")}</h2>
      {model?.kind === "error" || model == null ? (
        <p className="m-0 mt-3 text-ui-caption text-fg-muted">{t("unavailable")}</p>
      ) : tiles && tiles.seo.length === 0 ? (
        <p className="m-0 mt-3 text-ui-caption text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {tiles?.seo.map((total) => {
            const currency = total.currency;
            return (
              <div className="flex flex-col gap-1 text-ui-caption" key={currency}>
                <p className="m-0 font-semibold text-fg">
                  {t("total", { value: money(total, currency, format) })}
                </p>
                <p className="m-0 text-fg-muted">
                  {t("split", {
                    oneOff: money(
                      tiles.custom.find((line) => line.currency === currency),
                      currency,
                      format,
                    ),
                    operations: money(
                      tiles.provider.find((line) => line.currency === currency),
                      currency,
                      format,
                    ),
                    subscriptions: money(
                      tiles.subscriptions.find((line) => line.currency === currency),
                      currency,
                      format,
                    ),
                  })}
                </p>
              </div>
            );
          })}
          <DashboardWidgetLink href={appPath(projectRef, "usage")}>
            {t("openUsage")}
          </DashboardWidgetLink>
        </div>
      )}
    </Card>
  );
}
