"use client";

import { PageContent } from "@/components/shell/PageContent";
import { defaultProjectPagesTab, type ProjectPagesTabId } from "@/lib/pages/tabs";
import { cn } from "@/lib/ui/cn";
import { useSearchParams } from "next/navigation";
import { projectPagesBlocks } from "./project-pages-layout";

function pageTab(value: string | null | undefined): ProjectPagesTabId {
  if (value && value in projectPagesBlocks) return value as ProjectPagesTabId;
  return defaultProjectPagesTab();
}

export function ProjectPagesLoading({ tab }: Readonly<{ tab?: string }>) {
  const search = useSearchParams();
  const id = pageTab(tab ?? search.get("tab"));
  const blocks = projectPagesBlocks[id];
  return (
    <PageContent aria-busy="true">
      <div
        aria-hidden
        className="flex min-w-0 max-w-full flex-col gap-3 overflow-x-hidden"
        data-pages-blocks={blocks.join(" ")}
        data-pages-tab={id}
      >
        {blocks.map((block) => (
          <div
            className={cn(
              block === "chart" &&
                "min-h-64 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse",
              block === "controls" &&
                "h-10 w-full max-w-xl rounded-control bg-bg-sunken motion-safe:animate-pulse",
              block === "filters" &&
                "min-h-24 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse",
              block === "lead" &&
                "h-5 w-1/2 rounded-control bg-bg-sunken motion-safe:animate-pulse",
              block === "sources" &&
                "h-10 w-full rounded-control bg-bg-sunken motion-safe:animate-pulse",
              block === "table" &&
                "min-h-64 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse",
              block === "tabs" && "h-10 w-full border-b border-border",
              block === "toolbar" &&
                "h-10 w-full rounded-control bg-bg-sunken motion-safe:animate-pulse",
            )}
            data-pages-section={block}
            key={block}
          />
        ))}
      </div>
    </PageContent>
  );
}
