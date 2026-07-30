import { Card } from "@/components/ui";
import { RocketLaunchIcon as RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import {
  type GettingStartedCapabilities,
  GettingStartedChecklist,
  type GettingStartedProgress,
} from "./GettingStartedChecklist";
import { GhostKpiRow } from "./GhostKpiRow";

export type OverviewEmptyProps = {
  capabilities: GettingStartedCapabilities;
  gettingStarted: GettingStartedProgress;
  workspaceName: string;
};

export function OverviewEmpty({
  capabilities,
  gettingStarted,
  workspaceName,
}: Readonly<OverviewEmptyProps>) {
  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="relative overflow-hidden px-5 py-[30px] sm:px-8" size="md">
        <span
          className="grid h-12 w-12 place-items-center rounded-[13px] text-purple"
          style={{ backgroundColor: "color-mix(in srgb, var(--purple) 14%, transparent)" }}
        >
          <RocketLaunch aria-hidden size={25} weight="bold" />
        </span>
        <h2 className="mt-[18px] text-2xl font-semibold tracking-[-0.8px] text-fg">
          Welcome to {workspaceName}
        </h2>
        <p className="mt-2 max-w-[520px] text-[14.5px] leading-[1.55] text-fg-muted">
          This workspace is empty. Connect a data source and add the keywords you want to track.
          Your first rankings land after the next check.
        </p>
        <GettingStartedChecklist capabilities={capabilities} progress={gettingStarted} />
      </Card>
      <GhostKpiRow />
    </div>
  );
}
