import type { ReportShareSummary } from "@/lib/report-sharing/model";
import { defaultShareSettings } from "@/lib/report-sharing/settings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishReportShareAction,
  publishReportShareUpdateAction,
  reissueReportShareAction,
  revokeReportShareAction,
} from "./report-sharing";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";
const summary: ReportShareSummary = {
  access: "link",
  expires: "never",
  memberCount: 2,
  ownerIsViewer: true,
  ownerName: "Ada",
  pending: null,
  reportId,
  settings: defaultShareSettings(),
  teamHref: `/app/${projectId}/settings/team`,
  views7d: 3,
};
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  demo: vi.fn(),
  getActionActor: vi.fn(),
  publish: vi.fn(),
  read: vi.fn(),
  recordAppAction: vi.fn(),
  reissue: vi.fn(),
  requireProjectScope: vi.fn(),
  revoke: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.recordAppAction }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: mocks.demo }));
vi.mock("@/lib/report-sharing/read", () => ({ readReportShareSummary: mocks.read }));
vi.mock("@/lib/report-sharing/service", () => ({
  createReportShareLink: mocks.create,
  publishReportShareUpdate: mocks.publish,
  reissueReportShareToken: mocks.reissue,
  revokeReportShareLink: mocks.revoke,
  updateReportShareExpiry: vi.fn(),
  updateReportShareSettings: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("report share actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demo.mockReturnValue({ kind: "disabled" });
    mocks.getActionActor.mockResolvedValue({ email: "ada@example.com", id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.read.mockResolvedValue(summary);
    mocks.create.mockResolvedValue({
      publicId: "rsl_abcdefghijklmnopqrstuvwx",
      token: "token-once",
    });
    mocks.reissue.mockResolvedValue("token-again");
    mocks.revoke.mockResolvedValue("rsl_abcdefghijklmnopqrstuvwx");
    mocks.publish.mockResolvedValue({ token: null });
  });

  it("audits a publish and records activity without the token", async () => {
    const result = await publishReportShareAction({ projectId, reportId });
    expect(result).toMatchObject({ ok: true, token: "token-once" });
    expect(mocks.recordAppAction).toHaveBeenCalledWith(expect.objectContaining({ id: "user_1" }));
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report_share.publish",
        targetId: projectId,
        targetType: "project",
      }),
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls[0]?.[0])).not.toContain("token-once");
  });

  it("rejects a viewer before writing", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("forbidden"));
    await expect(publishReportShareAction({ projectId, reportId })).rejects.toThrow("forbidden");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
  });

  it("respects a read-only demo", async () => {
    mocks.demo.mockReturnValue({ kind: "legacy-read-only" });
    expect(await revokeReportShareAction({ projectId, reportId })).toEqual({
      code: "read_only",
      ok: false,
    });
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("reissues a token once and publishes an update only when asked", async () => {
    const reissued = await reissueReportShareAction({ projectId, reportId });
    expect(reissued).toMatchObject({ ok: true, token: "token-again" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report_share.reissue" }),
    );
    expect(
      await publishReportShareUpdateAction({ mode: "link", projectId, reportId }),
    ).toMatchObject({
      ok: true,
      token: null,
    });
    mocks.publish.mockResolvedValue({ token: "token-new" });
    expect(
      await publishReportShareUpdateAction({ mode: "new", projectId, reportId }),
    ).toMatchObject({
      ok: true,
      token: "token-new",
    });
    expect(mocks.publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ mode: "link", reportId }),
    );
    expect(mocks.publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ mode: "new", reportId }),
    );
  });
});
