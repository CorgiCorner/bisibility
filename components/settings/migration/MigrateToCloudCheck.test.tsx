import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckStep } from "./MigrateToCloudCheck";

const mocks = vi.hoisted(() => ({ compatibility: vi.fn(), preflight: vi.fn() }));
vi.mock("@/lib/actions/cloud", () => ({
  getCloudMigrationCompatibility: mocks.compatibility,
  preflightMigrationTarget: mocks.preflight,
}));

const projectId = "prj_abcdefghijklmnopqrstuvwx";

const source = {
  appVersion: "1.0.0",
  appVersionSource: "package.json",
  cloudOrigin: "https://bisibility.com",
  data: { keywords: 10, rankChecks: 20 },
  limits: { pushMaxKeywords: 500, sessionsRequired: false },
  schema: { count: 2, latest: null },
};
const form = {
  formState: { dirtyFields: { targetOrigin: true }, errors: {} },
  getValues: vi.fn(() => "https://target.example.com"),
  register: vi.fn(() => ({})),
  trigger: vi.fn(async () => true),
};

function renderStep(overrides: Record<string, unknown> = {}) {
  const onCompatibilityChange = vi.fn();
  render(
    <CheckStep
      compatibility={null}
      contextKey="ctx"
      direction="to-cloud"
      form={form as never}
      migrationHold={false}
      onCompatibilityChange={onCompatibilityChange}
      projectId={projectId}
      {...overrides}
    />,
  );
  return onCompatibilityChange;
}

describe("migration compatibility check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compatibility.mockResolvedValue(source);
  });

  it("blocks an unreachable destination with the default reason", async () => {
    mocks.preflight.mockResolvedValue({
      appVersion: null,
      latestMigration: null,
      origin: "https://target.example.com",
      reachable: false,
      sameInstance: false,
      schemaVersionsSupported: null,
      sourceDeploymentMode: "self-host",
      supportsSessions: false,
    });
    const changed = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Run compatibility check" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    expect(changed.mock.calls[1]?.[0]).toMatchObject({
      blockers: [{ code: "MIG-101", message: "We couldn't reach the destination instance." }],
      compatible: false,
    });
  });

  it("requires version 4 protocol support and displays a ready result", () => {
    renderStep({
      compatibility: {
        blockers: [],
        checkedAt: "2026-07-11T12:00:00.000Z",
        compatible: true,
        contextKey: "ctx",
        source: { ...source, limits: { ...source.limits, sessionsRequired: true } },
        target: {
          appVersion: "2.0.0",
          latestMigration: "migration_2",
          origin: "https://target.example.com",
          reachable: true,
          sameInstance: false,
          schemaVersionsSupported: [5],
          sourceDeploymentMode: "self-host",
          supportsSessions: true,
        },
      },
      holdPending: true,
    });
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(screen.getByText(/will move in resumable chunks/)).toBeInTheDocument();
    expect(screen.getByText("Enabling read-only mode")).toBeInTheDocument();
    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(screen.getByText(/Required import protocol v5/)).toBeInTheDocument();
  });

  it("blocks a destination that points at this same instance", async () => {
    mocks.preflight.mockResolvedValue({
      appVersion: "1.0.0",
      latestMigration: "migration_1",
      origin: "https://target.example.com",
      reachable: true,
      sameInstance: true,
      schemaVersionsSupported: [5],
      sourceDeploymentMode: "self-host",
      supportsSessions: true,
    });
    const changed = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Run compatibility check" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    expect(changed.mock.calls[1]?.[0]).toMatchObject({
      blockers: [
        { code: "MIG-105", message: "The destination address points at this same instance." },
      ],
      compatible: false,
    });
    expect(mocks.preflight).toHaveBeenCalledWith({
      projectId,
      targetOrigin: "https://target.example.com",
    });
  });

  it("shows action failures and stops when self-host URL validation fails", async () => {
    mocks.compatibility.mockRejectedValue(new Error("Source unavailable"));
    const changed = renderStep({ direction: "to-self-host" });
    fireEvent.click(screen.getByRole("button", { name: "Run compatibility check" }));
    expect(form.trigger).toHaveBeenCalledWith("targetOrigin");
    expect(await screen.findByText("Source unavailable")).toBeInTheDocument();
    expect(changed).toHaveBeenCalledWith(null);
  });
});
