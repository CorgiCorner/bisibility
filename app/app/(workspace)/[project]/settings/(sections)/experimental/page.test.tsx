import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExperimentalSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  getExperimentalModules: vi.fn(),
  requireReadableProject: vi.fn(),
  sectionProps: undefined as unknown,
  shellProps: undefined as unknown,
}));

vi.mock("@/components/settings/experimental/ExperimentalModulesSection", () => ({
  ExperimentalModulesSection: (props: unknown) => {
    mocks.sectionProps = props;
    return <div data-experimental-modules-section="" />;
  },
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: (props: { children: ReactNode }) => {
    mocks.shellProps = props;
    return <main>{props.children}</main>;
  },
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/experimental-modules", () => ({
  getExperimentalModules: mocks.getExperimentalModules,
}));

describe("ExperimentalSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "member" }] },
      project: { id: "project_1", publicId: "prj_resolved", writeMode: "active" },
    });
    mocks.getExperimentalModules.mockResolvedValue(["timeline"]);
  });

  it("supplies the project module settings with member update capability", async () => {
    render(
      await ExperimentalSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
    );

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.getExperimentalModules).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.shellProps).toEqual(expect.objectContaining({ activeSection: "experimental" }));
    expect(mocks.sectionProps).toEqual({
      canEdit: true,
      enabledExperimentalModules: ["timeline"],
      projectId: "prj_resolved",
    });
  });

  it("keeps the module controls read-only when the project is not writable", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "member" }] },
      project: { id: "project_1", publicId: "prj_resolved", writeMode: "migration_hold" },
    });

    render(
      await ExperimentalSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
    );

    expect(mocks.sectionProps).toEqual(expect.objectContaining({ canEdit: false }));
  });
});
