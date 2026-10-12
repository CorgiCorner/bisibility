import { describe, expect, it, vi } from "vitest";
import { aggregateConnectionUsage } from "./connection-usage";

const now = new Date("2026-08-26T12:00:00Z");
describe("canonical connection usage", () => {
  it.each([
    ["own", "cents", "costCents", 12.5, 3, 0],
    ["hosted", "cents", "priceCents", 13, 1, 0],
    ["hosted", "cents", "priceCents", 0, 1, 0],
    ["hosted", "cents", "priceCents", 0, 1, 1],
    ["own", "units", "usageQuantity", 5, 3, 2],
    ["own", "units", "usageQuantity", 0, 4, 4],
  ] as const)(
    "reads %s %s with explicit uncertainty",
    async (credentialSource, unit, column, used, requestCount, unconfirmedCount) => {
      const db = {
        $queryRaw: vi
          .fn()
          .mockResolvedValue([{ used: String(used), requestCount, unconfirmedCount }]),
      };
      expect(
        await aggregateConnectionUsage(db, {
          projectId: "project",
          connectionId: "connection",
          credentialSource,
          unit,
          now,
        }),
      ).toEqual({ used, requestCount, unconfirmedCount });
      const query = db.$queryRaw.mock.calls[0]?.[0];
      expect(query.text).toContain(`SUM("${column}")`);
      expect(query.text).toContain("metering_operation");
      expect(query.text).not.toContain("provider_cost_entries");
      expect(query.values).toEqual(
        expect.arrayContaining([
          "project",
          "connection",
          credentialSource,
          new Date("2026-08-01"),
          new Date("2026-09-01"),
        ]),
      );
    },
  );
  it.each(["app", "programmatic"] as const)("isolates the %s surface", async (surface) => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) };
    expect(
      await aggregateConnectionUsage(db, {
        projectId: "project",
        connectionId: "connection",
        credentialSource: "own",
        unit: "cents",
        surface,
        now,
      }),
    ).toEqual({ used: 0, requestCount: 0, unconfirmedCount: 0 });
    expect(db.$queryRaw.mock.calls[0]?.[0].values).toContain(surface);
  });
});
