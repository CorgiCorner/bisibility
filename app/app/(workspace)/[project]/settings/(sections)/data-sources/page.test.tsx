import DataSourcesSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/data-sources/page";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contentProps: undefined as unknown,
  getSettings: vi.fn(),
  requireReadableProject: vi.fn(),
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/settings/data-sources/DataSourcesSettingsContent", () => ({
  DataSourcesSettingsContent: (props: unknown) => {
    mocks.contentProps = props;
    return <div data-data-sources-content-test="" />;
  },
}));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("DataSourcesSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({
      defaults: { inspectionDailyLimit: 100 },
      project: { projectId: "prj_1", writeMode: "active" },
    });
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        id: "user_1",
        memberships: [{ projectId: "project_1", role: "member" }],
        role: "viewer",
      },
      project: { id: "project_1", publicId: "prj_1" },
    });
  });
  it("renders the moved data-source controls with project capability", async () => {
    const { container } = render(
      await DataSourcesSettingsPage({ params: Promise.resolve({ project: "prj_1" }) }),
    );
    expect(
      container.querySelector('[data-settings-section-slot="data-sources"]'),
    ).toBeInTheDocument();
    expect(mocks.contentProps).toEqual(
      expect.objectContaining({ canEdit: true, projectId: "prj_1" }),
    );
  });
});
