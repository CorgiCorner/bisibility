"use client";

import { compactBadgeClassName } from "@/components/ui/Pill";
import { tabCountClassName, tabTriggerClassName } from "@/components/ui/Tabs";
import { searchConsoleTabHref } from "@/lib/search-index/ui-model";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

export function SearchConsoleTabs({
  active,
  base,
  query,
  notIndexed,
}: Readonly<{
  active: "performance" | "page-indexing";
  base: string;
  query: string;
  notIndexed: number | null;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  return (
    <nav aria-label={t("navigation")} className="flex gap-1 border-b border-border">
      <Link
        aria-current={active === "performance" ? "page" : undefined}
        className={tabTriggerClassName(active === "performance")}
        href={searchConsoleTabHref(base, query, "performance")}
      >
        {t("performance")}
      </Link>
      <Link
        aria-current={active === "page-indexing" ? "page" : undefined}
        aria-label={
          notIndexed === null
            ? undefined
            : t("notIndexedCount", { alpha: t("alphaBadge"), count: notIndexed })
        }
        className={tabTriggerClassName(active === "page-indexing")}
        href={searchConsoleTabHref(base, query, "page-indexing")}
      >
        <span>{t("title")}</span> <span className={compactBadgeClassName}>{t("alphaBadge")}</span>
        {notIndexed !== null ? (
          <span className={tabCountClassName} title={t("groups.not_indexed")}>
            {format.number(notIndexed)}
          </span>
        ) : null}
      </Link>
    </nav>
  );
}
