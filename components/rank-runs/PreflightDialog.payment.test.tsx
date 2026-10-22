import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreflightDialog, type PreflightDialogProps } from "./PreflightDialog";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const preview: RankCheckRunPreview = {
  payment: paymentQuote(),
  budget: {
    blocked: false,
    mode: "legacy",
    reason: null,
    remainingAfterCents: 1_602,
    spentCents: 3_100,
  } as RankCheckRunPreview["budget"],
  estimate: { costCents: 298, perTargetCents: 0.6, unknownCostTargets: 0 },
  excluded: [],
  executable: 1,
  expiresAt: "2099-09-03T12:00:00.000Z",
  keywordCount: 1,
  matched: 1,
  overlapRunCount: 0,
  overlaps: [],
  previewToken: "preview-token",
  selectionHash: "selection-hash",
  targetCount: 1,
};

function props(overrides: Partial<PreflightDialogProps> = {}): PreflightDialogProps {
  return {
    budgetHref: "/app/prj_story/settings#provider-usage",
    cancelRunAction: vi.fn(async () => undefined),
    duplicateRunHref: projectRunsPath("prj_story"),
    initialDepth: 20,
    initialPreview: preview,
    initialProviderId: "provider-dataforseo",
    integrationsHref: "/app/prj_story/integrations",
    launchAction: vi.fn(),
    onClose: vi.fn(),
    open: true,
    previewAction: vi.fn(async () => preview),
    projectId,
    providers: [{ id: "provider-dataforseo", label: "DataForSEO", tooltip: "Your own key." }],
    scope: {
      description: "One keyword",
      equation: "1 keyword",
      startLabel: "Start run",
      subtitle: "Nothing is sent until you start.",
      title: "Check one keyword",
    },
    spec: { kind: "all", v: 1 },
    ...overrides,
  };
}

describe("PreflightDialog payment failures", () => {
  it("shows an unavailable payment without requesting another estimate", async () => {
    const user = userEvent.setup();
    const previewAction = vi.fn(async () => preview);
    const launchAction = vi.fn(async () => ({
      code: "payment_unavailable" as const,
      message: "payment_unavailable",
      status: "not_started" as const,
    }));
    render(<PreflightDialog {...props({ launchAction, previewAction })} />);

    await user.click(screen.getByRole("button", { name: /^Start run/ }));

    expect(previewAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Payment details for this provider are unavailable. Check the payment source in Usage.",
    );
  });

  it("stops re-signing after a second consecutive preview mismatch", async () => {
    const user = userEvent.setup();
    const previewAction = vi.fn(async () => ({ ...preview, previewToken: "refreshed-token" }));
    const launchAction = vi.fn(async () => ({
      code: "preview_mismatch" as const,
      message: "Rank-check preview token mismatch.",
      status: "not_started" as const,
    }));
    render(<PreflightDialog {...props({ launchAction, previewAction })} />);

    await user.click(screen.getByRole("button", { name: /^Start run/ }));

    expect(previewAction).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent("Run details changed");

    await user.click(screen.getByRole("button", { name: /^Start run/ }));

    expect(previewAction).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not start this run. Try again.");
  });
});
