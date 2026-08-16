import { appPath } from "@/lib/routing/app-path";
import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderReadyStep } from "./step-first-check-test-support";

describe("StepFirstCheck", () => {
  it("does not block opening the dashboard while preview is running", async () => {
    const never = new Promise<never>(() => undefined);
    renderReadyStep({
      runFirstCheckPreviewAction: vi.fn(() => never),
    });

    fireEvent.click(screen.getByRole("button", { name: /Run \d+ sample checks?/i }));
    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith(appPath("prj_1", "dashboard")),
    );
  });

  it("reconciles the draft markets and marks onboarding complete before opening the dashboard", async () => {
    const completeOnboardingAction = vi.fn(async () => undefined);
    const saveMarketsAction = vi.fn(async (input) => ({ marketKeys: input.marketKeys }));
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
    expect(saveMarketsAction).toHaveBeenCalledWith({ marketKeys: ["US"], projectId: "prj_1" });
    expect(completeOnboardingAction).toHaveBeenCalledWith({ projectId: "prj_1" });
    expect(saveMarketsAction.mock.invocationCallOrder[0]).toBeLessThan(
      completeOnboardingAction.mock.invocationCallOrder[0] ?? 0,
    );
    expect(completeOnboardingAction.mock.invocationCallOrder[0]).toBeLessThan(
      routerMock.push.mock.invocationCallOrder[0] ?? 0,
    );
    expect(routerMock.push).toHaveBeenCalledWith(appPath("prj_1", "dashboard"));
  });

  it("coalesces double submit into one reconcile, completion, and navigation", async () => {
    const saving = deferred<{ marketKeys: string[] }>();
    const saveMarketsAction = vi.fn(() => saving.promise);
    const completeOnboardingAction = vi.fn(async () => undefined);
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });
    const form = screen.getByText("Run your first check").closest("form");
    if (!form) throw new Error("First-check form was not rendered.");

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(saveMarketsAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeDisabled();
    saving.resolve({ marketKeys: ["US"] });
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(completeOnboardingAction).toHaveBeenCalledTimes(1);
  });

  it("stays locked after successful navigation until the step unmounts", async () => {
    const saveMarketsAction = vi.fn(async () => ({ marketKeys: ["US"] }));
    const completeOnboardingAction = vi.fn(async () => undefined);
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });
    const form = screen.getByText("Run your first check").closest("form");
    if (!form) throw new Error("First-check form was not rendered.");

    fireEvent.submit(form);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeDisabled();
    fireEvent.submit(form);

    expect(saveMarketsAction).toHaveBeenCalledTimes(1);
    expect(completeOnboardingAction).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledTimes(1);
  });

  it("recovers from a reconciliation error and allows one successful retry", async () => {
    const completeOnboardingAction = vi.fn(async () => undefined);
    let attempts = 0;
    const saveMarketsAction = vi.fn(async (input) => {
      if (attempts++ === 0) throw new Error("Market selection could not be saved.");
      return { marketKeys: input.marketKeys };
    });
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Market selection could not be saved.",
    );
    expect(completeOnboardingAction).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(saveMarketsAction).toHaveBeenCalledTimes(2);
    expect(completeOnboardingAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
