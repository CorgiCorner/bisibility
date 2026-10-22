import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  batch: vi.fn(),
  link: vi.fn(),
  resolve: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("@/lib/actions/keyword-batch", () => ({ createKeywordBatchSet: host.batch }));
vi.mock("@/lib/actions/keyword-schedule-assignment", () => ({
  resolveCheckSchedule: host.resolve,
  linkCheckSchedule: host.link,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: host.audit }));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: host.lock,
}));

import type { MarketDeviceSelection } from "./device-targets-input";
import { addMarketDeviceTargets, previewMarketDeviceTargets } from "./device-targets-service";

const input = {
  projectId: "public-project",
  marketId: "public-market",
  device: "mobile" as const,
  scheduleId: null,
};
const keyword = (text = "word", device = "desktop", archivedAt: Date | null = null) => ({
  publicId: `${text}:${device}`,
  text,
  device,
  archivedAt,
  targetUrl: "/pinned",
  topic: null as string | null,
  intent: null as string | null,
  tags: [] as { tag: { name: string } }[],
});
const market = {
  publicId: input.marketId,
  locationId: "location",
  location: { displayName: "United States", countryCode: "US", kind: "country" },
};
let rows: ReturnType<typeof keyword>[];
const tx = {
  projectMarket: { findFirst: vi.fn() },
  keyword: { findMany: vi.fn() },
  checkSchedule: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
};
const client = tx as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.resetAllMocks();
  rows = [keyword()];
  tx.projectMarket.findFirst.mockResolvedValue(market);
  tx.keyword.findMany.mockImplementation(async () => rows);
  tx.checkSchedule.findFirst.mockResolvedValue(null);
  tx.$queryRaw.mockResolvedValue([]);
  host.batch.mockImplementation(async (_tx, _project, candidates) => ({
    restored: [],
    created: candidates.map((_: unknown, i: number) => ({
      id: `internal-${i}`,
      publicId: `public-${i}`,
    })),
  }));
});
async function fingerprint(selection: MarketDeviceSelection = input) {
  const p = await previewMarketDeviceTargets(client, "internal-project", selection);
  if (p.outcome !== "ready") throw new Error("Fixture preview failed");
  return p.fingerprint;
}
it("previews only scoped database rows with no locks, writes, or provider work", async () => {
  expect(await previewMarketDeviceTargets(client, "internal-project", input)).toMatchObject({
    outcome: "ready",
    keywordCount: 1,
    newCheckCount: 1,
    scheduleName: null,
  });
  expect(tx.projectMarket.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: "internal-project", publicId: input.marketId, status: "active" },
    }),
  );
  expect(tx.keyword.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: "internal-project", locationId: "location" },
      take: 2001,
    }),
  );
  expect(host.lock).not.toHaveBeenCalled();
  expect(tx.$queryRaw).not.toHaveBeenCalled();
  expect(host.batch).not.toHaveBeenCalled();
});
it("adds only the reviewed missing tuple with Manual and existing metadata, using the capacity-aware batch", async () => {
  rows = [
    keyword(),
    keyword("existing"),
    keyword("existing", "mobile"),
    keyword("archived"),
    keyword("archived", "mobile", new Date()),
  ];
  const hash = await fingerprint();
  expect(
    await addMarketDeviceTargets(client, "actor", "internal-project", {
      ...input,
      fingerprint: hash,
    }),
  ).toEqual({ outcome: "created", created: 1 });
  expect(host.batch).toHaveBeenCalledWith(client, "internal-project", [
    expect.objectContaining({
      keyword: "word",
      device: "mobile",
      locationId: "location",
      schedule: null,
      targetUrl: "/pinned",
    }),
  ]);
  expect(host.link).not.toHaveBeenCalled();
  expect(host.audit).toHaveBeenCalledOnce();
  expect(host.lock.mock.invocationCallOrder[0]).toBeLessThan(
    host.batch.mock.invocationCallOrder[0],
  );
  expect(tx.$queryRaw.mock.calls.map(([parts]) => parts.join(""))).toEqual([
    expect.stringContaining("FROM project_markets"),
    expect.stringContaining("FROM keywords"),
  ]);
});
it.each(["archive", "new-target", "metadata"])(
  "refuses the reviewed scope if a concurrent %s appears before confirmation",
  async (change) => {
    const hash = await fingerprint();
    if (change === "archive") rows = [keyword("word", "desktop", new Date())];
    if (change === "new-target") rows.push(keyword("word", "mobile"));
    if (change === "metadata") rows[0].targetUrl = "/changed";
    expect(
      await addMarketDeviceTargets(client, "actor", "internal-project", {
        ...input,
        fingerprint: hash,
      }),
    ).toEqual({ outcome: "unavailable", reason: "selection_changed" });
    expect(host.batch).not.toHaveBeenCalled();
    expect(host.audit).not.toHaveBeenCalled();
  },
);
it("re-reads after locking keywords so an archive racing the first read cannot be copied", async () => {
  const hash = await fingerprint();
  tx.$queryRaw.mockImplementation(async (parts) => {
    if (parts.join("").includes("FROM keywords")) rows = [keyword("word", "desktop", new Date())];
    return [];
  });
  expect(
    await addMarketDeviceTargets(client, "actor", "internal-project", {
      ...input,
      fingerprint: hash,
    }),
  ).toMatchObject({ outcome: "unavailable", reason: "selection_changed" });
  expect(host.batch).not.toHaveBeenCalled();
});
it("refuses a paused, archived or foreign market before reading its keywords", async () => {
  tx.projectMarket.findFirst.mockResolvedValue(null);
  expect(await previewMarketDeviceTargets(client, "internal-project", input)).toMatchObject({
    outcome: "unavailable",
    reason: "market_unavailable",
  });
  expect(tx.keyword.findMany).not.toHaveBeenCalled();
});
it("assigns only newly created rows to the explicitly selected current named schedule", async () => {
  const named = { ...input, scheduleId: "schedule" };
  tx.checkSchedule.findFirst.mockResolvedValue({
    id: "internal-schedule",
    publicId: "schedule",
    name: "Weekly",
    updatedAt: new Date(),
  });
  host.resolve.mockResolvedValue({ id: "internal-schedule", publicId: "schedule" });
  const hash = await fingerprint(named);
  await addMarketDeviceTargets(client, "actor", "internal-project", {
    ...named,
    fingerprint: hash,
  });
  expect(host.link).toHaveBeenCalledWith(
    client,
    "internal-project",
    expect.objectContaining({ publicId: "schedule" }),
    [{ id: "internal-0", publicId: "public-0" }],
  );
});
it("propagates capacity rejection for the enclosing transaction to roll back", async () => {
  const hash = await fingerprint();
  host.batch.mockRejectedValue(new Error("capacity"));
  await expect(
    addMarketDeviceTargets(client, "actor", "internal-project", { ...input, fingerprint: hash }),
  ).rejects.toThrow("capacity");
  expect(host.link).not.toHaveBeenCalled();
  expect(host.audit).not.toHaveBeenCalled();
});

