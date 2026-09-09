import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultPublicProjectId,
  makeCompatibilityPayload,
  makeLegacyPreflightPayload,
  makePreflightFailurePayload,
  makePreflightPayload,
  makeUnsupportedPreflightPayload,
} from "./__tests__/migration.fixtures";
import { CheckStep } from "./MigrateToCloudCheck";
import { useMigrationWizardState } from "./useMigrationWizardState";

const mocks = vi.hoisted(() => ({
  getCloudMigrationCompatibility: vi.fn(),
  preflightMigrationTarget: vi.fn(),
  enableMigrationHold: vi.fn(async () => ({})),
}));
vi.mock("@/lib/actions/cloud", () => mocks);

function renderCheck() {
  let current: ReturnType<typeof useMigrationWizardState>;
  function CompatibilityStep() {
    const state = useMigrationWizardState({
      defaultTargetOrigin: "https://example.com",
      direction: "to-cloud",
      enableMigrationHold: mocks.enableMigrationHold,
      initialMigrationHold: false,
      onClose: vi.fn(),
      projectId: defaultPublicProjectId,
    });
    current = state;
    return (
      <CheckStep
        compatibility={state.compatibility}
        contextKey={state.compatibilityContextKey}
        direction="to-cloud"
        form={state.form}
        migrationHold={false}
        onCompatibilityChange={state.setCheckedCompatibility}
        projectId={defaultPublicProjectId}
      />
    );
  }
  render(<CompatibilityStep />);
  return { state: () => current };
}

describe("migration destination validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCloudMigrationCompatibility.mockResolvedValue(makeCompatibilityPayload());
    mocks.preflightMigrationTarget.mockResolvedValue(makePreflightPayload());
  });
  it("renders a configured target failure inline without reclassifying the default as user input", async () => {
    const message =
      "Migration target configuration is invalid. Check BISIBILITY_CLOUD_URL or the site URL. Target URL port must be empty, 80, 443, or 8443.";
    mocks.preflightMigrationTarget.mockResolvedValueOnce(makePreflightFailurePayload(message));
    const { state } = renderCheck();

    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mocks.preflightMigrationTarget).toHaveBeenCalledWith({
      projectId: defaultPublicProjectId,
    });
    expect(state().continueDisabled).toBe(true);
  });

  it("renders a rejected user target inline with the validator reason", async () => {
    const message = "Target URL port must be empty, 80, 443, or 8443.";
    mocks.preflightMigrationTarget.mockResolvedValueOnce(makePreflightFailurePayload(message));
    const { state } = renderCheck();
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://target.example.com:3000" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mocks.preflightMigrationTarget).toHaveBeenCalledWith({
      projectId: defaultPublicProjectId,
      targetOrigin: "https://target.example.com:3000",
    });
    expect(state().continueDisabled).toBe(true);
  });

  it("blocks a reachable target that lacks the required package protocol", async () => {
    mocks.preflightMigrationTarget.mockResolvedValueOnce(makeLegacyPreflightPayload());
    const { state } = renderCheck();
    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(
      await screen.findByText(/doesn't support the transfer format this project needs/i),
    ).toBeInTheDocument();
    expect(screen.getByText("MIG-104")).toBeInTheDocument();
    expect(state().continueDisabled).toBe(true);
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("blocks a reachable target when protocol versions are missing", async () => {
    mocks.preflightMigrationTarget.mockResolvedValueOnce(makeUnsupportedPreflightPayload());
    const { state } = renderCheck();
    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(
      await screen.findByText(/didn't report which import formats it supports/i),
    ).toBeInTheDocument();
    expect(screen.getByText("MIG-103")).toBeInTheDocument();
    expect(state().continueDisabled).toBe(true);
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  });
});
