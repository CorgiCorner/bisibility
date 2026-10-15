"use client";
import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";
import { useSearchParams } from "next/navigation";

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <div
      className={cn("max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse", className)}
    />
  );
}
function ProviderFrame() {
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-border bg-bg-elev p-4">
      <div className="flex items-center gap-2.5">
        <Bar className="h-8 w-8 shrink-0" />
        <Bar className="h-4 w-32" />
      </div>
      <div className="mt-3 space-y-1.5">
        <Bar className="h-5 w-full" />
        <Bar className="h-5 w-3/4" />
      </div>
      <div className="mt-4 space-y-3 border-t border-border pt-3">
        <Bar className="h-4 w-28" />
        <Bar className="h-8 w-24" />
      </div>
    </div>
  );
}
export function IntegrationsPageLoading({
  connectionsLabel,
  usageLabel,
  active: activeOverride,
}: Readonly<{ connectionsLabel: string; usageLabel: string; active?: "connections" | "usage" }>) {
  const search = useSearchParams();
  const active = activeOverride ?? (search.get("tab") === "usage" ? "usage" : "connections");
  return (
    <PageContent aria-busy="true" className="flex flex-col gap-5">
      <div
        aria-hidden
        className="flex gap-0.5 border-b border-border"
        data-integrations-loading-tabs=""
      >
        {(
          [
            { id: "connections", label: connectionsLabel },
            { id: "usage", label: usageLabel },
          ] as const
        ).map((tab) => (
          <span
            key={tab.id}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold",
              tab.id === active ? "border-accent text-fg" : "border-transparent text-fg-muted",
            )}
          >
            {tab.label}
          </span>
        ))}
      </div>
      <div
        aria-hidden
        className="flex min-w-0 flex-col gap-5"
        data-integrations-loading-panel={active}
      >
        {active === "usage" ? (
          <div className="w-full max-w-[760px] space-y-4 rounded-card border border-border bg-bg-elev p-5">
            <Bar className="h-5 w-40" />
            <Bar className="h-10 w-32" />
            <Bar className="h-2.5 w-full" />
            <div className="grid grid-cols-2 gap-6 border-t border-border pt-5 sm:grid-cols-3">
              {["one", "two", "three"].map((key) => (
                <Bar key={key} className="h-12 w-full" />
              ))}
            </div>
            <Bar className="h-16 w-full" />
          </div>
        ) : (
          (["serp", "analytics"] as const).map((group) => (
            <section className="space-y-3" key={group}>
              <div className="space-y-1">
                <Bar className="h-[21px] w-40" />
                <Bar className="h-5 w-full max-w-3xl" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] items-stretch gap-3">
                <ProviderFrame />
                <ProviderFrame />
              </div>
              {group === "serp" ? (
                <div className="space-y-3 rounded-card border border-border bg-bg-elev p-4">
                  <Bar className="h-5 w-40" />
                  <Bar className="h-12 w-full" />
                </div>
              ) : null}
            </section>
          ))
        )}
      </div>
    </PageContent>
  );
}
