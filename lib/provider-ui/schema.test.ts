import { describe, expect, it } from "vitest";
import { commandHash } from "./journal";
import { providerUiCommandSchema, providerUiQuerySchema } from "./schema";

const command = {
  kind: "rates" as const,
  commandId: "command-native-rate",
  connectionId: "conn_abcdefghijklmnopqrstuvwx",
  expectedRevision: "a".repeat(64),
  rates: [{ rateId: "rank_check" as const, price: "0.0001" }],
};
describe("provider UI wire", () => {
  it("keeps smallest and largest native rate decimals as exact strings", () => {
    for (const price of ["0", "0.0001", "999999.9999"])
      expect(
        providerUiCommandSchema.parse({ ...command, rates: [{ rateId: "rank_check", price }] }),
      ).toMatchObject({ rates: [{ price }] });
  });
  it.each(["0.00001", "1000000", "-1", "1e2", "Infinity"])(
    "rejects a rate outside exact native storage: %s",
    (price) => {
      expect(
        providerUiCommandSchema.safeParse({ ...command, rates: [{ rateId: "rank_check", price }] })
          .success,
      ).toBe(false);
    },
  );
  it("rejects secrets, forged identity, unknown writes and duplicate targets", () => {
    for (const extra of [
      { secrets: { password: "synthetic-only" } },
      { principal: "someone-else" },
      { kind: "funding", fundingSource: "platform" },
      { rates: [...command.rates, ...command.rates] },
    ])
      expect(providerUiCommandSchema.safeParse({ ...command, ...extra }).success).toBe(false);
    expect(providerUiQuerySchema.safeParse({ kind: "connections", actor: "forged" }).success).toBe(
      false,
    );
  });
  it("distinguishes changed body while canonical object-key order is stable", () => {
    expect(commandHash(command)).toBe(
      commandHash({
        rates: command.rates,
        kind: command.kind,
        expectedRevision: command.expectedRevision,
        connectionId: command.connectionId,
        commandId: command.commandId,
      }),
    );
    expect(commandHash(command)).not.toBe(
      commandHash({ ...command, rates: [{ rateId: "rank_check", price: "0.0002" }] }),
    );
  });
  it("accepts omitted keep and explicit clear independently; rejects invalid Int caps", () => {
    const base = {
      kind: "allocations",
      commandId: "command-native-cap",
      expectedRevision: "a".repeat(64),
      changes: [{ rowId: "row", expectedRevision: "b".repeat(64) }],
    };
    for (const limit of [undefined, null, "1", "2147483647"])
      expect(
        providerUiCommandSchema.safeParse({
          ...base,
          changes: [{ ...base.changes[0], ...(limit === undefined ? {} : { limit }) }],
        }).success,
      ).toBe(true);
    for (const limit of ["0", "2147483648", "1.1", "-1"])
      expect(
        providerUiCommandSchema.safeParse({ ...base, changes: [{ ...base.changes[0], limit }] })
          .success,
      ).toBe(false);
  });
});
