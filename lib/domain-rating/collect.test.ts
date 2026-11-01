import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  domainRatingCheck: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  providerConnection: { updateMany: vi.fn() },
  credentials: vi.fn(),
  gate: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }));
vi.mock("./credentials", () => ({ resolveDomainRatingCredentials: mocks.credentials }));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.gate }));
vi.mock("./provider", async (original) => ({
  ...(await original<typeof import("./provider")>()),
  fetchDomainRating: mocks.fetch,
}));

import { collectDomainRating, collectInitialDomainRating } from "./collect";
import { DomainRatingError } from "./provider";

const project = {
  id: "p1",
  domain: "example.com",
  isSample: false,
  writeMode: "active",
  domainRatingEnabled: true,
};
const now = new Date("2026-10-28T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.findUnique.mockResolvedValue(project);
  mocks.domainRatingCheck.findUnique.mockResolvedValue(null);
  mocks.domainRatingCheck.createMany.mockResolvedValue({ count: 1 });
  mocks.credentials.mockResolvedValue({ key: "fixture", source: "own", connectionId: "c1" });
  mocks.gate.mockResolvedValue({ success: true });
  mocks.fetch.mockResolvedValue(0);
});

describe("daily rating collection", () => {
  it("stores a real zero rating and claims one UTC day", async () => {
    expect(await collectDomainRating("p1", now)).toBe("succeeded");
    expect(mocks.domainRatingCheck.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({ domain: "example.com", day: new Date("2026-10-28T00:00:00Z") }),
        ],
      }),
    );
    expect(mocks.domainRatingCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rating: 0 }) }),
    );
  });
  it.each([
    { domainRatingEnabled: false },
    { writeMode: "read_only" },
    { isSample: true },
    { domain: null },
  ])("never calls a provider for ineligible project %j", async (patch) => {
    mocks.project.findUnique.mockResolvedValue({ ...project, ...patch });
    expect(await collectDomainRating("p1", now)).toBe("disabled");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not replay a completed or ambiguous daily claim", async () => {
    mocks.domainRatingCheck.findUnique.mockResolvedValue({ rating: null });
    expect(await collectDomainRating("p1", now)).toBe("already_checked");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("only the winner of a concurrent claim calls the provider", async () => {
    mocks.domainRatingCheck.createMany.mockResolvedValue({ count: 0 });
    expect(await collectDomainRating("p1", now)).toBe("already_checked");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("honors a pause after the job was queued", async () => {
    mocks.project.findUnique
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ ...project, domainRatingEnabled: false });
    expect(await collectDomainRating("p1", now)).toBe("disabled");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.domainRatingCheck.delete).toHaveBeenCalled();
  });
  it("rechecks entitlement at dispatch and releases an undispatched claim", async () => {
    mocks.credentials
      .mockResolvedValueOnce({ key: "fixture", source: "hosted" })
      .mockResolvedValueOnce(null);
    expect(await collectDomainRating("p1", now)).toBe("unavailable");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.domainRatingCheck.delete).toHaveBeenCalled();
  });
  it("stores a safe failure without a fabricated zero", async () => {
    mocks.fetch.mockRejectedValue(new DomainRatingError("authentication"));
    expect(await collectDomainRating("p1", now)).toBe("failed");
    expect(mocks.domainRatingCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: "authentication" }) }),
    );
    expect(mocks.domainRatingCheck.update.mock.calls[0][0].data).not.toHaveProperty("rating");
  });
  it("records the dispatched credential source when a changed connection fails", async () => {
    mocks.credentials
      .mockResolvedValueOnce({ key: "own-fixture", source: "own", connectionId: "c1" })
      .mockResolvedValueOnce({ key: "hosted-fixture", source: "hosted" });
    mocks.fetch.mockRejectedValue(new DomainRatingError("authentication"));
    expect(await collectDomainRating("p1", now)).toBe("failed");
    expect(mocks.domainRatingCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "hosted", error: "authentication" }),
      }),
    );
  });
  it("does not convert a failed result write into permission to replay the API", async () => {
    mocks.domainRatingCheck.update.mockRejectedValue(new Error("database offline"));
    await expect(collectDomainRating("p1", now)).rejects.toThrow("database offline");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.domainRatingCheck.delete).not.toHaveBeenCalled();
  });
});

describe("first measurement after connecting", () => {
  it("collects once even when daily tracking is off", async () => {
    mocks.project.findUnique.mockResolvedValue({ ...project, domainRatingEnabled: false });
    mocks.domainRatingCheck.findFirst.mockResolvedValue(null);
    expect(await collectInitialDomainRating("p1", now)).toBe("succeeded");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("never replaces an earlier attempt, including an ambiguous one", async () => {
    mocks.domainRatingCheck.findFirst.mockResolvedValue({ rating: null });
    expect(await collectInitialDomainRating("p1", now)).toBe("already_checked");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("still blocks initial collection for read-only projects", async () => {
    mocks.project.findUnique.mockResolvedValue({ ...project, writeMode: "read_only" });
    expect(await collectInitialDomainRating("p1", now)).toBe("disabled");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
