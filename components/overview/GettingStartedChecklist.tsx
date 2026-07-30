import { SampleDataButton } from "@/components/sample-data/SampleDataButton";
import type { ProjectRef } from "@/lib/routing/app-path";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Button from "@mui/material/Button";
import {
  ArrowRightIcon as ArrowRight,
  CloudArrowDownIcon as CloudArrowDown,
  DatabaseIcon as Database,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

type Step = {
  action: ReactNode;
  active: boolean;
  description: string;
  index: number;
  title: string;
};

export type GettingStartedProgress = {
  gscOAuthConfigured: boolean;
  hasAnalyticsSource: boolean;
  hasCheck: boolean;
  hasKeywords: boolean;
  projectId: string;
  projectRef?: ProjectRef;
  providerConnected: boolean;
};

export type GettingStartedCapabilities = {
  canCreateKeywords: boolean;
  canInstallSampleData: boolean;
  canManageImports: boolean;
  canManageProviders: boolean;
};

const actionButtonSx = { flex: "none", minHeight: 34, whiteSpace: "nowrap" } as const;
const outlineButtonSx = {
  ...actionButtonSx,
  borderColor: "var(--border-strong)",
  color: "var(--fg-muted)",
} as const;
const googleOauthConsoleUrl = "https://console.cloud.google.com/apis/credentials";

export function hasGettingStartedDataSource(progress: GettingStartedProgress) {
  return progress.providerConnected || progress.hasAnalyticsSource;
}

export function gettingStartedActiveIndex(progress: GettingStartedProgress) {
  if (!hasGettingStartedDataSource(progress)) return 1;
  if (!progress.hasKeywords) return 2;
  if (!progress.hasCheck) return 3;
  return 0;
}

function searchConsoleAction(progress: GettingStartedProgress) {
  const projectRef = progress.projectRef ?? asProjectRef(progress.projectId);
  const href = progress.gscOAuthConfigured
    ? appPath(projectRef, "integrations?connect=gsc")
    : googleOauthConsoleUrl;
  return (
    <Button
      component="a"
      href={href}
      size="small"
      startIcon={<MagnifyingGlass size={14} weight="bold" />}
      sx={actionButtonSx}
      {...(progress.gscOAuthConfigured ? {} : { rel: "noreferrer", target: "_blank" })}
      variant="contained"
    >
      Search Console (free)
    </Button>
  );
}

function dataSourceActions(progress: GettingStartedProgress) {
  const projectRef = progress.projectRef ?? asProjectRef(progress.projectId);
  return (
    <span className="flex flex-wrap gap-2 sm:justify-end">
      {searchConsoleAction(progress)}
      <Button
        color="inherit"
        component={Link}
        endIcon={<ArrowRight size={14} weight="bold" />}
        href={appPath(projectRef, "integrations")}
        size="small"
        sx={outlineButtonSx}
        variant="outlined"
      >
        SERP provider
      </Button>
    </span>
  );
}

function checklistSteps(
  progress: GettingStartedProgress,
  capabilities: GettingStartedCapabilities,
): Step[] {
  const projectRef = progress.projectRef ?? asProjectRef(progress.projectId);
  const active = gettingStartedActiveIndex(progress);

  return [
    {
      action: capabilities.canManageProviders ? dataSourceActions(progress) : null,
      active: active === 1,
      description: "Use free Search Console data or bring your own SERP provider key.",
      index: 1,
      title: "Connect a data source",
    },
    {
      action: capabilities.canCreateKeywords ? (
        <Button
          color="inherit"
          component={Link}
          href={appPath(projectRef, "keywords?add=1")}
          size="small"
          sx={{
            ...outlineButtonSx,
          }}
          variant="outlined"
        >
          Add
        </Button>
      ) : null,
      active: active === 2,
      description: "Paste a list or import a CSV, scoped to your domain.",
      index: 2,
      title: "Add keywords",
    },
    {
      action: <span className="flex-none font-mono text-[11px] text-fg-faint">auto</span>,
      active: active === 3,
      description: "Positions, trends and highlights appear here automatically.",
      index: 3,
      title: "Run the first check",
    },
  ];
}

function StepBadge({ active, index }: Readonly<{ active: boolean; index: number }>) {
  return (
    <span
      className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] font-mono text-[13px] font-semibold ${
        active ? "bg-accent text-white" : "bg-bg-sunken text-fg-faint"
      }`}
    >
      {index}
    </span>
  );
}

function OptionCard({
  action,
  description,
  icon,
  title,
}: Readonly<{
  action: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}>) {
  return (
    <div className="flex flex-col gap-[13px] rounded-xl border border-dashed border-border-strong bg-bg px-4 py-3.5 sm:flex-row sm:items-center">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-fg">{title}</span>
        <span className="mt-px block text-xs text-fg-muted">{description}</span>
      </span>
      {action}
    </div>
  );
}

export function GettingStartedChecklist({
  capabilities,
  progress,
}: Readonly<{
  capabilities: GettingStartedCapabilities;
  progress: GettingStartedProgress;
}>) {
  const steps = checklistSteps(progress, capabilities);
  const projectRef = progress.projectRef ?? asProjectRef(progress.projectId);

  return (
    <div className="mt-6">
      <div className="flex w-full flex-col gap-2.5">
        {steps.map((step) => (
          <div
            className={`flex flex-col gap-3.5 rounded-xl border border-border bg-bg px-4 py-3.5 sm:flex-row sm:items-center ${
              step.active ? "" : "opacity-[0.62]"
            }`}
            key={step.index}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <StepBadge active={step.active} index={step.index} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{step.title}</span>
                <span className="mt-px block text-[12.5px] text-fg-muted">{step.description}</span>
              </span>
            </div>
            {step.action}
          </div>
        ))}
      </div>
      <div className="mt-[18px] grid max-w-[860px] gap-[13px] lg:grid-cols-2">
        {capabilities.canInstallSampleData ? (
          <OptionCard
            action={
              <SampleDataButton
                sx={{ alignSelf: "flex-start", flex: "none", minHeight: 34, whiteSpace: "nowrap" }}
                variant="outlined"
              />
            }
            description="Fill this workspace with realistic, deletable demo rankings."
            icon={
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-bg-sunken text-accent">
                <Database aria-hidden size={18} weight="fill" />
              </span>
            }
            title="Just exploring?"
          />
        ) : null}
        {capabilities.canManageImports ? (
          <OptionCard
            action={
              <Button
                color="inherit"
                component={Link}
                href={`/cloud/import?ctx=settings&project=${encodeURIComponent(projectRef)}`}
                size="small"
                sx={{
                  alignSelf: "flex-start",
                  borderColor: "var(--border-strong)",
                  color: "var(--fg)",
                  flex: "none",
                  minHeight: 34,
                  whiteSpace: "nowrap",
                  "&:hover": { borderColor: "var(--accent)", color: "var(--accent)" },
                }}
                variant="outlined"
              >
                Import
              </Button>
            }
            description="Import your export package: keywords, history, tags and alerts."
            icon={
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-bg-sunken text-accent">
                <CloudArrowDown aria-hidden size={18} weight="fill" />
              </span>
            }
            title="Coming from self-host?"
          />
        ) : null}
      </div>
    </div>
  );
}
