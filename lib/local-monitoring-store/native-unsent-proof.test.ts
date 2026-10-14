import type { Receipt } from "@usagekit/core";
import { describe, expect, it, vi } from "vitest";
import type { LocalTransaction } from "./context";
import { nativeUnsentTerminalState } from "./native-unsent-proof";

const receipt: Receipt = {
  id: "no-send:original",
  evidenceRef: "no-send:original",
  cached: false,
  failed: true,
  occurredAt: "2026-10-12T12:00:00.000Z",
  recordedAt: "2026-10-12T12:01:00.000Z",
  cost: { certainty: "measured", money: { currency: "USD", units: 0n } },
  measurements: [
    {
      unit: "requests",
      certainty: "measured",
      quantity: { unit: "requests", value: 0n, scale: 0 },
    },
  ],
};
const operation = {
  operationId: "original",
  scope: { namespace: "namespace", principal: "principal", connection: "connection" },
  state: "settled" as const,
  lease: null,
  receipts: [receipt],
};
function transaction(found = true) {
  const query = vi.fn().mockResolvedValue([{ found }]);
  return { query, tx: { $queryRaw: query } as unknown as LocalTransaction };
}
describe("retained native no-send terminal proof", () => {
  it("returns the real settled state only for the original canonical no-send command", async () => {
    const { tx, query } = transaction();
    expect(await nativeUnsentTerminalState(tx, operation)).toBe("settled");
    expect(query).toHaveBeenCalledOnce();
  });
  it("does not accept zero amounts without the actual native command", async () => {
    await expect(nativeUnsentTerminalState(transaction(false).tx, operation)).rejects.toThrow();
  });
  it("preserves the canonical logical paid-attempt counter without treating it as provider usage", async () => {
    const proof = {
      ...receipt,
      measurements: [
        ...receipt.measurements,
        {
          unit: "paid_attempts",
          certainty: "measured" as const,
          quantity: { unit: "paid_attempts", value: 1n, scale: 0 },
        },
      ],
    };
    expect(
      await nativeUnsentTerminalState(transaction().tx, { ...operation, receipts: [proof] }),
    ).toBe("settled");
  });
  it.each([
    {
      measurements: [
        {
          unit: "paid_attempts",
          certainty: "measured" as const,
          quantity: { unit: "paid_attempts", value: 0n, scale: 0 },
        },
      ],
    },
    {
      measurements: [
        {
          unit: "paid_attempts",
          certainty: "measured" as const,
          quantity: { unit: "paid_attempts", value: 2n, scale: 0 },
        },
      ],
    },
    { id: "foreign" },
    { evidenceRef: "foreign" },
    { providerRequestId: "possibly-sent" },
    { source: "import" as const },
    { cost: { certainty: "unknown" as const, money: null } },
    { cost: { certainty: "measured" as const, money: { currency: "USD" as const, units: 1n } } },
    { measurements: [{ unit: "requests", certainty: "unknown" as const, quantity: null }] },
    {
      measurements: [
        {
          unit: "requests",
          certainty: "measured" as const,
          quantity: { unit: "requests", value: 1n, scale: 0 },
        },
      ],
    },
  ])("refuses receipt conflicts before native proof lookup, case %#", async (change) => {
    const { tx, query } = transaction();
    await expect(
      nativeUnsentTerminalState(tx, { ...operation, receipts: [{ ...receipt, ...change }] }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
