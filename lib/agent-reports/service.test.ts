import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentReport,
  getAgentReport,
  getAgentReportRecord,
  listAgentReportPage,
  listAgentReports,
} from "./service";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  link: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUniqueOrThrow: mocks.project },
    modelPlaygroundRun: { findFirst: mocks.link },
    agentReport: { create: mocks.create, findFirst: mocks.findFirst, findMany: mocks.findMany },
  },
}));
vi.mock("@/lib/provider-lookups/paid-call", () => {
  throw new Error("Reports must not perform paid calls");
});

const reportId = "agr_abcdefghijklmnopqrstuvwx";
const row = {
  id: "internal",
  publicId: reportId,
  projectId: "project1",
  kind: "site_audit",
  title: "Audit",
  body: { result: { statusCode: 200 } },
  provenance: { source: "bounded_http_crawl" },
  createdAt: new Date("2026-10-02T12:00:00.000Z"),
  createdById: null,
};

describe("agent report storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({ id: "project1", writeMode: "active" });
    mocks.create.mockImplementation(({ data }) => Promise.resolve({ ...row, ...data }));
    mocks.findFirst.mockResolvedValue(row);
    mocks.findMany.mockResolvedValue([row]);
  });
  it("saves validated data with an opaque public identity and actor attribution", async () => {
    const result = await createAgentReport({
      projectId: "project1",
      actorId: "actor",
      kind: row.kind,
      title: row.title,
      body: row.body,
      provenance: row.provenance,
    });
    expect(result.id).toMatch(/^agr_[a-z][a-z0-9]{23}$/);
    expect(result.body).toEqual(row.body);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "project1", createdById: "actor" }),
    });
    expect(result).not.toHaveProperty("projectId");
  });
  it("blocks writes on migration-held projects before persistence", async () => {
    mocks.project.mockResolvedValue({ id: "project1", writeMode: "migration_hold" });
    await expect(
      createAgentReport({ projectId: "project1", kind: "audit", title: "Audit", body: {} }),
    ).rejects.toThrow("read-only");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("scopes every report lookup to a project and rejects internal IDs before querying", async () => {
    await getAgentReport({ projectId: "project2", reportId });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { projectId: "project2", publicId: reportId },
    });
    mocks.findFirst.mockClear();
    await expect(getAgentReport({ projectId: "project1", reportId: "internal" })).rejects.toThrow();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("bounds lists, selects summaries and paginates equal timestamps using public IDs", async () => {
    await listAgentReports({ projectId: "project1", kind: "site_audit", limit: 12 });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project1", kind: "site_audit" },
        take: 12,
        select: { publicId: true, kind: true, title: true, createdAt: true },
      }),
    );
    mocks.findMany.mockResolvedValue([row, { ...row, publicId: "agr_bcdefghijklmnopqrstuvwxy" }]);
    const page = await listAgentReportPage({
      projectId: "project1",
      limit: 1,
      after: { id: reportId, createdAt: row.createdAt.toISOString() },
    });
    expect(page.hasMore).toBe(true);
    expect(page.reports).toHaveLength(1);
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project1",
          OR: [
            { createdAt: { lt: row.createdAt } },
            { createdAt: row.createdAt, publicId: { lt: reportId } },
          ],
        },
        take: 2,
      }),
    );
    await expect(listAgentReports({ projectId: "project1", limit: 101 })).rejects.toThrow();
  });
});

it("uses the stored run link for native presentation and omits it from the public resource", async () => {
  const runId = "019a70b2-0000-7000-8000-000000000001";
  mocks.findFirst.mockResolvedValue({
    ...row,
    kind: "prompt_explorer",
    body: { format: "model_playground", version: 1, runId },
    provenance: { source: "model_playground", runId },
  });
  mocks.link.mockResolvedValue({ id: runId });
  const record = await getAgentReportRecord({ projectId: "project1", reportId });
  expect(record?.report.modelPlaygroundRunId).toBe(runId);
  expect(mocks.link).toHaveBeenCalledWith({
    where: { projectId: "project1", reportId: row.id },
    select: { id: true },
  });
  expect(await getAgentReport({ projectId: "project1", reportId })).not.toHaveProperty(
    "modelPlaygroundRunId",
  );
  mocks.link.mockResolvedValue(null);
  expect(
    (await getAgentReportRecord({ projectId: "project1", reportId }))?.report,
  ).not.toHaveProperty("modelPlaygroundRunId");
});
it("keeps unsupported or forged native-format stored bodies available to the legacy renderer", async () => {
  mocks.findFirst.mockResolvedValue({
    ...row,
    kind: "prompt_explorer",
    body: { format: "model_playground", version: 2 },
    provenance: {},
  });
  expect((await getAgentReport({ projectId: "project1", reportId }))?.body).toEqual({
    format: "model_playground",
    version: 2,
  });
});
