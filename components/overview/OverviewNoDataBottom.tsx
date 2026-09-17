"use client";

import { DataSourceMetrics } from "@/components/overview/DataSourcePanel";
import { DataSourceStatusBadge } from "@/components/overview/DataSourceStatusBadge";
import { highlightNoteCopy, highlightPositionCopy } from "@/components/overview/HighlightLists";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { appPath } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DataSourceHealth, HighlightRow } from "./types";

export function DataSourceNoDataPanel({ health }: Readonly<{ health: DataSourceHealth }>) {
  const t = useTranslations("projectDashboard.dataSource");
  return (
    <Card size="md" style={{ borderRadius: UI_RADIUS_ROLES.card, padding: "18px 20px" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14.5px] font-semibold leading-normal text-fg">{t("title")}</div>
          <div className="mt-0.5 font-sans tabular-nums text-[11px] leading-normal text-fg-muted">
            {t("description")}
          </div>
        </div>
        <DataSourceStatusBadge status={health.status} />
      </div>
      <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4.5 gap-y-3.5">
        <DataSourceMetrics health={health} />
      </div>
    </Card>
  );
}

export function RecentlyAddedCard({
  projectRef,
  rows,
}: Readonly<{ projectRef: string; rows: HighlightRow[] }>) {
  const t = useTranslations("projectDashboard.highlights");
  return (
    <Card
      className="overflow-hidden"
      size="md"
      style={{ borderRadius: UI_RADIUS_ROLES.card, padding: 0 }}
    >
      <div className="px-4.5 pb-3 pt-[15px]">
        <div className="flex items-center text-sm font-semibold leading-normal text-fg">
          {t("recentlyAddedTitle")}
        </div>
        <div className="mt-[3px] font-sans tabular-nums text-[10.5px] leading-normal text-fg-muted">
          {t("recentlyAddedDescription")}
        </div>
      </div>
      {rows.map((row) => (
        <Link
          className="flex items-center justify-between gap-2.5 border-t border-border px-4.5 py-[11px] hover:bg-bg-sunken"
          href={appPath(projectRef, "rank-tracker")}
          key={row.id}
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-normal text-fg">
              {row.keyword}
            </span>
            <span className="mt-px block truncate font-sans tabular-nums text-[10.5px] leading-normal text-fg-muted">
              {highlightNoteCopy(t, row.note)}
            </span>
          </span>
          <span className="flex-none font-sans tabular-nums text-[11.5px] leading-normal text-fg-muted">
            {highlightPositionCopy(t, row)}
          </span>
        </Link>
      ))}
    </Card>
  );
}

export function ViewAllKeywordsButton({ projectRef }: Readonly<{ projectRef: string }>) {
  const t = useTranslations("projectDashboard.dashboard");
  return (
    <Button
      className="self-end"
      component="a"
      endIcon={<CaretRight size={15} weight="regular" />}
      href={appPath(projectRef, "rank-tracker")}
      style={{
        alignSelf: "flex-start",
        "--control-hover-border-color": "var(--accent)",
        "--control-hover-color": "var(--accent-text)",
        gap: "7px",
      }}
      variant="secondary"
    >
      {t("viewAllKeywords")}
    </Button>
  );
}
