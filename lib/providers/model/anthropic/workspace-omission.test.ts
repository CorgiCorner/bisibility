import { afterEach, expect, it, vi } from "vitest";
import { anthropicModelProvider } from "./adapter";
import { column, context, input, observer } from "./fixtures.test-support";
import { normalizeResponse } from "./normalize";

vi.mock("@/lib/providers/model/transport-contract", async (original) => ({
  ...(await original<object>()),
  MODEL_RESULT_EXTENSIONS_ENABLED: false,
}));
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, null, "invalid", `wrkspc_${"a".repeat(65)}`])(
  "omits unobserved workspace %j from failed base results",
  (resolvedWorkspaceId) => {
    const value = normalizeResponse(
      { body: {}, requestId: null, resolvedWorkspaceId },
      column(),
      context().apiKey,
    );
    expect(value.state).toBe("failed");
    expect(value).not.toHaveProperty("resolvedWorkspaceId");
    expect(JSON.stringify(value)).toBe(
      JSON.stringify(normalizeResponse({ body: {}, requestId: null }, column(), context().apiKey)),
    );
  },
);
it("accepts an extension-free failed normalization while extensions are disabled", async () => {
  const network = vi.fn<typeof fetch>(
    async () => new Response("{}", { headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", network);
  const callbacks = observer();
  const value = await anthropicModelProvider.generate(context(), input(), callbacks);
  expect(value).toMatchObject({ state: "failed", failure: "invalid_response" });
  expect(value).not.toHaveProperty("resolvedWorkspaceId");
  expect(callbacks.settle).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledOnce();
});
