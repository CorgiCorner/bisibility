import { Card } from "@/components/ui";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { RocketLaunchIcon as RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import { GhostKpiRow } from "./GhostKpiRow";
import type { GettingStartedCapabilities, GettingStartedProgress } from "./getting-started";
import type { AddKeywordsAction, OnboardingCardProps } from "./OnboardingCard";
import { OnboardingCard } from "./OnboardingCard";

const CREATION_DEFAULT_NAMES = new Set(["new project", "new workspace"]);

export type OverviewEmptyProps = {
  addKeywordsAction?: AddKeywordsAction;
  capabilities: GettingStartedCapabilities;
  costContext?: ProjectCostContext;
  gettingStarted: GettingStartedProgress;
  importTopQueriesAction?: OnboardingCardProps["importTopQueriesAction"];
  workspaceName: string;
};

export function OverviewEmpty({
  addKeywordsAction,
  capabilities,
  costContext,
  gettingStarted,
  importTopQueriesAction,
  workspaceName,
}: Readonly<OverviewEmptyProps>) {
  // The creation default (lib/actions/cloud.ts) doubles as a name here, and "Welcome to
  // New project" reads like a grammar slip; a possessive greeting covers that case.
  // "New workspace" is the pre-rename default still carried by older projects.
  const heading = CREATION_DEFAULT_NAMES.has(workspaceName.trim().toLowerCase())
    ? "Welcome to your new project"
    : `Welcome to ${workspaceName}`;

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="relative overflow-hidden px-5 py-[30px] sm:px-8" size="md">
        {/* One measure for everything in the card; per-block max widths used to break the
            right edge several times. */}
        <div className="max-w-[720px]">
          <span
            className="grid h-12 w-12 place-items-center rounded-[13px] text-purple"
            style={{ backgroundColor: "color-mix(in srgb, var(--purple) 14%, transparent)" }}
          >
            <RocketLaunch aria-hidden size={25} weight="bold" />
          </span>
          <h2 className="mt-[18px] text-2xl font-semibold tracking-[-0.8px] text-fg">{heading}</h2>
          <p className="mt-2 text-[14.5px] leading-[1.55] text-fg-muted">
            This project is empty. One step at a time gets you to your first rankings.
          </p>
          <OnboardingCard
            addKeywordsAction={addKeywordsAction}
            capabilities={capabilities}
            costContext={costContext}
            importTopQueriesAction={importTopQueriesAction}
            progress={gettingStarted}
          />
        </div>
      </Card>
      <GhostKpiRow />
    </div>
  );
}
