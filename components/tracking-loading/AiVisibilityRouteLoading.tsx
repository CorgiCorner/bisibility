"use client";

import { PageContent } from "@/components/shell/PageContent";
import { resolveAiVisibilityTab } from "@/lib/ai-tracking/ai-visibility-tabs";
import { cn } from "@/lib/ui/cn";
import { useSearchParams } from "next/navigation";
import { aiVisibilityBlocks, aiVisibilityRunsBlocks } from "./ai-visibility-layout";

function Section({ name }: Readonly<{ name: string }>) {
  if (name === "stats" || name === "tiles") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-visibility-section={name}>
        {["one", "two", "three", "four"].map((key) => (
          <div
            className="min-h-24 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse"
            key={key}
          />
        ))}
      </div>
    );
  }
  if (name === "providers") {
    return (
      <div className="grid gap-4 md:grid-cols-2" data-visibility-section={name}>
        {["providers", "routing"].map((key) => (
          <div
            className="min-h-40 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse"
            key={key}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        name === "tabs"
          ? "h-10 w-full border-b border-border"
          : name === "lead"
            ? "h-5 w-2/3 max-w-3xl rounded-control bg-bg-sunken motion-safe:animate-pulse"
            : name === "insight" || name === "lookup"
              ? "min-h-24 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse"
              : name === "engines" || name === "results" || name === "spellings"
                ? "min-h-40 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse"
                : "min-h-64 rounded-card border border-border bg-bg-sunken motion-safe:animate-pulse",
      )}
      data-visibility-section={name}
    />
  );
}

export function AiVisibilityRouteLoading({ tab, view }: Readonly<{ tab?: string; view?: string }>) {
  const search = useSearchParams();
  const id = resolveAiVisibilityTab(tab ?? search.get("tab"));
  const blocks =
    id === "prompts" && (view ?? search.get("view")) === "runs"
      ? aiVisibilityRunsBlocks
      : aiVisibilityBlocks[id];
  return (
    <PageContent aria-busy="true" className="flex flex-col" variant="section">
      <div
        aria-hidden
        className={id === "prompts" ? "flex min-w-0 flex-col gap-4" : "flex min-w-0 flex-col gap-5"}
        data-visibility-blocks={blocks.join(" ")}
        data-visibility-tab={id}
        data-visibility-view={
          id === "prompts" && (view ?? search.get("view")) === "runs" ? "runs" : undefined
        }
      >
        {blocks.map((block) => (
          <Section key={block} name={block} />
        ))}
      </div>
    </PageContent>
  );
}
