import TrackingSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/tracking/page";
import type { Role } from "@/lib/generated/prisma/client";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getProjectMarkets: vi.fn(),
  marketProps: undefined as unknown,
  requireReadableProject: vi.fn(),
  sectionProps: undefined as unknown,
}));

vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/settings/tracking/TrackingSettingsSection", () => ({
  TrackingSettingsSection: (props: unknown) => {
    mocks.sectionProps = props;
    return <div data-tracking-section-test="" />;
  },
}));
vi.mock("@/components/settings/markets/TrackedMarketsContent", () => ({
  TrackedMarketsContent: (props: unknown) => {
    mocks.marketProps = props;
    return <div data-markets-content-test="" />;
  },
}));
vi.mock("@/lib/actions/project-markets", () => ({
  addProjectMarkets: vi.fn(),
  removeProjectMarketFromProject: vi.fn(),
  setProjectMarketEnabled: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/project-markets", () => ({ getProjectMarkets: mocks.getProjectMarkets }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.getSettings }));

const defaults = {
  inspectionDailyLimit: 100,
  schedule: { cron_expression: null, frequency: "daily", timezone: "UTC" },
};

function mockPage(
  membershipRole: Role,
  writeMode: "active" | "migrated" | "migration_hold" = "active",
  globalRole: Role = "viewer",
) {
  mocks.getSettings.mockResolvedValue({
    defaults,
    project: { domain: "example.com", projectId: "prj_1", writeMode },
  });
  mocks.requireReadableProject.mockResolvedValue({
    actor: {
      id: "user_1",
      memberships: [{ projectId: "project_1", role: membershipRole }],
      role: globalRole,
    },
    project: { id: "project_1", publicId: "prj_1" },
  });
  mocks.getProjectMarkets.mockResolvedValue({ markets: [], maxMarkets: 5, projectId: "prj_1" });
}

describe("TrackingSettingsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the project membership role for the server-side capability check", async () => {
    mockPage("member");
    render(await TrackingSettingsPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(mocks.getSettings).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.getProjectMarkets).toHaveBeenCalledWith("prj_1");
    expect(mocks.sectionProps).toEqual(
      expect.objectContaining({ canEdit: true, domain: "example.com", projectId: "prj_1" }),
    );
    expect(mocks.marketProps).toEqual(expect.objectContaining({ canEdit: true, canRemove: false }));
  });

  it("does not grant edits from a stronger global role", async () => {
    mockPage("viewer", "active", "owner");
    render(await TrackingSettingsPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(mocks.sectionProps).toEqual(expect.objectContaining({ canEdit: false }));
  });

  it.each([
    ["viewer", "active"],
    ["member", "migration_hold"],
    ["member", "migrated"],
  ] as const)("keeps %s in %s mode read-only", async (role, writeMode) => {
    mockPage(role, writeMode);
    render(await TrackingSettingsPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(mocks.sectionProps).toEqual(expect.objectContaining({ canEdit: false }));
  });
});
