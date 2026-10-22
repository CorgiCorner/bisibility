import { expect, it, vi } from "vitest";
import type { DefinitionTransaction } from "./model";
import { assertDefinitionItemIntent } from "./worker-intent";
import { nativeBindingFixture } from "./worker-native.fixtures";

vi.mock("server-only", () => ({}));
it("retains original launch epochs including A→B→A and exact depth before pricing rather than reconnecting old scope", async () => {
  const binding = nativeBindingFixture("serpapi");
  const query = vi.fn(async () => [
    { intent: { version: 1, depth: 20, source: structuredClone(binding.source) } },
  ]);
  const tx = { $queryRaw: query } as unknown as DefinitionTransaction;
  await assertDefinitionItemIntent(tx, "original-item", binding);
  for (const changes of ["epoch", "text", "policy", "depth"] as const) {
    const source = structuredClone(binding.source);
    if (changes === "epoch") source.epochs.keywordTarget = "2"; // final visible A has changed epoch
    if (changes === "text") source.target.text = "B";
    if (changes === "policy") source.epochs.projectPolicy = "2";
    query.mockResolvedValueOnce([
      { intent: { version: 1, depth: changes === "depth" ? 100 : 20, source } },
    ]);
    await expect(assertDefinitionItemIntent(tx, "original-item", binding)).rejects.toMatchObject({
      code: "measurement_definition_conflict",
    });
  }
});
it("missing historical intent refuses new paid work without reads creating a head/intent", async () => {
  const query = vi.fn(async () => [{ intent: null }]);
  const write = vi.fn();
  const http = vi.fn();
  const tx = { $queryRaw: query, $executeRaw: write } as unknown as DefinitionTransaction;
  vi.stubGlobal("fetch", http);
  try {
    await expect(
      assertDefinitionItemIntent(tx, "legacy-item", nativeBindingFixture("serpapi")),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("new Top20 capture accepts old unbound intent while legacy and v2 bindings stay distinct", async () => {
  const binding = nativeBindingFixture("dataforseo");
  expect(binding.source.policy.defaults?.serpStopOnMatch).toBe(true);
  expect(binding.request).toMatchObject({ depth: 20, stopOnMatch: false });
  const originalIntent = { version: 1, depth: 20, source: structuredClone(binding.source) };
  const query = vi.fn(async () => [{ intent: originalIntent }]);
  const write = vi.fn();
  const tx = { $queryRaw: query, $executeRaw: write } as unknown as DefinitionTransaction;
  await expect(assertDefinitionItemIntent(tx, "future-item", binding)).resolves.toBeUndefined();
  const originalBound = {
    ...binding,
    request: { ...binding.request, stopOnMatch: true, findTargetsIn: "with_subdomains" },
  };
  await expect(assertDefinitionItemIntent(tx, "future-item", originalBound)).rejects.toMatchObject({
    code: "measurement_definition_conflict",
  });
  const { compilerVersion: _version, ...fields } =
    originalBound.request as typeof originalBound.request & { compilerVersion?: 2 };
  const legacy = { ...originalBound, request: fields };
  await expect(assertDefinitionItemIntent(tx, "future-item", legacy)).resolves.toBeUndefined();
  expect(originalBound.request.stopOnMatch).toBe(true);
  expect(originalIntent.source.policy.defaults?.serpStopOnMatch).toBe(true);
  expect(write).not.toHaveBeenCalled();
});
