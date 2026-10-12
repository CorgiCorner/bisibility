import { beforeEach, expect, test, vi } from "vitest";
import { queuedRequestCosts } from "./queued-request-costs";

const quote = vi.hoisted(() => vi.fn());
vi.mock("@/lib/provider-rates/native-rank-request", () => ({ loadNativeRankRequestCosts: quote }));
const connection = {
  id: "connection",
  provider: "dataforseo",
  credentialSource: "own",
  credentialsEncrypted: "encrypted",
};
const requests = [
  { keyword: "plain", depth: 10 as const },
  { keyword: "site:example.com", depth: 10 as const },
];
beforeEach(() => {
  quote.mockReset();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});

test("preserves each native amount, including explicit zero, with actual priority", async () => {
  quote.mockResolvedValue([0, 0.725]);
  const db = {} as never;
  const now = new Date();
  expect(await queuedRequestCosts(connection, requests, "normal", db, now)).toEqual([0, 0.725]);
  expect(quote).toHaveBeenCalledWith(
    db,
    connection,
    requests.map((request) => ({ ...request, priority: "normal" })),
    now,
  );
});

test("rejects an unknown own-key quote instead of substituting list prices", async () => {
  quote.mockResolvedValue([0, null]);
  await expect(queuedRequestCosts(connection, requests, "high", {} as never)).rejects.toThrow(
    "no confirmed monetary estimate",
  );
});

test("rejects a connection whose provider changed before submission", async () => {
  await expect(
    queuedRequestCosts({ ...connection, provider: "serpapi" }, requests, "high", {} as never),
  ).rejects.toThrow("no confirmed monetary estimate");
  expect(quote).not.toHaveBeenCalled();
});

test("catalog estimates for separate funding still include the keyword modifier", async () => {
  quote.mockResolvedValue(undefined);
  expect(
    await queuedRequestCosts(
      { ...connection, credentialSource: "hosted" },
      requests,
      "normal",
      {} as never,
    ),
  ).toEqual([0.06, 0.3]);
});
