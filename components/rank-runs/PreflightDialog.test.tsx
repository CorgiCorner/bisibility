import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreflightDialog, type PreflightDialogProps } from "./PreflightDialog";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const scope = {
  description: "Every tracked keyword in this project",
  equation: "248 keywords · 2 markets × 1 device = 496 targets",
  startLabel: "Start run",
  subtitle: "Nothing is sent to the provider until you start.",
  title: "Check all tracked keywords",
} as const;

const preview: RankCheckRunPreview = {
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
  previewToken: "preview-token",
  selectionHash: "selection-hash",
  targetCount: 496,
};

function props(overrides: Partial<PreflightDialogProps> = {}): PreflightDialogProps {
  return {
    budgetHref: "/app/prj_story/settings#provider-usage",
    duplicateRunHref: projectRunsPath("prj_story"),
    initialDepth: 20,
    initialPreview: preview,
    initialProviderId: "provider-dataforseo",
    integrationsHref: "/app/prj_story/integrations",
    launchAction: vi.fn(async () => ({
      estimatedCostCents: 298,
      keywordCount: 248,
      publicId: "rcr_story",
      status: "queued" as const,
      targetCount: 496,
    })),
    onClose: vi.fn(),
    open: true,
    previewAction: vi.fn(async () => preview),
    projectId,
    providers: [
      { id: "provider-dataforseo", label: "DataForSEO", tooltip: "Your own key." },
      { id: "provider-serpapi", label: "SerpApi", tooltip: "Fallback provider." },
    ],
    scope,
    spec: { kind: "all", v: 1 },
    ...overrides,
  };
}

describe("PreflightDialog", () => {
  it("plan criterion: renders one scope box", () => {
    render(<PreflightDialog {...props()} />);

    expect(screen.getAllByLabelText("Run scope")).toHaveLength(1);
    expect(screen.getByText(scope.equation)).toBeInTheDocument();
  });

  it("plan criterion: keeps a sticky footer with duration", () => {
    render(<PreflightDialog {...props()} />);

    const footer = document.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByText("~9 min")).toBeInTheDocument();
  });

  it("plan criterion: labels the start action", () => {
    render(<PreflightDialog {...props()} />);

    expect(screen.getByRole("button", { name: "Start run" })).toBeEnabled();
  });

  it("plan criterion: renders the provider as a choice and refreshes the preview", async () => {
    const user = userEvent.setup();
    const previewAction = vi.fn(async () => preview);
    render(<PreflightDialog {...props({ previewAction })} />);

    await user.click(screen.getByRole("radio", { name: "SerpApi" }));

    expect(previewAction).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "provider-serpapi" }),
    );
  });

  it.each([
    ["budget", "budget_exhausted", "Edit budget"],
    ["no provider", "no_provider", "Open Integrations"],
    ["duplicate", "duplicate", "Open run"],
  ] as const)("plan criterion: blocks %s", (_label, reason, cta) => {
    render(
      <PreflightDialog
        {...props({
          initialPreview: { ...preview, budget: { ...preview.budget, blocked: true, reason } },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Start run" })).toBeDisabled();
    expect(screen.getByRole("link", { name: cta })).toBeInTheDocument();
  });

  it("plan criterion: title mirrors the trigger and names the market scope", () => {
    render(<PreflightDialog {...props()} />);

    expect(screen.getByRole("heading", { name: /Check all tracked keywords/ })).toHaveTextContent(
      "Check all tracked keywordsNothing is sent to the provider until you start.",
    );
    expect(
      screen.getByText("248 keywords · 2 markets × 1 device = 496 targets"),
    ).toBeInTheDocument();
  });

  it("action wiring: calls the merged launch action with the current preview token", async () => {
    const user = userEvent.setup();
    const launchAction = vi.fn(async () => ({
      estimatedCostCents: 298,
      keywordCount: 248,
      publicId: "rcr_story",
      status: "queued" as const,
      targetCount: 496,
    }));
    const onClose = vi.fn();
    render(<PreflightDialog {...props({ launchAction, onClose })} />);

    await user.click(screen.getByRole("button", { name: "Start run" }));

    expect(launchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        previewToken: "preview-token",
        projectId,
        spec: { kind: "all", v: 1 },
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
