import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  defaultPublicProjectId,
  makeCompatibilityPayload,
  makePreflightPayload,
} from "./__tests__/migration.fixtures";
import { useMigrationWizardState } from "./useMigrationWizardState";
import { COMPATIBILITY_TTL_MS } from "./useMigrationWizardState.helpers";

type Options = Parameters<typeof useMigrationWizardState>[0];

function renderWizard(overrides: Partial<Options> = {}) {
  const options: Options = {
    defaultTargetOrigin: "https://target.example.com",
    direction: "to-self-host",
    enableMigrationHold: vi.fn(async () => ({})),
    initialMigrationHold: false,
    onClose: vi.fn(),
    projectId: defaultPublicProjectId,
    ...overrides,
  };
  const rendered = renderHook(useMigrationWizardState, { initialProps: options });
  function markChecked(compatible = true) {
    act(() =>
      rendered.result.current.setCheckedCompatibility({
        blockers: [],
        checkedAt: new Date(Date.now()).toISOString(),
        compatible,
        contextKey: rendered.result.current.compatibilityContextKey,
        source: makeCompatibilityPayload(),
        target: makePreflightPayload(),
      }),
    );
  }
  return { ...rendered, markChecked, options };
}

describe("migration wizard compatibility lifetime", () => {
  it("requires a check before continuing and keeps the hold untouched", () => {
    const { result, options } = renderWizard();
    expect(result.current.compatibility).toBeNull();
    expect(result.current.continueDisabled).toBe(true);
    expect(result.current.continueHint).toBe("Run compatibility check first");
    expect(options.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("invalidates compatibility after the destination URL changes", () => {
    const { result, markChecked, options } = renderWizard();
    markChecked();
    expect(result.current.continueDisabled).toBe(false);
    act(() => result.current.form.setValue("targetOrigin", "https://other.example.com"));
    expect(result.current.compatibility).toBeNull();
    expect(result.current.continueDisabled).toBe(true);
    expect(result.current.continueHint).toBe("Run compatibility check first");
    expect(options.enableMigrationHold).not.toHaveBeenCalled();
  });

  it.each([{ projectId: "prj_zbcdefghijklmnopqrstuvwx" }, { direction: "to-cloud" as const }])(
    "invalidates compatibility after the migration scope changes to %j",
    (change) => {
      const { result, markChecked, options, rerender } = renderWizard();
      markChecked();
      expect(result.current.continueDisabled).toBe(false);
      rerender({ ...options, ...change });
      expect(result.current.compatibility).toBeNull();
      expect(result.current.continueDisabled).toBe(true);
      expect(result.current.continueHint).toBe("Run compatibility check first");
      expect(options.enableMigrationHold).not.toHaveBeenCalled();
    },
  );

  it("rejects a compatibility result older than five minutes before enabling the hold", async () => {
    const { result, markChecked, options } = renderWizard();
    markChecked();
    expect(result.current.continueDisabled).toBe(false);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + COMPATIBILITY_TTL_MS + 1);
    try {
      await act(async () => result.current.handleNext());
      await waitFor(() =>
        expect(result.current.gateMessage).toBe(
          "Run a current compatibility check before continuing.",
        ),
      );
      expect(result.current.compatibility).toBeNull();
      expect(result.current.continueDisabled).toBe(true);
      expect(result.current.holdConfirmOpen).toBe(false);
      expect(options.enableMigrationHold).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("requires explicit confirmation even after a fresh successful check", async () => {
    const { result, markChecked, options } = renderWizard();
    markChecked();
    await act(async () => result.current.handleNext());
    await waitFor(() => expect(result.current.holdConfirmOpen).toBe(true));
    expect(result.current.step).toBe(1);
    expect(options.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("keeps a fresh blocked result from enabling the hold", async () => {
    const { result, markChecked, options } = renderWizard();
    markChecked(false);
    expect(result.current.continueDisabled).toBe(true);
    await act(async () => result.current.handleNext());
    await waitFor(() =>
      expect(result.current.gateMessage).toBe(
        "Resolve the compatibility blockers before continuing.",
      ),
    );
    expect(result.current.holdConfirmOpen).toBe(false);
    expect(options.enableMigrationHold).not.toHaveBeenCalled();
  });
});
