import {
  CaretDownIcon as CaretDown,
  ChartLineUpIcon as ChartLineUp,
  CloudIcon as Cloud,
} from "@phosphor-icons/react/dist/ssr";

export type CloudTopBarContext = "onboard" | "settings";

export const CLOUD_ONBOARDING_TOTAL_STEPS = 3;

type CloudTopBarProps = {
  ctx: CloudTopBarContext;
  /** Current onboarding step (1-based) for the "onboard" stepper pill. */
  onboardStep?: number;
  workspaceName?: string;
};

/**
 * Cloud routes use a lightweight logo bar: onboarding shows live progress; settings
 * shows the workspace and avatar.
 */
export function CloudTopBar({
  ctx,
  onboardStep = 2,
  workspaceName = "Workspace",
}: Readonly<CloudTopBarProps>) {
  return (
    <nav className="flex h-16 items-center justify-between gap-3 border-border border-b">
      <div className="flex min-w-0 items-center gap-[11px]">
        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-accent text-white">
          <ChartLineUp aria-hidden size={18} weight="bold" />
        </span>
        <span className="text-[19px] font-bold tracking-[-0.6px]">bisibility</span>
        <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-accent-soft px-[9px] py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.4px] text-accent">
          <Cloud aria-hidden size={11} weight="fill" />
          Cloud
        </span>
      </div>
      <div className="flex flex-none items-center gap-3">
        {ctx === "onboard" ? (
          <SetupPill step={onboardStep} />
        ) : (
          <WorkspaceChrome workspaceName={workspaceName} />
        )}
      </div>
    </nav>
  );
}

function SetupPill({ step }: Readonly<{ step: number }>) {
  const current = Math.min(Math.max(step, 1), CLOUD_ONBOARDING_TOTAL_STEPS);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken px-[11px] py-1.5 font-mono text-[10.5px] font-semibold text-fg-muted">
      Setup / {current} of {CLOUD_ONBOARDING_TOTAL_STEPS}
    </span>
  );
}

function initialFor(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "W";
}

function WorkspaceChrome({ workspaceName }: Readonly<{ workspaceName: string }>) {
  return (
    <>
      <span className="inline-flex items-center gap-[7px] rounded-[9px] border border-border-strong bg-bg-elev px-[11px] py-1.5 text-[13px] font-semibold">
        <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent text-[9px] font-bold text-white">
          {initialFor(workspaceName)}
        </span>
        <span className="max-w-[150px] truncate">{workspaceName}</span>
        <CaretDown aria-hidden className="text-fg-faint" size={9} weight="bold" />
      </span>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-bg-sunken font-mono text-[11px] font-semibold text-fg-muted">
        {initialFor(workspaceName)}
      </span>
    </>
  );
}
