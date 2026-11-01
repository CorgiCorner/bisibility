import type { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  nextRecoveryNoticeState,
  planRecoveryNotice,
  type RecoveryNoticeState,
  recoveryNotice,
} from "./recovery-notification-policy";

vi.mock("server-only", () => ({}));

const now = new Date("2026-10-13T10:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const current = { fingerprint: "3:ids-a", active: true, count: 3, causes: ["proof:missing"] };
const previous: RecoveryNoticeState = { ...current, notifiedAt: now.toISOString() };

describe("recoveryNotice", () => {
  it("notifies a new incident once, then only in the daily digest", () => {
    expect(recoveryNotice(null, current, now)).toBe("new");
    expect(recoveryNotice(previous, current, later(60_000))).toBeNull();
    expect(recoveryNotice(previous, current, later(86_400_000))).toBe("digest");
  });

  it("re-alerts immediately when the count increases", () => {
    expect(recoveryNotice(previous, { ...current, fingerprint: "4:ids-b", count: 4 }, now)).toBe(
      "changed",
    );
  });

  it("re-alerts when a new failed cause appears at the same count", () => {
    const next = { ...current, fingerprint: "3:ids-c", causes: ["proof:missing", "receipt:gone"] };
    expect(recoveryNotice(previous, next, now)).toBe("changed");
  });

  it("does not notify when the backlog shrinks, even when a cause disappears", () => {
    const shrunk = { fingerprint: "2:ids-d", active: true, count: 2, causes: [] };
    expect(recoveryNotice(previous, shrunk, later(60_000))).toBeNull();
    const overdue = { fingerprint: "1:ids-e", active: true, count: 1 };
    expect(recoveryNotice({ ...previous, causes: undefined }, overdue, later(60_000))).toBeNull();
  });

  it("reads the count of a state stored before counts were recorded", () => {
    const legacy = { fingerprint: "5:old", active: true, notifiedAt: now.toISOString() };
    expect(
      recoveryNotice(legacy, { fingerprint: "4:new", active: true, count: 4 }, now),
    ).toBeNull();
    expect(recoveryNotice(legacy, { fingerprint: "6:new", active: true, count: 6 }, now)).toBe(
      "changed",
    );
  });

  it("still sends the daily digest after a silent decrease", () => {
    const shrunk = { fingerprint: "2:ids-d", active: true, count: 2, causes: ["proof:missing"] };
    const stored = nextRecoveryNoticeState(previous, shrunk, null, later(60_000));
    expect(stored).not.toBeNull();
    expect(recoveryNotice(stored, shrunk, later(86_400_000))).toBe("digest");
  });

  it("resolves explicitly and stays quiet when nothing was active", () => {
    expect(recoveryNotice(previous, { fingerprint: "0:", active: false, count: 0 }, now)).toBe(
      "resolved",
    );
    expect(recoveryNotice(null, { fingerprint: "0:", active: false }, now)).toBeNull();
    expect(recoveryNotice({ ...previous, active: false }, current, now)).toBe("new");
  });
});

describe("nextRecoveryNoticeState", () => {
  it("stores a decrease silently and keeps the last notification time", () => {
    const shrunk = { fingerprint: "2:ids-d", active: true, count: 2, causes: ["proof:missing"] };
    expect(nextRecoveryNoticeState(previous, shrunk, null, later(60_000))).toEqual({
      ...shrunk,
      notifiedAt: now.toISOString(),
    });
  });

  it("stamps a notified state and writes nothing for an unchanged one", () => {
    const grown = { ...current, fingerprint: "4:ids-b", count: 4 };
    expect(nextRecoveryNoticeState(previous, grown, "changed", later(5))).toEqual({
      ...grown,
      notifiedAt: later(5).toISOString(),
    });
    expect(nextRecoveryNoticeState(previous, current, null, later(5))).toBeNull();
  });
});

describe("planRecoveryNotice", () => {
  function transaction(stored: RecoveryNoticeState, fingerprint: string, causes: string[]) {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ value: JSON.stringify(stored) }])
      .mockResolvedValueOnce([{ fingerprint }])
      .mockResolvedValueOnce(causes.map((cause) => ({ cause })));
    const executeRaw = vi.fn().mockResolvedValue(1);
    return {
      executeRaw,
      tx: { $executeRaw: executeRaw, $queryRaw: queryRaw } as unknown as Prisma.TransactionClient,
    };
  }

  it("returns no notice for a decrease but stores the smaller fingerprint", async () => {
    const { executeRaw, tx } = transaction(previous, "ids-d", ["proof:missing"]);

    const result = await planRecoveryNotice(tx, "namespace", "failed", 2, later(60_000));

    expect(result).toEqual({ notice: null, fingerprint: "2:ids-d" });
    const write = executeRaw.mock.calls.find(([strings]) =>
      (strings as string[]).join("").includes("INSERT INTO metering_metadata"),
    );
    expect(write).toBeDefined();
    expect(JSON.parse(String(write?.[2]))).toEqual({
      fingerprint: "2:ids-d",
      active: true,
      count: 2,
      causes: ["proof:missing"],
      notifiedAt: now.toISOString(),
    });
  });

  it("notifies when the failed count grows", async () => {
    const { tx } = transaction(previous, "ids-b", ["proof:missing"]);

    await expect(planRecoveryNotice(tx, "namespace", "failed", 4, later(60_000))).resolves.toEqual({
      notice: "changed",
      fingerprint: "4:ids-b",
    });
  });
});
