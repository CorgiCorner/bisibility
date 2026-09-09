import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateCompetitorDetails } from "./competitor-set-edit";

const projectId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const competitorId = "cmp_aaaaaaaaaaaaaaaaaaaaaaaa";
const before = {
  aliases: ["Old brand"],
  domain: "old.example.com",
  id: "competitor_db",
  publicId: competitorId,
  source: "suggested",
};
const mocks = vi.hoisted(() => {
  const tx = { competitor: { findFirst: vi.fn(), update: vi.fn() } };
  return {
    tx,
    transaction: vi.fn(),
    actor: vi.fn(),
    scope: vi.fn(),
    audit: vi.fn(),
    revalidate: vi.fn(),
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  revalidateCompetitorViews: mocks.revalidate,
}));

describe("updateCompetitorDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({ id: "actor_1" });
    mocks.scope.mockResolvedValue({ id: "project_db", publicId: projectId });
    mocks.transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.competitor.findFirst.mockResolvedValue(before);
    mocks.tx.competitor.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...before, ...data }),
    );
  });

  it("normalizes the domain, keeps the identity and market settings, and audits the change atomically", async () => {
    const result = await updateCompetitorDetails({
      projectId,
      competitorId,
      domain: "https://docs.example.com/start",
      aliases: ["New brand"],
    });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor_1" }, "update", projectId, {
      type: "competitor",
    });
    expect(mocks.tx.competitor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_db", publicId: competitorId } }),
    );
    expect(mocks.tx.competitor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "competitor_db" },
        data: {
          aliases: ["New brand"],
          domain: "docs.example.com",
          evidence: Prisma.DbNull,
          source: "manual",
        },
      }),
    );
    expect(result).toEqual({
      id: competitorId,
      aliases: ["New brand"],
      domain: "docs.example.com",
      source: "manual",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "competitor.details.update",
        projectId: "project_db",
        targetId: competitorId,
        before: {
          aliases: ["Old brand"],
          domain: "old.example.com",
          id: competitorId,
          source: "suggested",
        },
        after: result,
      }),
      mocks.tx,
    );
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it("keeps suggestion evidence when editing only aliases and accepts removing all aliases", async () => {
    await updateCompetitorDetails({ projectId, competitorId, domain: before.domain, aliases: [] });
    expect(mocks.tx.competitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { domain: before.domain, aliases: [] } }),
    );
  });

  it("rejects invalid domains and duplicate aliases before authorization or writes", async () => {
    for (const values of [
      { domain: "invalid", aliases: [] },
      { domain: before.domain, aliases: ["Brand", "brand"] },
    ]) {
      await expect(
        updateCompetitorDetails({ projectId, competitorId, ...values }),
      ).rejects.toThrow();
    }
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stops on a denied update and cannot edit a competitor outside the authorized project", async () => {
    const input = { projectId, competitorId, domain: before.domain, aliases: [] };
    mocks.scope.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(updateCompetitorDetails(input)).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.tx.competitor.findFirst.mockResolvedValueOnce(null);
    await expect(updateCompetitorDetails(input)).rejects.toThrow("Competitor not found.");
    expect(mocks.tx.competitor.update).not.toHaveBeenCalled();
  });

  it("reports a duplicate domain without auditing or revalidating a failed edit", async () => {
    mocks.tx.competitor.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(
      updateCompetitorDetails({ projectId, competitorId, domain: before.domain, aliases: [] }),
    ).rejects.toThrow("This domain is already in your competitors.");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
