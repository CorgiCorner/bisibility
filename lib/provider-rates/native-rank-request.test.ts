import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, test, vi } from "vitest";
import { loadNativeRankContexts } from "./native-rank-context";
import { loadNativeRankRequestCosts } from "./native-rank-request";

const measured = vi.hoisted(() => vi.fn());
vi.mock("./native-price-query", () => ({ loadNativeMeasuredPrice: measured }));
const connection = {
  id: "connection",
  provider: "dataforseo",
  credentialSource: "own",
  credentialsEncrypted: "encrypted",
};
function database(amount?: string) {
  return {
    providerConnection: {
      findUnique: vi.fn().mockResolvedValue({
        ...connection,
        projectId: "project",
        project: { ownerId: "owner" },
        enabled: true,
        status: "connected",
        rates: amount === undefined ? [] : [{ amountCents: amount }],
      }),
    },
    $queryRaw: vi.fn(),
  } as unknown as Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
}
beforeEach(() => {
  measured.mockReset();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});

test("prices the actual keyword modifier and queued priority as separate variants", async () => {
  expect(
    await loadNativeRankRequestCosts(database(), connection, [
      { keyword: "plain", depth: 10 },
      { keyword: "site:example.com", depth: 10 },
      { keyword: "plain", depth: 10, priority: "normal" },
      { keyword: "plain", depth: 10, priority: "high" },
    ]),
  ).toEqual([0.2, 1, 0.06, 0.12]);
  expect(measured).toHaveBeenCalledTimes(4);
});

test("reuses a quote only when the extracted pricing options are identical", async () => {
  measured.mockImplementation(async (_db, _binding, _operation, options) =>
    options.operatorCount
      ? undefined
      : {
          quantity: { unit: "cents", value: 725n, scale: 3 },
          samples: 5,
          basis: "call",
          checkedAt: new Date().toISOString(),
        },
  );
  expect(
    await loadNativeRankRequestCosts(database(), connection, [
      { keyword: "one", depth: 10 },
      { keyword: "two", depth: 10 },
      { keyword: "site:example.com", depth: 10 },
    ]),
  ).toEqual([0.725, 0.725, 1]);
  expect(measured).toHaveBeenCalledTimes(2);
});

test.each(["0", "3"])("manual price %s retains the catalog floor for modifiers", async (amount) => {
  expect(
    await loadNativeRankRequestCosts(database(amount), connection, [
      { keyword: "plain", depth: 100 },
      { keyword: "site:example.com", depth: 100 },
    ]),
  ).toEqual([Number(amount), Math.max(Number(amount), 10)]);
  expect(measured).not.toHaveBeenCalled();
});

test("deployment-owned prices remain with their separate authority", async () => {
  const db = database();
  expect(
    await loadNativeRankRequestCosts(db, { ...connection, credentialSource: "hosted" }, []),
  ).toBeUndefined();
  expect(db.providerConnection.findUnique).not.toHaveBeenCalled();
});

test("credential drift stops a request quote", async () => {
  await expect(
    loadNativeRankRequestCosts(
      database(),
      {
        ...connection,
        credentialsEncrypted: "old-credential",
      },
      [{ keyword: "plain", depth: 10 }],
    ),
  ).rejects.toThrow("binding changed");
});

test.each([
  { enabled: false, status: "connected" },
  { enabled: true, status: "error" },
])("unavailable connections have no rank request quote: %j", async (availability) => {
  const db = database();
  vi.mocked(db.providerConnection.findUnique).mockResolvedValue({
    ...connection,
    projectId: "project",
    project: { ownerId: "owner" },
    rates: [],
    ...availability,
  } as never);
  expect(
    await loadNativeRankRequestCosts(db, connection, [{ keyword: "plain", depth: 10 }]),
  ).toEqual([null]);
  expect(measured).not.toHaveBeenCalled();
});

test("search depth contexts preserve the exact manual total", async () => {
  const search = { ...connection, provider: "serpapi" };
  const current = {
    ...search,
    projectId: "project",
    project: { ownerId: "owner" },
    enabled: true,
    status: "connected",
    rates: [{ amountCents: "0.7" }],
  };
  const db = database("0.7");
  vi.mocked(db.providerConnection.findUnique).mockResolvedValue(current as never);
  db.providerConnection.findMany = vi.fn().mockResolvedValue([current]);
  const contexts = await loadNativeRankContexts(db, [connection.id], new Date());
  expect(contexts.get(connection.id)?.centsByDepth[100]).toBe(0.7);
});

test.each([undefined, "0", "3", "0.7"])(
  "search run quotes retain the per-check budget value %s",
  async (amount) => {
    const search = { ...connection, provider: "serpapi" };
    const db = database(amount);
    vi.mocked(db.providerConnection.findUnique).mockResolvedValue({
      ...search,
      projectId: "project",
      project: { ownerId: "owner" },
      enabled: true,
      status: "connected",
      rates: amount === undefined ? [] : [{ amountCents: amount }],
    } as never);
    expect(
      await loadNativeRankRequestCosts(db, search, [
        { keyword: "plain", depth: 10 },
        { keyword: "plain", depth: 100 },
      ]),
    ).toEqual(amount === undefined ? [1, 10] : [Number(amount), Number(amount)]);
    expect(measured).not.toHaveBeenCalled();
  },
);
