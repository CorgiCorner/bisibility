import { Card } from "@/components/ui/Card";
import { ChallengeBento, ChallengeBentoItem } from "@/lib/challenge-report/bento";
import { challengeBentoLayout } from "@/lib/challenge-report/bento-layout";
import { CHALLENGE_TILE_IDS } from "@/lib/challenge-report/tile-state";
import { cn } from "@/lib/ui/cn";
import {
  AgentReportBack,
  AgentReportDetailFrame,
  AgentReportHeader,
} from "./AgentReportDetailLayout";
import { challengeReportBlocks, challengeReportLayoutClassName } from "./challenge-report-layout";

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
      <div
        aria-hidden
        className={challengeReportLayoutClassName}
        data-challenge-blocks={challengeReportBlocks.join(" ")}
      >
        <Bar className="h-5 w-64 max-w-full" />
        <ChallengeBento>
          {challengeBentoLayout([...CHALLENGE_TILE_IDS]).map((span) => (
            <ChallengeBentoItem key={span.id} span={span}>
              <Card className="min-h-40">
                <Bar className="h-4 w-24" />
                <Bar className="mt-3 h-8 w-16" />
              </Card>
            </ChallengeBentoItem>
          ))}
        </ChallengeBento>
        <Card className="grid gap-2">
          <Bar className="h-5 w-32" />
          <Bar className="h-4 w-full" />
        </Card>
      </div>
    </AgentReportDetailFrame>
  );
}
