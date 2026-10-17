import type { BusinessDatabase } from "@/lib/business-location-store/context";
import { makePublicId } from "@/lib/db/public-id-resources";
import { expect, it, vi } from "vitest";
import { replayRetainedEvidenceRematch } from "./rematch";

const mocks = vi.hoisted(() => ({ source: vi.fn(), rematch: vi.fn() }));
vi.mock("./rematch-source", () => ({ retainedRematchSource: mocks.source }));
vi.mock("@/lib/business-location-store/match-write", () => ({
  rematchBusinessLocationFor: mocks.rematch,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const command = {
  projectId: makePublicId("prj"),
  locationId: makePublicId("biz"),
  identityRevisionId: "identity",
  observationRunId: "observation",
  idempotencyKey: "explicit-rematch",
  expectedDecisions: [{ itemId: "item", expectedRevision: 1 }],
};
const context = { actor: { id: "writer", memberships: [] } },
  stamp = {
    sourceHash: "a".repeat(64),
    parserVersion: "business-match-v2",
    codeHash: "b".repeat(64),
  };
const db = {} as BusinessDatabase;
it("requires reviewed source/code and passes trusted source guard to the existing append/CAS writer", async () => {
  mocks.source.mockResolvedValue({
    sourceHash: stamp.sourceHash,
    itemIds: ["item"],
    surface: "web_serp",
  });
  mocks.rematch.mockImplementation(async (_input, _context, _db, guard) => {
    await guard.assertReplay({}, { project: { id: "project" } });
    return { receipt: "original-writer", replayed: true };
  });
  expect(await replayRetainedEvidenceRematch(command, stamp, context, stamp.codeHash, db)).toEqual({
    receipt: "original-writer",
    replayed: true,
  });
  expect(mocks.rematch.mock.calls.at(-1)?.[3].provenance).toEqual(stamp);
});
it.each(["source", "membership", "version", "foreign_item"])(
  "rejects changed %s before writer receipt reuse",
  async (kind) => {
    mocks.source.mockResolvedValue({
      sourceHash: kind === "source" ? "c".repeat(64) : stamp.sourceHash,
      itemIds: kind === "foreign_item" ? [] : ["item"],
      surface: kind === "version" ? "maps" : "web_serp",
    });
    if (kind === "membership")
      mocks.source.mockRejectedValue(new Error("fresh original owner unavailable"));
    await expect(
      replayRetainedEvidenceRematch(command, stamp, context, stamp.codeHash, db),
    ).rejects.toThrow();
  },
);
it("rejects stale maintained code and request-supplied actor/confirmation fields", async () => {
  await expect(
    replayRetainedEvidenceRematch(command, stamp, context, "c".repeat(64), db),
  ).rejects.toThrow("conflict");
  await expect(
    replayRetainedEvidenceRematch(
      { ...command, actor: "owner", confirmed: true },
      stamp,
      context,
      stamp.codeHash,
      db,
    ),
  ).rejects.toThrow();
});
