import { describe, expect, it, vi } from "vitest";
import { monthlySpendByApiKey } from "./api-key-spend";

describe("canonical API key spend", () => {
  it("groups effective project valuation by the original access credential", async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([
        { credentialId: "key_1", total: "123.5" },
        { credentialId: "key_2", total: "0" },
      ]),
    };
    expect(await monthlySpendByApiKey("project", new Date("2026-08-20"), { client })).toEqual(
      new Map([
        ["key_1", 123.5],
        ["key_2", 0],
      ]),
    );
    const query = client.$queryRaw.mock.calls[0]?.[0];
    expect(query.text).toContain("metering_operation");
    expect(query.text).not.toContain("provider_cost_entries");
    expect(query.values).toEqual(
      expect.arrayContaining(["project", new Date("2026-08-01"), new Date("2026-09-01")]),
    );
  });
  it("keeps an empty ledger empty", async () => {
    const client = { $queryRaw: vi.fn().mockResolvedValue([]) };
    expect(await monthlySpendByApiKey("project", new Date(), { client })).toEqual(new Map());
  });
});
