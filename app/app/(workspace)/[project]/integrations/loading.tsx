// Skeleton for /app/integrations. Mirrors the full-width analytics page with an
// info card, then grouped categories of full-width provider rows (logo, name/status,
// action buttons and a meta footer).

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const metaKeys = ["m1", "m2", "m3"] as const;

const groups = [
  { key: "serp", rows: ["serp-a", "serp-b", "serp-c"] },
  { key: "analytics", rows: ["an-a", "an-b"] },
  { key: "warehouse", rows: ["wh-a", "wh-b"] },
] as const;

function ProviderRow() {
  return (
    <div className="rounded-[14px] border border-border bg-bg-elev px-5 py-[18px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <Bar className="h-[42px] w-[42px] shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Bar className="h-4 w-[130px]" />
              <Bar className="h-4 w-[80px] rounded-full" />
            </div>
            <Bar className="h-3 w-full max-w-[360px]" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[7px]">
          <Bar className="h-8 w-[84px]" />
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-x-9 gap-y-3 border-t border-border-soft pt-3.5">
        {metaKeys.map((key) => (
          <div className="flex flex-col gap-1.5" key={key}>
            <Bar className="h-2.5 w-[70px]" />
            <Bar className="h-3 w-[90px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IntegrationsLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-5">
      <div className="flex items-start gap-[11px] rounded-xl border border-border bg-bg-elev px-4 py-[14px]">
        <Bar className="h-5 w-5 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Bar className="h-3 w-full max-w-[520px]" />
          <Bar className="h-3 w-full max-w-[420px]" />
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section className="space-y-3" key={group.key}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
              <Bar className="h-4 w-[150px]" />
              <Bar className="h-3 w-[90px]" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {group.rows.map((key) => (
                <ProviderRow key={key} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageContent>
  );
}
