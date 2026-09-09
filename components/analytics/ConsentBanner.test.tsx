import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ applyAnalyticsConsent: vi.fn(), setAnalyticsReplay: vi.fn() }));

vi.mock("@/lib/analytics/client", () => mocks);

describe("ConsentBanner", () => {
  it("makes refusal a single click and applies the result immediately", async () => {
    const consent = {
      analytics: false,
      decidedAt: 1,
      replay: false,
      status: "decided" as const,
    };
    const saveConsent = vi.fn().mockResolvedValue(consent);
    render(<ConsentBanner saveConsent={saveConsent} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject all" }));

    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith({ analytics: false, replay: false }),
    );
    expect(mocks.applyAnalyticsConsent).toHaveBeenCalledWith(consent);
    expect(mocks.setAnalyticsReplay).toHaveBeenCalledWith(false);
    expect(screen.queryByLabelText("Analytics consent")).not.toBeInTheDocument();
  });

  it("opens settings without granting consent", () => {
    const saveConsent = vi.fn();
    render(<ConsentBanner saveConsent={saveConsent} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Privacy choices" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Usage analytics/ })).not.toBeChecked();
    expect(saveConsent).not.toHaveBeenCalled();
  });

  it("keeps accept and refuse actions the same size", () => {
    render(<ConsentBanner saveConsent={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Accept all" })).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Reject all" })).toHaveClass("w-full");
  });
});