it("refuses conflicting source settings before writes rather than choosing a target URL", async () => {
  rows = [keyword("word"), { ...keyword("WORD"), targetUrl: "/different" }];
  expect(await previewMarketDeviceTargets(client, "internal-project", input)).toEqual({
    outcome: "unavailable",
    reason: "ambiguous_keywords",
  });
  expect(
    await addMarketDeviceTargets(client, "actor", "internal-project", {
      ...input,
      fingerprint: "a".repeat(64),
    }),
  ).toEqual({ outcome: "unavailable", reason: "ambiguous_keywords" });
  expect(host.batch).not.toHaveBeenCalled();
  expect(host.link).not.toHaveBeenCalled();
  expect(host.audit).not.toHaveBeenCalled();
});

it("creates only one selected source out of four and preserves its complete metadata", async () => {
  rows = [
    keyword("a"),
    {
      ...keyword("b"),
      targetUrl: "/selected",
      topic: "topic",
      intent: "commercial",
      tags: [{ tag: { name: "Selected" } }],
    },
    keyword("c"),
    keyword("d"),
  ];
  const selection = { ...input, keywordIds: [rows[1].publicId] };
  const hash = await fingerprint(selection);
  expect(
    await addMarketDeviceTargets(client, "actor", "internal-project", {
      ...selection,
      fingerprint: hash,
    }),
  ).toEqual({ outcome: "created", created: 1 });
  expect(host.batch).toHaveBeenCalledWith(client, "internal-project", [
    expect.objectContaining({
      keyword: "b",
      targetUrl: "/selected",
      topic: "topic",
      intent: "commercial",
      tags: ["Selected"],
      schedule: null,
    }),
  ]);
});
it("confirms an empty explicit selection as zero without batches, assignment or audit", async () => {
  rows = [keyword("a"), keyword("b")];
  const selection = { ...input, keywordIds: [] };
  const hash = await fingerprint(selection);
  expect(
    await addMarketDeviceTargets(client, "actor", "internal-project", {
      ...selection,
      fingerprint: hash,
    }),
  ).toEqual({ outcome: "created", created: 0 });
  expect(host.batch).not.toHaveBeenCalled();
  expect(host.resolve).not.toHaveBeenCalled();
  expect(host.link).not.toHaveBeenCalled();
  expect(host.audit).not.toHaveBeenCalled();
});
it.each(["other-market:desktop", "unknown", "archived:desktop"])(
  "rejects a scoped-out or stale ID %s without broadening to all current keywords",
  async (id) => {
    rows = [keyword("a"), keyword("archived", "desktop", new Date())];
    const selection = { ...input, keywordIds: [rows[0].publicId, id] };
    expect(await previewMarketDeviceTargets(client, "internal-project", selection)).toEqual({
      outcome: "unavailable",
      reason: "selection_changed",
    });
    expect(
      await addMarketDeviceTargets(client, "actor", "internal-project", {
        ...selection,
        fingerprint: "a".repeat(64),
      }),
    ).toEqual({ outcome: "unavailable", reason: "selection_changed" });
    expect(host.batch).not.toHaveBeenCalled();
    expect(host.audit).not.toHaveBeenCalled();
  },
);
it("rejects a different selected subset under the original preview fingerprint", async () => {
  rows = [keyword("a"), keyword("b")];
  const hash = await fingerprint({ ...input, keywordIds: [rows[0].publicId] });
  expect(
    await addMarketDeviceTargets(client, "actor", "internal-project", {
      ...input,
      keywordIds: [rows[1].publicId],
      fingerprint: hash,
    }),
  ).toEqual({ outcome: "unavailable", reason: "selection_changed" });
  expect(host.batch).not.toHaveBeenCalled();
});
