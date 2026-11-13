"use client";

import { compactBadgeClassName } from "@/components/ui/Pill";
import { revealTab, TabStrip, tabCountClassName, tabTriggerClassName } from "@/components/ui/Tabs";
import { searchConsoleTabHref } from "@/lib/search-index/ui-model";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

export function SearchConsoleTabs({
  active,
  base,
  query,
  notIndexed,
}: Readonly<{
  active: "page-indexing" | "performance" | "sitemaps";
  base: string;
  query: string;
  notIndexed: number | null;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  return (
    <nav aria-label={t("navigation")} className="min-w-0">
      <TabStrip bordered>
        <div className="flex w-max gap-1">
          <Link
            aria-current={active === "performance" ? "page" : undefined}
            className={tabTriggerClassName(active === "performance")}
            href={searchConsoleTabHref(base, query, "performance")}
            ref={active === "performance" ? revealTab : undefined}
          >
            {t("performance")}
          </Link>
          <Link
            aria-current={active === "page-indexing" ? "page" : undefined}
            aria-label={
              notIndexed === null
                ? undefined
                : t("notIndexedCount", { maturity: t("maturityBadge"), count: notIndexed })
            }
            className={tabTriggerClassName(active === "page-indexing")}
            href={searchConsoleTabHref(base, query, "page-indexing")}
            ref={active === "page-indexing" ? revealTab : undefined}
          >
            <span>{t("title")}</span>{" "}
            <span className={compactBadgeClassName}>{t("maturityBadge")}</span>
            {notIndexed !== null ? (
              <span className={tabCountClassName} title={t("groups.not_indexed")}>
                {format.number(notIndexed)}
              </span>
            ) : null}
          </Link>
          <Link
            aria-current={active === "sitemaps" ? "page" : undefined}
            className={tabTriggerClassName(active === "sitemaps")}
            href={searchConsoleTabHref(base, query, "sitemaps")}
            ref={active === "sitemaps" ? revealTab : undefined}
          >
            {t("sitemaps")}
          </Link>
        </div>
      </TabStrip>
    </nav>
  );
}
