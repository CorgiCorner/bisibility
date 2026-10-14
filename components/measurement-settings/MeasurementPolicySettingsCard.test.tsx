import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeasurementPolicySettingsCard } from "./MeasurementPolicySettingsCard";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const snapshot = { state: "unconfigured" as const, policyEpoch: "0", config: null };
describe("explicit measurement policy settings", () => {
  it("does not configure on read and saves blank values as unknown only after user intent", async () => {
    const configure = vi.fn(async () => ({
      kind: "saved" as const,
      changed: true,
      policyEpoch: "1",
      repreviewRequired: true as const,
    }));
    render(
      <MeasurementPolicySettingsCard
        canEdit
        projectId="prj_fixture"
        configure={configure}
        snapshot={snapshot}
      />,
    );
    expect(configure).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^configure$/ }));
    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith({
        projectId: "prj_fixture",
        expectedPolicyEpoch: "0",
        manualTtlMs: null,
        cadenceGraceMs: null,
        confirmed: true,
      }),
    );
  });
  it("keeps viewer read-only with no configure action", () => {
    const configure = vi.fn();
    render(
      <MeasurementPolicySettingsCard
        canEdit={false}
        projectId="prj_fixture"
        configure={configure}
        snapshot={snapshot}
      />,
    );
    expect(screen.queryByRole("button", { name: /^configure$/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(configure).not.toHaveBeenCalled();
  });
  it("rejects invalid duration before any server mutation", async () => {
    const configure = vi.fn();
    render(
      <MeasurementPolicySettingsCard
        canEdit
        projectId="prj_fixture"
        configure={configure}
        snapshot={snapshot}
      />,
    );
    fireEvent.change(screen.getByLabelText("manual"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /^configure$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("notices.invalid");
    expect(configure).not.toHaveBeenCalled();
  });
});
