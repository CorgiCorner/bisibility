import { MonoText } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { InfoIcon as Info } from "@phosphor-icons/react";
import type { ReactNode } from "react";

function deltaLabel(deltaCents: number) {
  return `${deltaCents > 0 ? "+" : ""}${formatEstimateCents(deltaCents)}`;
}

function dateOnly(runLabel: string) {
  return runLabel.split(",")[0];
}

function Metric({
  children,
  label,
  value,
}: Readonly<{ children?: ReactNode; label: string; value: string }>) {
  return (
    <div>
      <MonoText className="uppercase tracking-[0.5px]" muted>
        {label}
      </MonoText>
      <div className="mt-1 text-[15px] font-semibold">{value}</div>
      {children ? (
        <div className="mt-0.5 font-mono text-xs leading-5 text-fg-muted">{children}</div>
      ) : null}
    </div>
  );
}

export function ScheduleMetrics({
  checksPerRun,
  monthlyChecks,
  monthlyCost,
  runs,
  timing,
  deltaCents,
  jitterMinutes,
}: Readonly<{
  checksPerRun: number;
  deltaCents?: number | null;
  jitterMinutes: number;
  monthlyChecks: number | null;
  monthlyCost: string | null;
  runs: string[];
  timing: { detail: string | null; label: string; value: string };
}>) {
  const [, ...laterRuns] = runs;

  return (
    <div aria-live="polite" className="mt-4 rounded-[14px] border border-border bg-bg-elev p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label={timing.label} value={timing.value}>
          {timing.detail ? <div>{timing.detail}</div> : null}
          {laterRuns.length > 0 ? <div>then {laterRuns.map(dateOnly).join(", ")}</div> : null}
        </Metric>
        <Metric label="Per run" value={`${checksPerRun.toLocaleString()} checks`}>
          {monthlyChecks != null ? <div>~{monthlyChecks.toLocaleString()} / month</div> : null}
        </Metric>
        <Metric label="Est. cost" value={monthlyCost == null ? "-" : `~${monthlyCost} / month`}>
          {monthlyCost == null ? (
            <div>Estimate excludes custom cron schedule</div>
          ) : (
            <div>billed to your own account</div>
          )}
          {deltaCents != null ? <div>~ {deltaLabel(deltaCents)}/mo vs current</div> : null}
        </Metric>
      </div>
      <div className="mt-4 flex items-start gap-2 border-t border-border-soft pt-3 text-[11.5px] leading-5 text-fg-faint">
        <span className="flex h-5 shrink-0 items-center">
          <Info aria-hidden className="text-accent" size={14} />
        </span>
        Daily and weekly use a stable per-keyword phase across their interval. Timezone anchors
        monthly and custom cron schedules only. Jitter adds 0 to {jitterMinutes} minutes of random
        delay.
      </div>
    </div>
  );
}
