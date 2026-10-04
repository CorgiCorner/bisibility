import { authorize } from "@/lib/auth/authorize";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentReportAction,
  saveManualAgentReportAction,
  saveProjectContextAction,
} from "./agent-workspace";

const mocks = vi.hoisted(() => ({
  role: "member",
  writeMode: "active",
  saveContext: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: "actor" } }),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/project-context/service", () => ({ saveProjectContext: mocks.saveContext }));
vi.mock("@/lib/agent-reports/service", () => ({ createAgentReport: mocks.create }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: "actor",
        memberships: [{ projectId: "internal", role: mocks.role }],
      })),
    },
    project: {
      findFirst: vi.fn(async ({ where }) =>
        where.publicId === "prj_abcdefghijklmnopqrstuvwx"
          ? {
              id: "internal",
              publicId: where.publicId,
              domain: "example.com",
              ownerId: "actor",
              isSample: false,
              writeMode: mocks.writeMode,
            }
          : null,
      ),
    },
  },
}));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const context = {
  projectId,
  business: "Acme",
  audience: "Teams",
  products: "Tools",
  goals: "Growth",
  agentRules: "Specific evidence",
};
const manual = { projectId, title: "Analysis", analysis: "Improve page headings." };

describe("workspace server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "member";
    mocks.writeMode = "active";
    mocks.create.mockResolvedValue({ id: "agr_abcdefghijklmnopqrstuvwx" });
  });
  it("uses the actual membership role and project identity before persisting", async () => {
    await saveProjectContextAction(context);
    const { projectId: _projectId, ...fields } = context;
    expect(mocks.saveContext).toHaveBeenCalledWith("internal", fields);
    await saveManualAgentReportAction(manual);
    expect(mocks.create).toHaveBeenCalledWith({
      projectId: "internal",
      actorId: "actor",
      title: manual.title,
      kind: "manual_analysis",
      body: { analysis: manual.analysis },
      provenance: { source: "project_member" },
    });
  });
  it.each(["viewer", "auditor"])("denies %s writes", async (role) => {
    mocks.role = role;
    await expect(saveProjectContextAction(context)).rejects.toThrow("authorized");
    await expect(saveManualAgentReportAction(manual)).rejects.toThrow("authorized");
    expect(mocks.saveContext).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["migration_hold", "migrated"])("blocks writes to %s project", async (writeMode) => {
    mocks.writeMode = writeMode;
    await expect(saveProjectContextAction(context)).rejects.toThrow("read-only");
    await expect(saveManualAgentReportAction(manual)).rejects.toThrow("read-only");
    expect(mocks.saveContext).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects raw project IDs, foreign projects and invalid payloads", async () => {
    for (const candidate of ["internal", "prj_bcdefghijklmnopqrstuvwxy"]) {
      await expect(
        saveManualAgentReportAction({ ...manual, projectId: candidate }),
      ).rejects.toThrow("not found");
    }
    await expect(
      saveProjectContextAction({ ...context, business: "x".repeat(4001) }),
    ).rejects.toThrow();
    await expect(saveManualAgentReportAction({ ...manual, analysis: " " })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.saveContext).not.toHaveBeenCalled();
  });
  it.each(["site_audit", "ai_visibility", "prompt_explorer", "SITE_AUDIT"])(
    "rejects external use of reserved kind %s",
    async (kind) => {
      await expect(
        createAgentReportAction({ projectId, title: "Fake producer result", kind, body: {} }),
      ).rejects.toThrow("reserved");
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("retains the real role table for context and analysis writes", () => {
    expect(() =>
      authorize(
        { id: "viewer", memberships: [{ projectId: "internal", role: "viewer" }] },
        "update",
        { projectId: "internal", type: "project" },
      ),
    ).toThrow();
  });
});
