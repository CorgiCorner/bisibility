import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderReadyStep } from "./step-first-check-test-support";

describe("StepFirstCheck without keywords", () => {
  it.each([true, false])(
    "explains skipped keywords and completes setup with providerConnected=%s",
    async (providerConnected) => {
      const completeOnboardingAction = vi.fn(async () => undefined);
      const listFirstCheckCandidatesAction = vi.fn();
      const runFirstCheckPreviewAction = vi.fn();
      const onBack = vi.fn();
      renderReadyStep({
        completeOnboardingAction,
        keywordCount: 0,
        keywordDraft: "",
        listFirstCheckCandidatesAction,
        onBack,
        providerConnected,
        runFirstCheckPreviewAction,
      });

      expect(
        screen.getByText(
          "No keywords added yet. Go back to add keywords, or open the app and add them later.",
        ),
      ).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Retry loading keyword" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Run check" })).not.toBeInTheDocument();
      expect(screen.queryByText(/checks run once now/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Optional: check 1 keyword now/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open app" })).toHaveAttribute(
        "data-variant",
        "primary",
      );

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(onBack).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Open app" }));
      await waitFor(() =>
        expect(completeOnboardingAction).toHaveBeenCalledWith({ projectId: "prj_1" }),
      );
      expect(listFirstCheckCandidatesAction).not.toHaveBeenCalled();
      expect(runFirstCheckPreviewAction).not.toHaveBeenCalled();
    },
  );

  it("keeps an unfinished keyword draft from offering a check after skipping", () => {
    renderReadyStep({ keywordCount: 0, keywordDraft: "unsaved keyword" });

    expect(screen.queryByRole("button", { name: "Run check" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry loading keyword" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/onboarding?step=3&projectId=prj_1&providerId=dataforseo",
    );
  });
});
