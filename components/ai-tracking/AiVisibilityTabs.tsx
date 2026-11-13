"use client";

import { revealTab, TabStrip } from "@/components/ui/Tabs";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import { type AiVisibilityTabId, aiVisibilityTabs } from "@/lib/ai-tracking/ai-visibility-tabs";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function AiVisibilityTabs({
  actions = null,
  active,
  keyword,
  projectId,
  promptCount,
  trackingView,
}: Readonly<{
  actions?: ReactNode;
  active: AiVisibilityTabId;
  keyword?: string;
  projectId: string;
  /** Active prompt count from the tracker loader. Omitted when that loader did not run. */
  promptCount?: number;
  trackingView?: "prompts" | "runs";
}>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const labels = {
    overview: t("visibilityTabs.overview"),
    prompts: t("prompts"),
    research: t("visibilityTabs.research"),
    sources: t("visibilityTabs.sources"),
    engines: t("visibilityTabs.engines"),
  } satisfies Record<AiVisibilityTabId, string>;

  return (
    <div className="flex min-w-0 flex-col gap-y-2 md:flex-row md:items-end md:justify-between md:gap-x-3">
      <TabStrip bordered className="w-full md:w-auto md:max-w-full md:flex-1">
        <nav aria-label={t("visibilityTabs.navigation")} className="flex w-max gap-1">
          {aiVisibilityTabs.map((tab) => {
            const current = tab.id === active;
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "-mb-px flex shrink-0 items-center gap-2 border-x-0 border-t-0 border-b-2 border-accent bg-transparent px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                    : "-mb-px flex shrink-0 items-center gap-2 border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3.5 py-2 text-sm whitespace-nowrap text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                }
                href={aiVisibilityTabHref(projectId, tab.id, {
                  keyword: tab.id === "research" ? keyword : undefined,
                  view: tab.id === "prompts" ? trackingView : undefined,
                })}
                key={tab.id}
                ref={current ? revealTab : undefined}
              >
                <span>{labels[tab.id]}</span>
                {tab.id === "prompts" && promptCount !== undefined ? (
                  <span className="rounded-control bg-bg-sunken px-2 py-0.5 font-sans text-xs tabular-nums text-fg-muted">
                    {format.number(promptCount)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </TabStrip>
      {actions ? <div className="flex flex-wrap items-center gap-2 pb-2">{actions}</div> : null}
    </div>
  );
}
