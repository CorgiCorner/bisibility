import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  due: vi.fn(),
  enabled: vi.fn(),
  check: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
  maintenance: vi.fn(),
}));
vi.mock("../db/prisma", () => ({
  prisma: { projectDomainVerification: { findMany: mocks.due, updateMany: mocks.update } },
}));
vi.mock("../domain-verification/feature", () => ({ domainVerificationEnabled: mocks.enabled }));
vi.mock("../domain-verification/service", () => ({ checkStoredVerification: mocks.check }));
vi.mock("../email/send", () => ({ sendEmail: mocks.send }));
vi.mock("./maintenance-schedule-bootstrap", () => ({
  isScheduledMaintenanceEnabled: mocks.maintenance,
}));

import { domainVerificationActivity } from "./domain-verification-activity";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockResolvedValue(true);
  mocks.check.mockResolvedValue({});
  mocks.maintenance.mockReturnValue(true);
});

it.each([1, 19])(
  "attempts each of %s failed notices once while 45 checks drain, then retries next sweep",
  async (count) => {
    let remaining = 45;
    const rows = Array.from({ length: count }, (_, n) => ({
      id: `row${String(n).padStart(2, "0")}`,
      domain: "example.com",
      revokedAt: new Date(),
      project: { owner: { email: `owner${n}@example.com` } },
    }));
    mocks.due.mockImplementation(async ({ where }) => {
      if (where.nextCheckAt) {
        const batch = Array.from({ length: Math.min(20, remaining) }, (_, id) => ({ id }));
        remaining -= batch.length;
        return batch;
      }
      return rows.filter((row) => !where.id || row.id > where.id.gt);
    });
    mocks.send.mockRejectedValue(new Error("unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let cursor: string | undefined;
    let complete = false;
    let checked = 0;
    for (let batch = 0; batch < 3; batch++) {
      const result = await domainVerificationActivity(cursor, complete);
      cursor = result.noticeCursor;
      complete = result.noticeScanComplete;
      checked += result.checked;
    }
    expect(checked).toBe(45);
    expect(mocks.send).toHaveBeenCalledTimes(count);
    expect(complete).toBe(true);
    expect(mocks.due.mock.calls.filter(([arg]) => !arg.where.nextCheckAt)).toHaveLength(1);
    await domainVerificationActivity();
    expect(mocks.send).toHaveBeenCalledTimes(count * 2);
    log.mockRestore();
  },
);

it("does not query verification records while maintenance is disabled", async () => {
  mocks.maintenance.mockReturnValue(false);
  expect(await domainVerificationActivity()).toMatchObject({ hasMore: false });
  expect(mocks.due).not.toHaveBeenCalled();
});
it("continues when more than one full batch is due", async () => {
  mocks.due
    .mockResolvedValueOnce(Array.from({ length: 20 }, (_, id) => ({ id })))
    .mockResolvedValueOnce([]);
  await expect(domainVerificationActivity()).resolves.toEqual({
    checked: 20,
    notices: 0,
    hasMore: true,
    noticeCursor: undefined,
    noticeScanComplete: true,
  });
  expect(mocks.check).toHaveBeenCalledTimes(20);
});
it("does not query verification records while the flag is off", async () => {
  mocks.enabled.mockResolvedValue(false);
  await expect(domainVerificationActivity()).resolves.toEqual({
    checked: 0,
    notices: 0,
    hasMore: false,
    noticeCursor: undefined,
    noticeScanComplete: false,
  });
  expect(mocks.due).not.toHaveBeenCalled();
});
it("sends an owner notice for a revocation and marks it delivered", async () => {
  const revokedAt = new Date("2026-11-06T00:00:00Z");
  mocks.due.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      id: "row",
      domain: "example.com",
      revokedAt,
      project: { owner: { email: "owner@example.com" } },
    },
  ]);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.send.mockResolvedValue(undefined);
  await expect(domainVerificationActivity()).resolves.toEqual({
    checked: 0,
    notices: 1,
    hasMore: false,
    noticeCursor: "row",
    noticeScanComplete: true,
  });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "owner@example.com",
      idempotencyKey: `domain-verification:row:${revokedAt.toISOString()}`,
    }),
  );
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "row", revokedAt, noticeSentAt: null } }),
  );
});
it("keeps a failed notice pending for the next sweep", async () => {
  mocks.due.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      id: "row",
      domain: "example.com",
      revokedAt: new Date(),
      project: { owner: { email: "owner@example.com" } },
    },
  ]);
  mocks.send.mockRejectedValue(new Error("unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(domainVerificationActivity()).resolves.toEqual({
    checked: 0,
    notices: 0,
    hasMore: false,
    noticeCursor: "row",
    noticeScanComplete: true,
  });
  expect(mocks.update).not.toHaveBeenCalled();
  log.mockRestore();
});

it("advances past a full failed notice batch so later owners can be notified", async () => {
  const revokedAt = new Date("2026-11-06T00:00:00Z");
  const row = (id: string) => ({
    id,
    domain: "example.com",
    revokedAt,
    project: { owner: { email: `${id}@example.com` } },
  });
  mocks.due
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, n) => row(`row${String(n).padStart(2, "0")}`)),
    );
  mocks.send.mockRejectedValue(new Error("recipient unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const first = await domainVerificationActivity();
  expect(first).toMatchObject({ hasMore: true, noticeCursor: "row19" });
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.due.mockResolvedValueOnce([]).mockResolvedValueOnce([row("row20")]);
  mocks.send.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({ count: 1 });
  const second = await domainVerificationActivity(first.noticeCursor);
  expect(mocks.due).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: { gt: "row19" } }),
      orderBy: { id: "asc" },
    }),
  );
  expect(second).toMatchObject({ notices: 1, hasMore: false });
  log.mockRestore();
});
