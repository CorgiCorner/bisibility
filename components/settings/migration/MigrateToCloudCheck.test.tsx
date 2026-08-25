import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import { isoFromFrozenNow } from "@/tests/clock";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCompatibilityPayload, makePreflightPayload } from "./__tests__/migration.fixtures";
import { CheckStep } from "./MigrateToCloudCheck";
import type { MigrationCompatibilityResult } from "./MigrateToCloudWizard.types";

const mocks = vi.hoisted(() => ({ compatibility: vi.fn(), preflight: vi.fn() }));
vi.mock("@/lib/actions/cloud", () => ({
  getCloudMigrationCompatibility: mocks.compatibility,
  preflightMigrationTarget: mocks.preflight,
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

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
  watch: vi.fn(() => "https://target.example.com"),
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
    form.getValues.mockReturnValue("https://target.example.com");
    form.watch.mockReturnValue("https://target.example.com");
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
    await act(async () => {
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    });
    expect(changed.mock.calls[1]?.[0]).toMatchObject({
      blockers: [{ code: "MIG-101", message: "We couldn't reach the destination instance." }],
      compatible: false,
    });
  });

  it("requires version 4 protocol support and displays a ready result", () => {
    renderStep({
      compatibility: {
        blockers: [],
        checkedAt: isoFromFrozenNow({ hours: 13 }),
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
    expect(document.querySelector(".border-dashed")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Transfer runs the destination preflight again/ }),
    ).toBeInTheDocument();
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
    await act(async () => {
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    });
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

  it("shows a Quick Tunnel hint for a self-hosted loopback destination URL", () => {
    form.watch.mockReturnValue("http://localhost:3000");
    render(
      <DeploymentModeProvider deploymentMode="self-host">
        <CheckStep
          compatibility={null}
          contextKey="ctx"
          direction="to-cloud"
          form={form as never}
          migrationHold={false}
          onCompatibilityChange={vi.fn()}
          projectId={projectId}
        />
      </DeploymentModeProvider>,
    );

    expect(screen.getByText("Running locally?")).toBeInTheDocument();
    expect(screen.getByText("cloudflared tunnel --url http://localhost:3000")).toBeInTheDocument();
  });

  it("suggests a tunnel for LAN only after the destination is unreachable", () => {
    form.watch.mockReturnValue("http://10.0.0.8:3000");
    const unreachable: MigrationCompatibilityResult = {
      blockers: [{ code: "MIG-101", message: "We couldn't reach the destination instance." }],
      checkedAt: isoFromFrozenNow({ hours: 13 }),
      compatible: false,
      contextKey: "ctx",
      source: makeCompatibilityPayload(),
      target: makePreflightPayload({
        appVersion: null,
        latestMigration: null,
        origin: "http://10.0.0.8:3000",
        reachable: false,
        schemaVersionsSupported: null,
        supportsSessions: false,
      }),
    };

    const { rerender } = render(
      <DeploymentModeProvider deploymentMode="self-host">
        <CheckStep
          compatibility={null}
          contextKey="ctx"
          direction="to-cloud"
          form={form as never}
          migrationHold={false}
          onCompatibilityChange={vi.fn()}
          projectId={projectId}
        />
      </DeploymentModeProvider>,
    );
    expect(screen.queryByText(/not reachable from this instance/)).not.toBeInTheDocument();

    rerender(
      <DeploymentModeProvider deploymentMode="self-host">
        <CheckStep
          compatibility={unreachable}
          contextKey="ctx"
          direction="to-cloud"
          form={form as never}
          migrationHold={false}
          onCompatibilityChange={vi.fn()}
          projectId={projectId}
        />
      </DeploymentModeProvider>,
    );
    expect(
      screen.getByText(/use a temporary Cloudflare Tunnel or import a ZIP package/),
    ).toBeInTheDocument();
  });
});
