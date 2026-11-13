import { emptyProjectContext } from "@/lib/project-context/model";
import { beforeEach, expect, it, vi } from "vitest";
import {
  getAgentReportsPage,
  getAgentWorkspacePermissions,
  getProjectContextPage,
} from "./agent-workspace";

const mocks = vi.hoisted(() => ({
  role: "owner",
  writeMode: "active",
  reports: vi.fn(),
  context: vi.fn(),
}));
const projectId = "prj_abcdefghijklmnopqrstuvwx";
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({
    actor: { id: "actor", memberships: [{ projectId: "internal", role: mocks.role }] },
    project: { id: "internal", writeMode: mocks.writeMode },
  }),
}));
vi.mock("@/lib/agent-reports/service", () => ({ listAgentReports: mocks.reports }));
vi.mock("@/lib/challenge-report/build", () => ({
  readChallengeReportDefaults: async () => ({
    defaultStart: "2026-01-01",
    domain: "example.com",
  }),
}));
vi.mock("@/lib/challenge-report/project-challenge", () => ({
  readProjectChallenge: async () => null,
}));
vi.mock("@/lib/challenge-report/drafts", () => ({
  challengeReportDraftIds: async () => new Set<string>(),
}));
vi.mock("@/lib/project-context/service", () => ({ getProjectContext: mocks.context }));
vi.mock("@/lib/report-sharing/read", () => ({
  readReportShareSummary: async () => null,
  reportAudiences: async () => new Map(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reports.mockResolvedValue([]);
  mocks.context.mockResolvedValue(emptyProjectContext);
});

it.each([
  ["owner", true],
  ["admin", true],
  ["member", true],
  ["viewer", false],
  ["auditor", false],
] as const)("keeps loading and settled permissions consistent for %s", async (role, writable) => {
  mocks.role = role;
  for (const mode of ["active", "migration_hold", "migrated"]) {
    mocks.writeMode = mode;
    const allowed = writable && mode === "active";
    expect(await getAgentWorkspacePermissions(projectId)).toEqual({
      canCreate: allowed,
      canEdit: allowed,
    });
    expect(await getAgentReportsPage(projectId)).toEqual({
      canCreate: allowed,
      challenge: { defaultStart: "2026-01-01", domain: "example.com" },
      journey: null,
      workAvailable: false,
      reports: [],
    });
    expect(await getProjectContextPage(projectId)).toEqual({
      context: emptyProjectContext,
      canEdit: allowed,
    });
  }
  expect(mocks.reports).toHaveBeenCalledWith({
    projectId: "internal",
    kind: undefined,
    limit: 100,
  });
  expect(mocks.context).toHaveBeenCalledWith("internal");
});
