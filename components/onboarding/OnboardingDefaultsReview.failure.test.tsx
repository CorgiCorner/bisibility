import { renderWithOnboardingMessages } from "@/i18n/test-support/render-with-feature-messages";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingDefaultsReview } from "./OnboardingDefaultsReview";
import type { OnboardingWizardActions } from "./onboarding-wizard-actions";
import { confirmDefaultsFixture, previewDefaultsFixture } from "./reviewed-defaults-test-fixture";
import { useReviewedOnboardingDefaults } from "./use-reviewed-onboarding-defaults";

const defaults = {
  ...projectDefaultsSchema.parse({ projectId: "prj_1", frequency: "daily", timezone: "UTC" }),
  devices: ["desktop" as const],
  locations: ["US"],
  locationSelections: [],
};
function Harness({
  preview,
  save,
}: {
  preview: OnboardingWizardActions["previewProjectDefaultsAction"];
  save: OnboardingWizardActions["updateProjectDefaultsAction"];
}) {
  const [next, setNext] = useState<string | null>("2026-08-29T06:00:00.000Z");
  const { reviewed, error, handleTimezoneChange } = useReviewedOnboardingDefaults(
    {
      previewProjectDefaultsAction: preview,
      updateProjectDefaultsAction: save,
    } as OnboardingWizardActions,
    defaults,
    () => undefined,
    () => setNext(null),
    setNext,
  );
  return (
    <>
      <output aria-label="Authoritative next dispatch">{next ?? "Unknown"}</output>
      <button
        type="button"
        onClick={() => {
          void handleTimezoneChange("Europe/Warsaw");
        }}
      >
        Change timezone
      </button>
      <OnboardingDefaultsReview
        active
        reviewed={reviewed}
        error={error}
        onConfirm={() => {
          void handleTimezoneChange("Europe/Warsaw");
        }}
      />
    </>
  );
}
function edit() {
  fireEvent.click(screen.getByRole("button", { name: "Change timezone" }));
}
function nextDispatch() {
  return screen.getByLabelText("Authoritative next dispatch");
}
describe("onboarding timezone save failures", () => {
  it("clears stale dispatch and offers another review after preview rejection", async () => {
    const save = vi.fn(async () => ({ kind: "saved", nextCheckAt: null }));
    const preview = vi
      .fn(previewDefaultsFixture)
      .mockRejectedValueOnce(new Error("preview offline"));
    renderWithOnboardingMessages(<Harness preview={preview} save={save} />);
    edit();
    expect(nextDispatch()).toHaveTextContent("Unknown");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check defaults could not be saved.",
    );
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("requires a fresh consent after a rejected stale review", async () => {
    const save = vi.fn(async () => ({
      kind: "not_saved",
      code: "stale_preview",
      nextCheckAt: null,
    }));
    renderWithOnboardingMessages(<Harness preview={previewDefaultsFixture} save={save} />);
    edit();
    await confirmDefaultsFixture("Confirm reviewed save");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(nextDispatch()).toHaveTextContent("Unknown");
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm reviewed save" })).toBeDisabled();
    expect(save).toHaveBeenCalledOnce();
  });
  it("recovers the exact unresolved save and restores only the server dispatch", async () => {
    const save = vi
      .fn(async () => ({ kind: "saved", nextCheckAt: "2026-08-30T06:00:00.000Z" }))
      .mockRejectedValueOnce(new Error("response lost"));
    renderWithOnboardingMessages(<Harness preview={previewDefaultsFixture} save={save} />);
    edit();
    await confirmDefaultsFixture("Confirm reviewed save");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(nextDispatch()).toHaveTextContent("Unknown");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recover same save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
    await waitFor(() => expect(nextDispatch()).toHaveTextContent("2026-08-30T06:00:00.000Z"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
