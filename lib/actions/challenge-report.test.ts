import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChallengeReportAction,
  refreshChallengeReportAction,
  saveChallengeReportLessonsAction,
} from "./challenge-report";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  getRecord: vi.fn(),
  getActionActor: vi.fn(),
  journey: vi.fn(),
  recordAppAction: vi.fn(),
  replace: vi.fn(),
  requireProjectScope: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
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
vi.mock("@/lib/agent-reports/service", () => ({
  createAgentReport: mocks.create,
  getAgentReport: mocks.get,
  getAgentReportRecord: mocks.getRecord,
  replaceChallengeReportBody: mocks.replace,
}));
vi.mock("@/lib/challenge-report/build", () => ({
  buildChallengeReport: mocks.build,
  readChallengeReportDefaults: vi.fn(),
}));
vi.mock("@/lib/challenge-report/journey", () => ({ reportJourney: mocks.journey }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const input = {
  days: 30,
  projectId,
  start: "2026-01-01",
  title: "30 days of SEO: example.com",
};

describe("challenge report actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ email: "person@example.com", id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.build.mockResolvedValue(sampleChallengeBody());
    mocks.create.mockResolvedValue({ id: reportId });
    mocks.replace.mockResolvedValue({ id: reportId });
  });

  it("stores a self-contained body and records the create", async () => {
    const result = await createChallengeReportAction(input);
    expect(result).toEqual({ id: reportId, ok: true });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "challenge_report",
        projectId: "project_1",
        title: input.title,
      }),
    );
    expect(mocks.recordAppAction).toHaveBeenCalledWith({
      email: "person@example.com",
      id: "user_1",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "challenge_report.create",
        after: { days: 30, reportId, stage: "day30" },
        targetType: "project",
      }),
    );
  });

  it("does not audit a denied create", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("forbidden"));
    await expect(createChallengeReportAction(input)).rejects.toThrow("forbidden");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
  });

  it("refreshes a draft and leaves a finished report unchanged", async () => {
    const finished = sampleChallengeBody();
    mocks.getRecord.mockResolvedValueOnce({
      actorId: "user_creator",
      report: {
        body: finished,
        id: reportId,
        kind: "challenge_report",
        provenance: { source: "challenge_report" },
      },
    });
    expect(await refreshChallengeReportAction({ projectId, reportId })).toEqual({
      code: "frozen",
      ok: false,
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();

    const draft = { ...finished, period: { ...finished.period, to: "2099-01-30" } };
    mocks.getRecord.mockResolvedValueOnce({
      actorId: "user_creator",
      report: {
        body: draft,
        id: reportId,
        kind: "challenge_report",
        provenance: {},
      },
    });
    expect((await refreshChallengeReportAction({ projectId, reportId })).ok).toBe(true);
    expect(mocks.build).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user_creator", lessons: finished.lessons }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "challenge_report.refresh" }),
    );
  });

  it("keeps the fixed period and baseline when refreshing a completed project challenge", async () => {
    const journey = { calendarDays: 30, checkIns: 20, workDays: 4 };
    const baselineSnapshotId = "challenge-day-one";
    mocks.journey.mockResolvedValue({
      from: "2026-01-01",
      to: "2026-01-30",
      snapshotId: baselineSnapshotId,
      journey,
    });
    expect((await createChallengeReportAction({ ...input, journey: true })).ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ provenance: expect.objectContaining({ baselineSnapshotId }) }),
    );

    const finished = { ...sampleChallengeBody(), journey, workScope: "project" };
    mocks.getRecord.mockResolvedValueOnce({
      actorId: "user_creator",
      report: {
        body: finished,
        id: reportId,
        kind: "challenge_report",
        provenance: { baselineSnapshotId, source: "challenge_report" },
      },
    });
    expect((await refreshChallengeReportAction({ projectId, reportId })).ok).toBe(true);
    expect(mocks.build).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorId: "user_creator",
        days: finished.period.days,
        from: finished.period.from,
        journey,
        snapshotId: baselineSnapshotId,
        work: "project",
      }),
    );
  });

  it("saves lesson text on a finished report without rebuilding numbers", async () => {
    const finished = sampleChallengeBody();
    mocks.get.mockResolvedValue({
      body: finished,
      id: reportId,
      kind: "challenge_report",
      provenance: { source: "challenge_report" },
    });
    const lessons = {
      entries: [{ question: "What did you observe?", answer: "Still measuring." }],
    };
    expect((await saveChallengeReportLessonsAction({ lessons, projectId, reportId })).ok).toBe(
      true,
    );
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ lessons }),
        expectedBody: finished,
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "challenge_report.lessons",
        after: { reportId },
      }),
    );
  });
});
