import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MeasurementPermissions, MeasurementPorts, SettingsSnapshot } from "./contracts";
import { beginMeasurementDraft } from "./draft";
import { MeasurementSettingsEditor } from "./MeasurementSettingsEditor";
import {
  fixtureChoices,
  fixtureNow,
  fixturePermissions,
  fixtureProjectId,
  fixtureQuote,
  fixtureSnapshot,
  fixtureSpec,
  fixtureTranslate as t,
  viewerPermissions,
} from "./test-fixtures";

function ports(): MeasurementPorts {
  return {
    preview: vi.fn<MeasurementPorts["preview"]>(async (request) => ({
      kind: "ready",
      value: fixtureQuote(request),
    })),
    launch: vi.fn<MeasurementPorts["launch"]>(async () => ({
      publicId: "run_synthetic",
      status: "queued",
      keywordCount: 20,
      targetCount: 20,
      estimatedCostCents: 2,
    })),
    saveIntent: vi.fn<MeasurementPorts["saveIntent"]>(async () => ({
      kind: "saved" as const,
      value: fixtureSnapshot,
    })),
    saveSchedule: vi.fn<MeasurementPorts["saveSchedule"]>(async () => ({
      kind: "saved",
      value: { ...fixtureSnapshot, revision: 5 },
    })),
  };
}
function Harness({
  actions,
  permissions = fixturePermissions,
  current = fixtureSnapshot,
  now = () => new Date(fixtureNow),
  currentRateVersion = "synthetic-rate-v1",
  onCancel = () => undefined,
  onFocusReturn = () => undefined,
}: {
  actions: MeasurementPorts;
  permissions?: MeasurementPermissions;
  current?: SettingsSnapshot;
  now?: () => Date;
  currentRateVersion?: string | null;
  onCancel?: () => void;
  onFocusReturn?: () => void;
}) {
  const [draft, onChange] = useState(() => beginMeasurementDraft(fixtureSnapshot));
  return (
    <MeasurementSettingsEditor
      projectId={fixtureProjectId}
      spec={fixtureSpec}
      draft={draft}
      onChange={onChange}
      currentSnapshot={current}
      choices={fixtureChoices}
      currentRateVersion={currentRateVersion}
      permissions={permissions}
      ports={actions}
      translate={t}
      now={now}
      formatDate={(iso) => iso}
      formatCount={String}
      onSaved={() => undefined}
      onStarted={() => undefined}
      onRequestCurrent={() => undefined}
      onCancel={onCancel}
      onFocusReturn={onFocusReturn}
    />
  );
}
async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Review measurement quote" }));
  await screen.findByRole("heading", { name: "Quote and scope review" });
}
describe("measurement controls separate reads/manual launch/schedule intent", () => {
  it("mount, edits, preview and hide never call a paid or schedule port", async () => {
    const actions = ports();
    const view = render(<Harness actions={actions} />);
    expect(actions.preview).not.toHaveBeenCalled();
    expect(actions.launch).not.toHaveBeenCalled();
    expect(actions.saveSchedule).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Device" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mobile" }));
    expect(actions.preview).not.toHaveBeenCalled();
    await preview(user);
    expect(actions.preview).toHaveBeenCalledOnce();
    expect(actions.launch).not.toHaveBeenCalled();
    expect(actions.saveSchedule).not.toHaveBeenCalled();
    view.unmount();
    expect(actions.launch).not.toHaveBeenCalled();
    expect(actions.saveSchedule).not.toHaveBeenCalled();
  });
  it("shows configured versus unknown effective scope, native exact quantity and server cadence count", async () => {
    const actions = ports();
    render(<Harness actions={actions} />);
    await preview(userEvent.setup());
    expect(screen.getByText("2.000000 cents")).toBeInTheDocument();
    expect(screen.getByText(t("effectiveUnknown"))).toBeInTheDocument();
    expect(screen.getByText(/29 due occurrences/)).toBeInTheDocument();
    expect(screen.getByText("Unknown amount")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request manual run" })).toBeDisabled();
    expect(actions.launch).not.toHaveBeenCalled();
  });
  it("requires manual consent and launch click, then calls only the launch port with exact scope/token", async () => {
    const actions = ports();
    render(<Harness actions={actions} />);
    const user = userEvent.setup();
    await preview(user);
    await user.click(screen.getByRole("checkbox", { name: t("manualConsent") }));
    expect(actions.launch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Request manual run" }));
    await waitFor(() =>
      expect(actions.launch).toHaveBeenCalledWith({
        projectId: fixtureProjectId,
        spec: fixtureSpec,
        depth: 20,
        providerId: "dataforseo",
        previewToken: "synthetic-opaque-token-not-a-real-signature",
        expectedRevision: 4,
        expectedSourceHash: fixtureSnapshot.sourceHash,
        scheduleId: fixtureSnapshot.scheduleId,
        measurementToken: "synthetic-measurement-token",
        intent: fixtureSnapshot.selection,
        capabilityVersion: "web-serp-v1",
        confirmed: true,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(actions.saveSchedule).not.toHaveBeenCalled();
  });
  it("does not retain quote visibility or launch affordance after financial preview access is removed", async () => {
    const actions = ports();
    const view = render(<Harness actions={actions} />);
    await preview(userEvent.setup());
    expect(screen.getByText("2.000000 cents")).toBeInTheDocument();
    view.rerender(<Harness actions={actions} permissions={viewerPermissions} />);
    expect(screen.queryByText("2.000000 cents")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Quote and scope review" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review measurement quote" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request manual run" })).toBeDisabled();
    expect(actions.launch).not.toHaveBeenCalled();
  });
  it("changing options after quote invalidates the token review and consent without auto-preview", async () => {
    const actions = ports();
    render(<Harness actions={actions} />);
    const user = userEvent.setup();
    await preview(user);
    await user.click(screen.getByRole("checkbox", { name: t("manualConsent") }));
    await user.click(screen.getByRole("button", { name: "Requested depth" }));
    await user.click(await screen.findByRole("menuitem", { name: "50" }));
    expect(
      screen.queryByRole("heading", { name: "Quote and scope review" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: t("manualConsent") })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Request manual run" })).toBeDisabled();
    expect(actions.preview).toHaveBeenCalledOnce();
    expect(actions.launch).not.toHaveBeenCalled();
  });
  it("saves a separately confirmed frequency intent only after a fresh quote and never launches", async () => {
    const actions = ports();
    render(<Harness actions={actions} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cadence" }));
    await user.click(await screen.findByRole("menuitem", { name: "Weekly" }));
    expect(actions.saveSchedule).not.toHaveBeenCalled();
    await preview(user);
    await user.click(screen.getByRole("checkbox", { name: t("scheduleConsent") }));
    await user.click(screen.getByRole("button", { name: "Save future schedule" }));
    await waitFor(() =>
      expect(actions.saveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: fixtureProjectId,
          scheduleId: fixtureSnapshot.scheduleId,
          expectedRevision: 4,
          confirmed: true,
          previewToken: "synthetic-schedule-token-not-a-manual-token",
          schedule: { ...fixtureSnapshot.schedule, frequency: "weekly" },
        }),
      ),
    );
    expect(actions.launch).not.toHaveBeenCalled();
  });
  it("retains edited values on preview failure and viewer controls cannot mutate", async () => {
    const actions = ports();
    vi.mocked(actions.preview).mockRejectedValue(new Error("secret raw payload"));
    const view = render(<Harness actions={actions} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Device" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mobile" }));
    await user.click(screen.getByRole("button", { name: "Review measurement quote" }));
    await screen.findByText(t("blocks.preview_failed"));
    expect(screen.getByRole("button", { name: "Device" })).toHaveTextContent("Mobile");
    expect(screen.queryByText(/secret raw payload/)).not.toBeInTheDocument();
    view.rerender(<Harness actions={actions} permissions={viewerPermissions} />);
    expect(screen.getByRole("button", { name: "Device" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cadence" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request manual run" })).toBeDisabled();
    expect(actions.launch).not.toHaveBeenCalled();
    expect(actions.saveSchedule).not.toHaveBeenCalled();
  });
  it("checks expiry at click time even if no timer rerender occurred", async () => {
    const actions = ports();
    let current = new Date(fixtureNow);
    render(<Harness actions={actions} now={() => current} />);
    const user = userEvent.setup();
    await preview(user);
    await user.click(screen.getByRole("checkbox", { name: t("manualConsent") }));
    current = new Date("2026-10-12T10:10:00Z");
    await user.click(screen.getByRole("button", { name: "Request manual run" }));
    expect(actions.launch).not.toHaveBeenCalled();
    expect(await screen.findByText(t("blocks.preview_expired"))).toBeInTheDocument();
  });
  it("preserves draft through CAS change and requires explicit comparison/revision adoption plus preview", async () => {
    const actions = ports();
    const view = render(<Harness actions={actions} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Device" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mobile" }));
    view.rerender(
      <Harness
        actions={actions}
        current={{
          ...fixtureSnapshot,
          revision: 5,
          selection: { ...fixtureSnapshot.selection, depth: 50 },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Device" })).toHaveTextContent("Mobile");
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Your draft")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep draft with reviewed revision" }));
    expect(screen.getByRole("button", { name: "Device" })).toHaveTextContent("Mobile");
    expect(screen.getByRole("button", { name: "Request manual run" })).toBeDisabled();
    expect(actions.preview).not.toHaveBeenCalled();
  });
  it("uses keyboard cancel with focus return and restores the baseline without ports", async () => {
    const actions = ports();
    const onCancel = vi.fn();
    const onFocusReturn = vi.fn();
    render(<Harness actions={actions} onCancel={onCancel} onFocusReturn={onFocusReturn} />);
    screen.getByRole("button", { name: "Cancel" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onFocusReturn).toHaveBeenCalledOnce();
    expect(actions.preview).not.toHaveBeenCalled();
    expect(actions.launch).not.toHaveBeenCalled();
    expect(actions.saveSchedule).not.toHaveBeenCalled();
  });
  it("shows unsupported Maps/Finder as disabled choices, preserving the current General configuration", async () => {
    const actions = ports();
    render(<Harness actions={actions} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Google results" }));
    expect(await screen.findByRole("menuitem", { name: "Google Maps" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Google Local Finder" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(actions.launch).not.toHaveBeenCalled();
  });
});
