import { describe, expect, it, vi } from "vitest";
import { assertPublicIdV3WriteGateAllowsWorkerStartup } from "./worker-write-gate";

type Query = (query: string, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>;

function database(query: Query) {
  return {
    async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
      return query(sql, ...values) as Promise<T>;
    },
  };
}

describe("Temporal worker public ID v3 write gate", () => {
  it("refuses startup while the installed gate blocks writes", async () => {
    const query = vi
      .fn<Query>()
      .mockResolvedValueOnce([{ installed: true }])
      .mockResolvedValueOnce([{ blocked: true }]);

    await expect(assertPublicIdV3WriteGateAllowsWorkerStartup(database(query))).rejects.toThrow(
      "Public ID v3 write gate is active; release it before starting the Temporal worker.",
    );
  });

  it("allows startup after the installed gate is released", async () => {
    const query = vi
      .fn<Query>()
      .mockResolvedValueOnce([{ installed: true }])
      .mockResolvedValueOnce([{ blocked: false }]);

    await expect(
      assertPublicIdV3WriteGateAllowsWorkerStartup(database(query)),
    ).resolves.toMatchObject({
      blocked: false,
      installed: true,
    });
  });

  it("allows startup when the gate is not installed", async () => {
    const query = vi.fn<Query>().mockResolvedValueOnce([{ installed: false }]);

    await expect(
      assertPublicIdV3WriteGateAllowsWorkerStartup(database(query)),
    ).resolves.toMatchObject({
      blocked: true,
      installed: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("fails closed when gate readiness cannot be read", async () => {
    const failure = new Error("database unavailable");
    const query = vi.fn<Query>().mockRejectedValueOnce(failure);

    await expect(assertPublicIdV3WriteGateAllowsWorkerStartup(database(query))).rejects.toBe(
      failure,
    );
  });
});
