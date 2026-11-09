import { describe, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
const driver = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { instanceSetting: { findUnique: read } } }));
vi.mock("@/lib/scheduler/driver", () => ({ schedulerDriver: driver }));

import {
  siteAuditInlineFallbackEnabled,
  siteAuditWorkerAvailable,
  siteAuditWorkerEnabled,
} from "./worker-config";

describe("site audit worker setting", () => {
  it.each([
    ["none", false],
    ["temporal", true],
  ] as const)(
    "only shows worker-sized input when scheduler %s is available",
    async (value, available) => {
      read.mockResolvedValueOnce({ value: "1" });
      driver.mockReturnValue(value);
      await expect(siteAuditWorkerAvailable()).resolves.toBe(available);
    },
  );
  it.each([null, { value: "0" }, { value: "2" }, { value: "true" }, { value: "" }])(
    "defaults to the inline path for %j",
    async (row) => {
      read.mockResolvedValueOnce(row);
      await expect(siteAuditWorkerEnabled()).resolves.toBe(false);
    },
  );
  it("enables the worker only for the explicit setting", async () => {
    read.mockResolvedValueOnce({ value: "1" });
    await expect(siteAuditWorkerEnabled()).resolves.toBe(true);
  });
  it.each([null, { value: "0" }, { value: "2" }, { value: "true" }])(
    "keeps inline fallback off for %j",
    async (row) => {
      read.mockResolvedValueOnce(row);
      await expect(siteAuditInlineFallbackEnabled()).resolves.toBe(false);
    },
  );
  it("enables inline fallback only for an explicit setting", async () => {
    read.mockResolvedValueOnce({ value: "1" });
    await expect(siteAuditInlineFallbackEnabled()).resolves.toBe(true);
    expect(read).toHaveBeenLastCalledWith({
      where: { key: "siteAudit.inlineFallback" },
      select: { value: true },
    });
  });
});
