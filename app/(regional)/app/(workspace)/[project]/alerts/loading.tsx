// Keep the placeholders aligned with AlertsPageContent and its feed/rule cards.

import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("motion-safe:animate-pulse rounded-control bg-bg-sunken", className)} />
  );
}

const summaryKeys = ["urgent", "warning", "info"] as const;
const feedKeys = ["f1", "f2", "f3", "f4"] as const;
const templateKeys = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;
const ruleKeys = ["rule1", "rule2", "rule3", "rule4", "rule5"] as const;

export default function AlertsLoading() {
  return (
    <PageContent aria-busy="true" aria-hidden className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Bar className="h-8.5 w-[104px]" />
        <Bar className="h-8.5 w-[104px]" />
      </div>
      <Card className="flex flex-col gap-3 px-4.5 py-3.5 sm:flex-row sm:items-center">
        <Bar className="h-3.5 w-[100px]" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {summaryKeys.map((key) => (
            <div className="flex items-center gap-2" key={key}>
              <Bar className="h-[7px] w-[7px] rounded-full" />
              <Bar className="h-4 w-6" />
              <Bar className="h-3 w-[60px]" />
            </div>
          ))}
        </div>
        <Bar className="h-3 w-[60px] sm:ml-auto" />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4.5 py-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Bar className="h-4 w-[100px]" />
            <Bar className="h-5 w-16 rounded-full" />
            <Bar className="h-3 w-20" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Bar className="h-8 w-[220px] max-w-full" />
            <Bar className="h-8 w-[104px]" />
          </div>
        </div>
        {feedKeys.map((key) => (
          <div className="flex gap-3.5 border-b border-border px-4.5 py-[15px]" key={key}>
            <Bar className="h-8.5 w-[34px] shrink-0 rounded-control" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className="h-3.5 w-[60%]" />
              <Bar className="h-3 w-[42%]" />
              <Bar className="h-3 w-[78%]" />
              <div className="flex flex-wrap gap-2">
                <Bar className="h-4 w-16 rounded-full" />
                <Bar className="h-4 w-20 rounded-full" />
                <Bar className="h-3 w-16" />
              </div>
              <Bar className="h-8 w-full" />
              <div className="mt-0.5 flex flex-wrap gap-2">
                <Bar className="h-8 w-[110px]" />
                <Bar className="h-8 w-[92px]" />
              </div>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-sunken px-4.5 py-3">
          <Bar className="h-3 w-28 bg-border" />
          <div className="flex flex-wrap items-center gap-2.5">
            <Bar className="h-8 w-24 bg-border" />
            <Bar className="h-8 w-24 bg-border" />
          </div>
        </div>
      </Card>

      <section className="flex flex-col gap-2.5">
        <Bar className="h-3 w-[130px]" />
        <div className="flex flex-wrap gap-2">
          {templateKeys.map((key) => (
            <Bar className="h-10 w-[150px] max-w-full" key={key} />
          ))}
        </div>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4.5 py-3.5">
          <Bar className="h-4 w-[110px]" />
          <Bar className="mt-2 h-3 w-full max-w-[420px]" />
        </div>
        {ruleKeys.map((key) => (
          <div
            className="flex flex-col gap-3 border-b border-border px-4.5 py-[15px] sm:flex-row sm:items-center"
            key={key}
          >
            <Bar className="hidden h-[38px] w-[5px] shrink-0 rounded-full sm:block" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Bar className="h-3.5 w-[160px] max-w-full" />
                <Bar className="h-5 w-14 rounded-full" />
                <Bar className="h-5 w-14 rounded-full" />
              </div>
              <Bar className="h-3 w-[68%]" />
            </div>
            <Bar className="h-[22px] w-[38px] shrink-0 rounded-full" />
            <Bar className="h-8 w-8 shrink-0" />
            <Bar className="h-8 w-8 shrink-0" />
          </div>
        ))}
        <div className="flex items-center gap-2 px-4.5 py-3">
          <Bar className="size-3.5 shrink-0 rounded-full" />
          <Bar className="h-3 w-full max-w-[420px]" />
        </div>
      </Card>
    </PageContent>
  );
}
