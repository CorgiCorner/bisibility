import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";
import {
  AgentReportBack,
  AgentReportDetailFrame,
  AgentReportHeader,
} from "./AgentReportDetailLayout";

function Bar({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      className={cn("block h-[1lh] rounded-control bg-border motion-safe:animate-pulse", className)}
    />
  );
}

function TextBar({ className }: Readonly<{ className?: string }>) {
  return (
    <span className="flex h-[1lh] items-center">
      <Bar className={cn("h-[0.55lh]", className)} />
    </span>
  );
}

export function AgentReportDetailLoading({
  backLabel,
  membersOnlyLabel,
}: Readonly<{ backLabel: string; membersOnlyLabel: string }>) {
  return (
    <AgentReportDetailFrame busy>
      <AgentReportBack label={backLabel} />
      <AgentReportHeader
        loading
        title={<TextBar className="w-2/3 max-w-80" />}
        kind={<TextBar className="w-20" />}
        share={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
            <Bar className="size-7.5 shrink-0" />
            <span className="rounded-control bg-border text-transparent motion-safe:animate-pulse">
              {membersOnlyLabel}
            </span>
          </div>
        }
      />
      <div aria-hidden className="grid gap-4">
        <div className="flex items-center gap-[9px] rounded-control border border-border bg-bg-sunken px-3 py-2 text-[13px] leading-[1.5]">
          <Bar className="size-3.5 bg-border" />
          <div className="min-w-0 flex-1">
            <TextBar className="w-2/3 max-w-160 bg-border" />
            <span className="block sm:hidden">
              <TextBar className="w-1/2 bg-border" />
            </span>
          </div>
        </div>
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="px-4 py-3 text-[14px] font-semibold">
            <TextBar className="w-24" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid h-[42px] grid-cols-[2fr_0.5fr_0.6fr_1fr_2fr] items-center gap-4 border-y border-border px-3">
                {["url", "http", "indexable", "links", "issues"].map((key) => (
                  <Bar className="h-2.5 w-12" key={key} />
                ))}
              </div>
              {["first", "second", "third", "fourth"].map((key) => (
                <div
                  className="grid h-[78px] grid-cols-[2fr_0.5fr_0.6fr_1fr_2fr] items-center gap-4 border-b border-border px-3 last:border-b-0"
                  key={key}
                >
                  <div className="grid gap-2">
                    <Bar className="h-3 w-4/5" />
                    <Bar className="h-3 w-3/5" />
                    <Bar className="h-3 w-16" />
                  </div>
                  <Bar className="h-3 w-7" />
                  <Bar className="h-3 w-8" />
                  <div className="grid gap-2">
                    <Bar className="h-3 w-16" />
                    <Bar className="h-3 w-14" />
                  </div>
                  <Bar className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </AgentReportDetailFrame>
  );
}
