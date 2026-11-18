import { anthropicModelProvider } from "@/lib/providers/model/anthropic/adapter";
import { openAIModelProvider } from "@/lib/providers/model/openai/adapter";
import { createOpenRouterProvider } from "@/lib/providers/model/openrouter/adapter";
import { registerModelProvider } from "@/lib/providers/model/registry";
import { vercelAiGatewayProvider } from "@/lib/providers/model/vercel-ai-gateway/adapter";
import { afterEach, expect, it, vi } from "vitest";
import { probeModelProviderConnection } from "./model-provider-probe";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
// Synthetic HTTP responses; real probe boundary and adapters, never a live call.
const providers = [
  anthropicModelProvider,
  openAIModelProvider,
  createOpenRouterProvider(),
  vercelAiGatewayProvider,
];
const cases = providers.flatMap((adapter) =>
  [400, 404, 418, 401, 403, 429, 500].flatMap((status) =>
    [false, true].map((selected) => ({ adapter, status, selected })),
  ),
);
afterEach(() => vi.unstubAllGlobals());
it.each(cases)(
  "shows conditional hints for $adapter.id HTTP $status (selector=$selected)",
  async ({ adapter, status, selected }) => {
    const remove = registerModelProvider(adapter.id, async () => adapter);
    const network = vi.fn<typeof fetch>(
      async () => new Response("secret-provider-message", { status }),
    );
    vi.stubGlobal("fetch", network);
    try {
      const result = await probeModelProviderConnection(
        adapter.id,
        { apiKey: "synthetic-key" },
        "project-a",
        selected && adapter.id === "anthropic" ? { workspaceId: "wrkspc_SyntheticA" } : undefined,
      );
      const hint = adapter.id === "anthropic" && (status === 400 || (status === 404 && selected));
      expect(result.ok).toBe(false);
      expect(result.message.includes("Hint:")).toBe(hint);
      if (hint)
        expect(result.message).toContain(
          status === 404
            ? "workspace this key can access"
            : selected
              ? "check the Workspace ID"
              : "if this key is not tied to one workspace, set a Workspace ID",
        );
      expect(result.message).not.toMatch(/secret-provider-message|wrkspc_SyntheticA|synthetic-key/);
      expect(network).toHaveBeenCalledOnce();
    } finally {
      remove();
    }
  },
);
