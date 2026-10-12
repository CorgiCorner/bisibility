import { expect, test, vi } from "vitest";
import { monthlySpendCents } from "./budget";

test("monthly spend uses one canonical aggregate and never queries business reservations", async () => {
  const query = vi.fn(async (_sql: { text: string }) => [{ total: "1.5" }]);
  await expect(
    monthlySpendCents("p", new Date(), { client: { $queryRaw: query } as never }),
  ).resolves.toBe(1.5);
  expect(query).toHaveBeenCalledOnce();
  expect(query.mock.calls[0]?.[0].text).not.toContain("rank_checks");
});
