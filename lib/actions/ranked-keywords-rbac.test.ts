import { beforeEach, expect, it, vi } from "vitest";
import { fetchRankedKeywordSuggestions } from "./ranked-keywords";

const mocks = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn() }, project: { findFirst: vi.fn() } },
  lookup: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: "user" } })),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => {}) }));
vi.mock("@/lib/ranked-keywords/service", () => ({ fetchRankedKeywords: mocks.lookup }));
const projectId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project",
    publicId: projectId,
    writeMode: "active",
  });
  mocks.lookup.mockResolvedValue({ ok: true, rows: [] });
});
it.each(["viewer", "auditor"])("denies %s before the paid lookup", async (role) => {
  mocks.prisma.user.findUnique.mockResolvedValue({ memberships: [{ projectId: "project", role }] });
  await expect(fetchRankedKeywordSuggestions({ projectId })).rejects.toMatchObject({
    code: "forbidden",
  });
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("denies a member of another project", async () => {
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "another", role: "owner" }],
  });
  await expect(fetchRankedKeywordSuggestions({ projectId })).rejects.toMatchObject({
    code: "forbidden",
  });
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("allows a member to request suggestions", async () => {
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project", role: "member" }],
  });
  await fetchRankedKeywordSuggestions({ projectId });
  expect(mocks.lookup).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: "user", projectId: "project" }),
  );
});
