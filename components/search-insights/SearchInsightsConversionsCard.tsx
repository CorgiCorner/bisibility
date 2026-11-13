"use client";

import {
  ConversionConnectLink,
  ConversionSourceSwitch,
} from "@/components/conversions/ConversionSourceSwitch";
import { Button } from "@/components/ui/Button";
import type { ConversionReport } from "@/lib/conversions/surface";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { useFormatter, useTranslations } from "next-intl";

export function SearchInsightsConversionsCard({
  projectId,
  report,
}: Readonly<{ projectId: string; report: ConversionReport }>) {
  const t = useTranslations("projectSearchInsights.copy");
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-ui-section font-semibold">{t("conversionsByPage")}</h2>
        {report.kind === "ready" && report.selection.showSwitch && report.selection.selected ? (
          <ConversionSourceSwitch
            options={report.selection.options}
            value={report.selection.selected}
          />
        ) : null}
      </div>
      {report.kind === "connect" ? (
        <ConversionConnectLink projectId={projectId} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-2 text-ui-micro uppercase tracking-wide text-fg-muted">
              <span>{t("conversionsColumnPage")}</span>
              <span className="text-end">{t("conversionsColumnSessions")}</span>
              <span className="text-end">{t("conversionsColumnConversions")}</span>
              <span className="text-end">{t("conversionsColumnRate")}</span>
            </div>
            {report.pages.length === 0 ? (
              <p className="m-0 text-ui-caption text-fg-muted">{t("conversionsEmpty")}</p>
            ) : (
              report.pages.map((page) => (
                <div className="grid grid-cols-4 gap-2 text-ui-caption" key={page.path}>
                  <span className="min-w-0 truncate font-sans" title={page.path}>
                    {page.path}
                  </span>
                  <span className="text-end tabular-nums">
                    {page.sessions == null ? "-" : format.number(page.sessions)}
                  </span>
                  <span className="text-end tabular-nums">{format.number(page.conversions)}</span>
                  <span className="text-end tabular-nums">
                    {page.rate == null
                      ? "-"
                      : format.number(page.rate, {
                          maximumFractionDigits: 1,
                          style: "percent",
                        })}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <Button
              href={`${appPath(asProjectRef(projectId), "pages")}?conv=${report.source}`}
              size="sm"
              variant="secondary"
            >
              {t("openInPages")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
