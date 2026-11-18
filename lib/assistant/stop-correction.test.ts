import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { correctionDebtAlert } from "./stop-correction";

test("only a correction that leaves the wallet below the threshold alerts", () => {
  expect(correctionDebtAlert("-8.1000", 100)).toBe(false);
  expect(correctionDebtAlert("-100.0000", 100)).toBe(false);
  expect(correctionDebtAlert("-100.0001", 100)).toBe(true);
  expect(correctionDebtAlert("5.0000", 1)).toBe(false);
});

const correction = (generationId: string) => ({
  correction: { generationId, until: "2999-01-01T00:00:00.000Z", state: "due" },
});

test("each stopped generation is looked up with the key its attempt ran on, never another", async () => {
  const { correctStoppedOpenRouterAttempts } = await import("./stop-correction");
  const rows = [
    { operationId: "a", usage: correction("gen-a"), providerKeyId: "key-a" },
    { operationId: "b", usage: correction("gen-b"), providerKeyId: "key-revoked" },
    { operationId: "c", usage: correction("gen-c"), providerKeyId: null },
    { operationId: "d", usage: correction("gen-d"), providerKeyId: "key-a" },
  ];
  const tx = { assistantAttempt: { findMany: vi.fn(async () => rows) } };
  const keys: Record<string, string | null> = {
    "key-a": "secret-a",
    "key-revoked": null,
    env: "secret-env",
  };
  const hostedKey = vi.fn(async (keyId: string) => keys[keyId] ?? null);
  const lookup = vi.fn(async () => null);
  const result = await correctStoppedOpenRouterAttempts({
    transaction: (async (body: (client: never) => unknown) => body(tx as never)) as never,
    hostedKey,
    lookup,
  });
  expect(result).toEqual({ corrected: 0, kept: 0 });
  // One read per distinct key; an attempt from before keys were recorded ran on the env key.
  expect(hostedKey.mock.calls.map((call) => call[0]).sort()).toEqual([
    "env",
    "key-a",
    "key-revoked",
  ]);
  expect(lookup.mock.calls.map((call) => call as unknown[]).sort()).toEqual([
    ["gen-a", "secret-a"],
    ["gen-c", "secret-env"],
    ["gen-d", "secret-a"],
  ]);
});
