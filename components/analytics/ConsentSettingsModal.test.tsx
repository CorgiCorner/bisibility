import { ConsentSettingsModal } from "@/components/analytics/ConsentSettingsModal";
import { pendingConsent } from "@/lib/analytics/consent";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ applyAnalyticsConsent: vi.fn(), setAnalyticsReplay: vi.fn() }));

vi.mock("@/lib/analytics/client", () => mocks);

describe("ConsentSettingsModal", () => {
  it("allows replay independently from usage analytics", () => {
    render(
      <ConsentSettingsModal
        initialConsent={pendingConsent()}
        onClose={vi.fn()}
        open
        saveConsent={vi.fn()}
      />,
    );

    const replay = screen.getByRole("switch", { name: /Replays/ });
    expect(replay).toBeEnabled();
    fireEvent.click(replay);
    fireEvent.click(screen.getByRole("switch", { name: /Usage analytics/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Usage analytics/ }));
    expect(replay).toBeChecked();
  });

  it("rejects both optional categories in one click", async () => {
    const saved = { analytics: false, decidedAt: 1, replay: false, status: "decided" as const };
    const saveConsent = vi.fn().mockResolvedValue(saved);
    render(
      <ConsentSettingsModal
        initialConsent={{ ...saved, analytics: true, replay: true }}
        onClose={vi.fn()}
        open
        saveConsent={saveConsent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith({ analytics: false, replay: false }),
    );
    expect(mocks.setAnalyticsReplay).toHaveBeenCalledWith(false);
  });

  it("blocks duplicate quick actions and edits while saving", async () => {
    const saveConsent = vi.fn(() => new Promise<never>(() => undefined));
    render(
      <ConsentSettingsModal
        initialConsent={pendingConsent()}
        onClose={vi.fn()}
        open
        saveConsent={saveConsent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    for (const name of ["Reject all", "Accept all", "Save", "Close modal"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("switch", { name: /Usage analytics/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(saveConsent).toHaveBeenCalledOnce();
  });

  it("saves the two switch choices through the shared action", async () => {
    const saved = { analytics: true, decidedAt: 1, replay: true, status: "decided" as const };
    const saveConsent = vi.fn().mockResolvedValue(saved);
    const onClose = vi.fn();
    render(
      <ConsentSettingsModal
        initialConsent={pendingConsent()}
        onClose={onClose}
        open
        saveConsent={saveConsent}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /Usage analytics/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Replays/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith({ analytics: true, replay: true }),
    );
    expect(mocks.applyAnalyticsConsent).toHaveBeenCalledWith(saved);
    expect(mocks.setAnalyticsReplay).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
