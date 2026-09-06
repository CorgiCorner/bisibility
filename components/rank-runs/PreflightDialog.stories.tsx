import { Button } from "@/components/ui";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { PreflightDialog, type PreflightDialogProps } from "./PreflightDialog";

const projectId = "prj_abcdefghijklmnopqrstuvwx";

const defaultPreview: RankCheckRunPreview = {
  budget: {
    blocked: false,
    mode: "legacy",
    reason: null,
    remainingAfterCents: 1_602,
    spentCents: 3_100,
  } as RankCheckRunPreview["budget"],
  estimate: { costCents: 298, perTargetCents: 0.6, unknownCostTargets: 0 },
  excluded: [],
  executable: 248,
  expiresAt: "2026-09-03T12:00:00.000Z",
  keywordCount: 248,
  matched: 248,
  previewToken: "story_preview_token",
  selectionHash: "story-selection",
  targetCount: 496,
};

const defaultScope = {
  description: "Every tracked keyword in this project",
  equation: "248 keywords · 2 markets × 1 device = 496 targets",
  startLabel: "Start run",
  subtitle: "Nothing is sent to the provider until you start.",
  title: "Check all tracked keywords",
} as const;

const actions = {
  launchAction: fn(async () => ({
    estimatedCostCents: 298,
    keywordCount: 248,
    publicId: "rcr_story",
    status: "queued" as const,
    targetCount: 496,
  })),
  previewAction: fn(async () => defaultPreview),
};

const baseArgs: PreflightDialogProps = {
  ...actions,
  budgetHref: "/app/prj_story/settings#provider-usage",
  duplicateRunHref: "/app/prj_story/rank-tracker/runs/rcr_story",
  initialDepth: 20,
  initialPreview: defaultPreview,
  initialProviderId: "provider-dataforseo",
  integrationsHref: "/app/prj_story/integrations",
  onClose: fn(),
  open: true,
  projectId,
  providerFallbackNote: "SerpApi takes over automatically for any check DataForSEO rate-limits.",
  providers: [
    {
      id: "provider-dataforseo",
      label: "DataForSEO",
      tooltip: "Your own DataForSEO key. Billing is between you and the provider.",
    },
    {
      id: "provider-serpapi",
      label: "SerpApi",
      tooltip: "Used automatically when the primary rate-limits.",
    },
  ],
  scope: defaultScope,
  spec: { kind: "all", v: 1 },
};

function DialogStory(args: PreflightDialogProps) {
  return <PreflightDialog {...args} />;
}

function CheckAllStory(args: PreflightDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-bg p-4 text-fg sm:p-8">
      <div className="mx-auto flex max-w-[1100px] justify-end">
        <Button onClick={() => setOpen(true)}>Check all</Button>
      </div>
      <PreflightDialog {...args} onClose={() => setOpen(false)} open={open} />
    </div>
  );
}

const meta = {
  args: baseArgs,
  component: PreflightDialog,
  parameters: { layout: "fullscreen" },
  title: "dashboard-runs",
} satisfies Meta<typeof PreflightDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PreflightDefault: Story = {
  name: "preflight-default",
  render: DialogStory,
};

export const PreflightFiltered: Story = {
  args: {
    initialPreview: {
      ...defaultPreview,
      estimate: { ...defaultPreview.estimate, costCents: 420 },
      targetCount: 700,
    },
    scope: {
      description: "Current filter: tag = commercial, device = mobile",
      equation: "350 keywords · 2 markets × 1 device = 700 targets",
      startLabel: "Start run",
      subtitle: "Nothing is sent to the provider until you start.",
      title: "Run checks for 350 keywords",
    },
  },
  name: "preflight-filtered",
  render: DialogStory,
};

export const PreflightRetry: Story = {
  args: {
    initialPreview: {
      ...defaultPreview,
      estimate: { ...defaultPreview.estimate, costCents: 7 },
      targetCount: 12,
    },
    scope: {
      description:
        "Failed targets from run rcr_9c8a07. Nothing else from the parent run is re-sent.",
      equation: "12 failed targets · 1 attempt each",
      startLabel: "Retry 12 targets",
      subtitle: "A retry starts a new run linked to rcr_9c8a07. The parent keeps its results.",
      title: "Retry 12 failed targets",
    },
  },
  name: "preflight-retry",
  render: DialogStory,
};

export const PreflightBudget: Story = {
  args: {
    initialPreview: {
      ...defaultPreview,
      budget: {
        ...defaultPreview.budget,
        blocked: true,
        reason: "budget_exhausted",
        spentCents: 4_856,
      },
      estimate: { ...defaultPreview.estimate, costCents: 29 },
      targetCount: 48,
    },
    scope: {
      description:
        "Targets skipped at the monthly limit in run rcr_998f1a. Nothing that completed is re-sent.",
      equation: "48 skipped targets · 1 attempt each",
      startLabel: "Run 48 skipped",
      subtitle: "These targets never reached a provider, so they were never billed.",
      title: "Run 48 skipped targets",
    },
  },
  name: "preflight-budget",
  render: DialogStory,
};

export const PreflightNoprovider: Story = {
  args: {
    initialPreview: {
      ...defaultPreview,
      budget: { ...defaultPreview.budget, blocked: true, reason: "no_provider" },
      estimate: { ...defaultPreview.estimate, costCents: null, perTargetCents: null },
    },
    initialProviderId: undefined,
    providers: [],
  },
  name: "preflight-noprovider",
  render: DialogStory,
};

export const PreflightDuplicate: Story = {
  args: {
    duplicateDetail:
      "A run over this scope is already running · 252 of 694. Starting now would pay twice for the same positions.",
    initialPreview: {
      ...defaultPreview,
      budget: { ...defaultPreview.budget, blocked: true, reason: "duplicate" },
    },
  },
  name: "preflight-duplicate",
  render: DialogStory,
};

export const PreflightCheckAll: Story = {
  args: { ...baseArgs, open: false },
  name: "preflight-check-all",
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Check all" }));
    await expect(within(canvasElement.ownerDocument.body).getByRole("dialog")).toBeVisible();
  },
  render: CheckAllStory,
};
