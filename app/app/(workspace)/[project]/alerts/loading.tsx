// Skeleton for /app/alerts. Mirrors the live toolbar, unread summary, triggered feed,
// template buttons, and rules list.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const summaryKeys = ["info", "warning", "urgent"] as const;
const feedKeys = ["f1", "f2", "f3", "f4"] as const;
const templateKeys = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;
const ruleKeys = ["rule1", "rule2", "rule3", "rule4", "rule5"] as const;

export default function AlertsLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bar className="h-2 w-2 rounded-full" />
          <Bar className="h-3 w-[310px]" />
        </div>
        <Bar className="h-9 w-[104px] rounded-lg" />
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-bg-elev px-[18px] py-3.5 sm:flex-row sm:items-center">
          <Bar className="h-3.5 w-[100px]" />
          <div className="flex flex-wrap items-center gap-4">
            {summaryKeys.map((key) => (
              <div className="flex items-center gap-2" key={key}>
                <Bar className="h-[26px] w-[26px] rounded-lg" />
                <Bar className="h-4 w-6" />
                <Bar className="h-3 w-[60px]" />
              </div>
            ))}
          </div>
          <Bar className="h-3 w-[60px] sm:ml-auto" />
        </div>

        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
            <Bar className="h-4 w-[160px]" />
            <div className="flex items-center gap-2">
              <Bar className="h-8 w-[186px]" />
              <Bar className="h-8 w-[104px]" />
            </div>
          </div>
          {feedKeys.map((key) => (
            <div className="flex gap-3.5 border-b border-border-soft px-[18px] py-[15px]" key={key}>
              <Bar className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Bar className="h-3.5 w-[60%]" />
                <Bar className="h-3 w-[42%]" />
                <Bar className="h-3 w-[78%]" />
                <div className="mt-1 flex flex-wrap gap-2">
                  <Bar className="h-8 w-[110px]" />
                  <Bar className="h-8 w-[92px]" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-2.5">
          <Bar className="h-3 w-[130px]" />
          <div className="flex flex-wrap gap-2">
            {templateKeys.map((key) => (
              <Bar className="h-10 w-[150px]" key={key} />
            ))}
          </div>
        </section>

        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <div className="border-b border-border px-[18px] py-3.5">
            <Bar className="h-4 w-[110px]" />
            <Bar className="mt-2 h-3 w-full max-w-[420px]" />
          </div>
          {ruleKeys.map((key) => (
            <div
              className="flex items-center gap-3 border-b border-border-soft px-[18px] py-[15px]"
              key={key}
            >
              <Bar className="hidden h-[38px] w-[5px] shrink-0 rounded-full sm:block" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Bar className="h-3.5 w-[200px]" />
                <Bar className="h-3 w-[68%]" />
              </div>
              <Bar className="h-[22px] w-[38px] shrink-0 rounded-full" />
              <Bar className="h-8 w-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </PageContent>
  );
}
