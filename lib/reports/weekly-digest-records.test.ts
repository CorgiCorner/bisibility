import { beforeEach, expect, it, vi } from "vitest";
import {
  EmailBudgetExceededError,
  EmailNotSubmittedError,
  EmailSendError,
} from "@/lib/email/types";
import { claimDigest, digestErrorKind, finishDigest } from "./weekly-digest-records";
import { weeklyDigestPeriod } from "./weekly-digest-period";
const db = vi.hoisted(() => ({ createMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { weeklyDigestSend: db } }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
const key = {
  ...weeklyDigestPeriod(new Date("2026-10-12T06:15:00Z")),
  userId: "user",
  projectId: "project",
};
beforeEach(() => vi.resetAllMocks());
it.each([
  [new EmailNotSubmittedError(new Error("preparation")), "failed"],
  [new EmailBudgetExceededError("bulk", 1, new Date()), "failed"],
  [new EmailSendError("rejected", 429, null), "failed"],
  [new EmailSendError("server failure", 503, null), "ambiguous"],
  [new Error("network timeout"), "ambiguous"],
  [undefined, "ambiguous"],
])("classifies handoff evidence conservatively: %s", (error, status) =>
  expect(digestErrorKind(error)).toBe(status),
);
it("claims with the unique key and explicitly overrides the compatibility sent default", async () => {
  db.createMany.mockResolvedValue({ count: 1 });
  expect(await claimDigest(key)).toBe(true);
  expect(db.createMany).toHaveBeenCalledWith({
    data: { ...key, status: "claimed" },
    skipDuplicates: true,
  });
});
it("reclaims only failed with a compare-and-set; interrupted claimed is ambiguous", async () => {
  db.createMany.mockResolvedValue({ count: 0 });
  db.updateMany.mockResolvedValue({ count: 0 });
  expect(await claimDigest(key)).toBe(false);
  expect(db.updateMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ where: expect.objectContaining({ status: "failed" }) }),
  );
  expect(db.updateMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      where: expect.objectContaining({ status: "claimed" }),
      data: expect.objectContaining({ status: "ambiguous" }),
    }),
  );
});
it("derives a half-open trailing 168-hour period independently of local DST", () => {
  expect(key.periodStart.toISOString()).toBe("2026-10-05T06:15:00.000Z");
  expect(key.periodEnd.getTime() - key.periodStart.getTime()).toBe(168 * 3_600_000);
  expect(() => weeklyDigestPeriod(new Date("invalid"))).toThrow("Invalid digest time");
});

it("records a local no-provider skip without delivery or failure", async () => {
  expect(await finishDigest(key, { status: "skipped" })).toBe("skipped");
  expect(db.updateMany).toHaveBeenCalledWith({
    where: { userId: key.userId, projectId: key.projectId, periodEnd: key.periodEnd },
    data: {
      status: "skipped",
      deliveredAt: null,
      lastErrorKind: "no_provider_local",
      updatedAt: expect.any(Date),
    },
  });
});
it("never reclaims a skipped recipient", async () => {
  db.createMany.mockResolvedValue({ count: 0 });
  db.updateMany.mockImplementation(async ({ where }) => ({
    count: where.status === "skipped" || where.status?.in?.includes("skipped") ? 1 : 0,
  }));
  expect(await claimDigest(key)).toBe(false);
});
