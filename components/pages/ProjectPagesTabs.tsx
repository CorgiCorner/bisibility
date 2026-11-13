"use client";

import { revealTab, TabStrip } from "@/components/ui/Tabs";
import { type ProjectPagesTabId, projectPagesTabs } from "@/lib/pages/tabs";
import { type ProjectPagesQuery, projectPagesHref } from "@/lib/pages/url-state";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

const TAB_LABEL = {
  all: "tabs.all",
  "by-tag": "tabs.byTag",
  compare: "tabs.compare",
  "existing-vs-new": "tabs.existingVsNew",
} as const satisfies Record<
  ProjectPagesTabId,
  "tabs.all" | "tabs.byTag" | "tabs.compare" | "tabs.existingVsNew"
>;

export function ProjectPagesTabs({
  count,
  projectId,
  query,
  tagCount,
}: Readonly<{ count: number; projectId: string; query: ProjectPagesQuery; tagCount: number }>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  return (
    <nav aria-label={t("tabs.navigation")} className="min-w-0">
      <TabStrip bordered>
        <div className="flex w-max gap-1">
          {projectPagesTabs.map((tab) => {
            const current = tab.id === query.tab;
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-accent px-3 py-2 font-semibold text-ui-caption text-fg"
                    : "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-ui-caption text-fg-muted"
                }
                href={projectPagesHref(projectId, { ...query, page: 1, tab: tab.id })}
                key={tab.id}
                ref={current ? revealTab : undefined}
              >
                <span>{t(TAB_LABEL[tab.id])}</span>
                {tab.id === "all" || tab.id === "by-tag" ? (
                  <span className="rounded-control bg-bg-sunken px-2 py-0.5 font-sans text-ui-micro tabular-nums text-fg-muted">
                    {format.number(tab.id === "all" ? count : tagCount)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </TabStrip>
    </nav>
  );
}
