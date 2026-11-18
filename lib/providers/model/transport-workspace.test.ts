import { afterEach, expect, it, vi } from "vitest";
import { ModelTransportError } from "./errors";
import { modelDeadline } from "./transport-deadline";
import { modelRequest } from "./transport-request";
import { NATIVE_MODEL_PROVIDERS } from "./types";

// Synthetic selector and response text; the body must never leave the transport.
const workspaceId = "wrkspc_SyntheticSelection";
const mapping = [
  [400, "invalid_response"],
  [404, "invalid_response"],
  [418, "invalid_response"],
  [401, "invalid_credentials"],
  [403, "refused"],
  [429, "rate_limited"],
  [500, "provider_error"],
] as const;
const cases = NATIVE_MODEL_PROVIDERS.flatMap((providerId) =>
  mapping.flatMap(([status, code]) =>
    [false, true].flatMap((selected) =>
      (["generation", "metadata"] as const).map((classification) => ({
        providerId,
        status,
        code,
        selected,
        classification,
      })),
    ),
  ),
);
afterEach(() => vi.unstubAllGlobals());
it.each(cases)(
  "preserves $providerId $status $classification (selector=$selected)",
  async ({ providerId, status, code, selected, classification }) => {
    const network = vi.fn<typeof fetch>(
      async () => new Response("secret-provider-message", { status }),
    );
    vi.stubGlobal("fetch", network);
    const deadline = modelDeadline(1000, new AbortController().signal);
    try {
      const error = await modelRequest({
        providerId,
        classification,
        apiKey: "synthetic-key",
        ...(selected ? { workspaceId } : {}),
        maxBytes: 1024,
        deadline,
      }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ModelTransportError);
      expect(error).toMatchObject({ code });
      const hint = providerId === "anthropic" && (status === 400 || (status === 404 && selected));
      expect(error).toHaveProperty(
        "workspaceIssue",
        hint
          ? status === 404
            ? "access"
            : selected
              ? "selection"
              : "selection_missing"
          : undefined,
      );
      expect((error as Error).message).toContain(new ModelTransportError(code).message);
      expect((error as Error).message.includes("Hint:")).toBe(hint);
      if (hint)
        expect((error as Error).message).toContain(
          status === 404
            ? "workspace this key can access"
            : selected
              ? "check the Workspace ID"
              : "if this key is not tied to one workspace, set a Workspace ID",
        );
      expect((error as Error).message).not.toMatch(
        /secret-provider-message|wrkspc_SyntheticSelection|synthetic-key/,
      );
      const headers = network.mock.calls[0]?.[1]?.headers;
      expect(new Headers(headers).get("anthropic-workspace-id")).toBe(
        providerId === "anthropic" && selected ? workspaceId : null,
      );
      expect(network).toHaveBeenCalledOnce();
    } finally {
      deadline.close();
    }
  },
);
