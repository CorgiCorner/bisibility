import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import messages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ComparisonActions, ProviderComparisonCard } from "./ProviderComparisonCard";

vi.mock("@/lib/actions/provider-comparison", () => ({
  loadProviderComparisonAction: vi.fn(),
  previewProviderComparisonAction: vi.fn(),
  launchProviderComparisonAction: vi.fn(),
  readProviderComparisonAction: vi.fn(),
}));
const keyword = {
  id: "kw_ref",
  text: "plumber",
  device: "desktop" as const,
  locationLabel: "Warsaw",
};
const context = { keyword, providers: [], available: true };
const preview = {
  id: "preview",
  hash: "a".repeat(64),
  expiresAt: "2026-10-15T12:00:00Z",
  keyword,
  depth: 20 as const,
  sides: [
    {
      provider: "dataforseo" as const,
      estimatedCostCents: 1,
      nativeUnit: "cents" as const,
      nativeQuantity: 1,
      fundingSource: "own" as const,
    },
    {
      provider: "serpapi" as const,
      estimatedCostCents: 0,
      nativeUnit: "searches" as const,
      nativeQuantity: 2,
      fundingSource: "own" as const,
    },
  ],
};
let actions: ComparisonActions;
beforeEach(() => {
  actions = {
    load: vi.fn().mockResolvedValue({ ok: true, context, run: null }),
    preview: vi.fn().mockResolvedValue({ ok: true, preview }),
    launch: vi.fn().mockResolvedValue({ ok: false, reason: "unconfirmed" }),
    read: vi.fn(),
  };
});
function render(canLaunch = true) {
  return renderWithFeatureMessages(
    <ProviderComparisonCard
      projectRef="prj_ref"
      keywordRef="kw_ref"
      canLaunch={canLaunch}
      timeZone="UTC"
      actions={actions}
    />,
    { messages },
  );
}
describe("one-time comparison workflow", () => {
  it("makes no read or paid command on mount; one provider shows setup without a launch action", async () => {
    vi.mocked(actions.load).mockResolvedValue({
      ok: true,
      context: { ...context, available: false },
      run: null,
    });
    render();
    expect(actions.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open comparison" }));
    expect(
      await screen.findByText("Connect both DataForSEO and SerpApi to compare results."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review cost" })).not.toBeInTheDocument();
    expect(actions.preview).not.toHaveBeenCalled();
    expect(actions.launch).not.toHaveBeenCalled();
  });
  it("a viewer cannot preview or launch", async () => {
    render(false);
    fireEvent.click(screen.getByRole("button", { name: "Open comparison" }));
    await screen.findByText(/Warsaw/);
    expect(screen.queryByRole("button", { name: "Review cost" })).not.toBeInTheDocument();
    expect(actions.launch).not.toHaveBeenCalled();
  });
  it("requires explicit cost review and preserves operation identity after an uncertain launch", async () => {
    render();
    fireEvent.click(screen.getByRole("button", { name: "Open comparison" }));
    const reviewButton = await screen.findByRole("button", { name: "Review cost" });
    await waitFor(() => expect(reviewButton).not.toBeDisabled());
    fireEvent.click(reviewButton);
    expect(await screen.findByText("2 searches")).toBeInTheDocument();
    expect(actions.launch).not.toHaveBeenCalled();
    const launchButton = screen.getByRole("button", { name: "Run comparison" });
    await waitFor(() => expect(launchButton).not.toBeDisabled());
    fireEvent.click(launchButton);
    const retry = await screen.findByRole("button", { name: "Check launch status" });
    await waitFor(() => expect(retry).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(actions.launch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(actions.launch).mock.calls[0]).toEqual(
      vi.mocked(actions.launch).mock.calls[1],
    );
    expect(actions.preview).toHaveBeenCalledTimes(1);
  });
  it("lets a definitive expired-preview rejection request a fresh quote", async () => {
    vi.mocked(actions.launch).mockResolvedValue({ ok: false, reason: "preview_changed" });
    render();
    fireEvent.click(screen.getByRole("button", { name: "Open comparison" }));
    const reviewButton = await screen.findByRole("button", { name: "Review cost" });
    await waitFor(() => expect(reviewButton).not.toBeDisabled());
    fireEvent.click(reviewButton);
    const launchButton = await screen.findByRole("button", { name: "Run comparison" });
    await waitFor(() => expect(launchButton).not.toBeDisabled());
    fireEvent.click(launchButton);
    expect(await screen.findByRole("button", { name: "Review cost" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check launch status" })).not.toBeInTheDocument();
  });
});
