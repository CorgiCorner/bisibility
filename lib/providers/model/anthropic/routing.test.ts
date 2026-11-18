import { readModelMetadataPages } from "@/lib/providers/model/transport";
import { interceptedFetch, json } from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { anthropicModelProvider } from "./adapter";
import { catalogFromPage, probe } from "./catalog";
import {
  catalogFixture,
  context,
  input as generationInput,
  observer,
  textFixture,
} from "./fixtures.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let network: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  network = interceptedFetch();
});
afterEach(() => vi.unstubAllGlobals());
const workspaceId = "wrkspc_SyntheticWorkspace000001";
it("sends only the fixed workspace header on generation and preserves observed mismatch", async () => {
  const input = generationInput();
  Object.assign(input.column.settings, { workspaceId });
  network.mockResolvedValueOnce(
    json(JSON.stringify(textFixture()), {
      headers: { "anthropic-workspace-id": "wrkspc_ObservedSynthetic000001" },
    }),
  );
  const value = await anthropicModelProvider.generate(context(), input, observer());
  expect(value).toMatchObject({
    state: "completed",
    resolvedWorkspaceId: "wrkspc_ObservedSynthetic000001",
  });
  expect(network.mock.calls[0][1]?.headers).toMatchObject({
    "anthropic-workspace-id": workspaceId,
  });
  expect(network).toHaveBeenCalledOnce();
});
it.each([null, "malformed id", `wrkspc_${"a".repeat(65)}`])(
  "ignores absent/malformed supplementary workspace %j",
  async (observed) => {
    network.mockResolvedValueOnce(
      json(JSON.stringify(textFixture()), {
        headers: observed ? { "anthropic-workspace-id": observed } : {},
      }),
    );
    const value = await anthropicModelProvider.generate(context(), generationInput(), observer());
    expect(value.state).toBe("completed");
    expect(value).not.toHaveProperty("resolvedWorkspaceId");
  },
);
it("sends workspace on every catalog page and labels the resulting scope", async () => {
  const first = catalogFixture();
  const last = { ...first.data[0], id: "synthetic-unrelated" };
  network
    .mockResolvedValueOnce(json(JSON.stringify({ ...first, has_more: true })))
    .mockResolvedValueOnce(
      json(JSON.stringify({ data: [last], has_more: false, first_id: last.id, last_id: last.id })),
    );
  const value = await probe({ ...context(), workspaceId });
  expect(value.catalog).toMatchObject({ workspaceId });
  for (const call of network.mock.calls)
    expect(call[1]?.headers).toMatchObject({ "anthropic-workspace-id": workspaceId });
  expect(network).toHaveBeenCalledTimes(2);
});
it.each([400, 404])(
  "maps workspace HTTP %s to fixed guidance and never retries",
  async (status) => {
    network.mockResolvedValueOnce(
      json(JSON.stringify({ error: { message: "secret-workspace-never-echo" } }), { status }),
    );
    await expect(
      readModelMetadataPages({ providerId: "anthropic", context: { ...context(), workspaceId } }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/workspace/i),
      code: "invalid_response",
    });
    expect(network).toHaveBeenCalledOnce();
  },
);
it.each([
  { type: "future-kind" },
  { lifecycle: "future-lifecycle" },
  { max_tokens: "future" },
  { capabilities: { server_tools: false } },
])("skips only unrelated unrecognized rows with an explicit summary %j", (patch) => {
  const page = catalogFixture();
  const row = { ...page.data[0], id: "synthetic-unrelated", ...patch };
  const snapshot = catalogFromPage(
    { ...page, data: [...page.data, row], last_id: row.id },
    context().accountDigest,
  );
  expect(snapshot.models).toHaveLength(1);
  expect(snapshot).toMatchObject({
    recognition: { traversal: "complete", recognition: "partial", skippedEntries: 1 },
  });
  expect(() =>
    catalogFromPage({ ...page, data: [{ ...page.data[0], ...patch }] }, context().accountDigest),
  ).toThrow();
});

it.each([false, true])(
  "keeps fixed workspace guidance after a generation HTTP 400 (selector=%s)",
  async (selected) => {
    const input = generationInput();
    if (selected) input.column.settings.workspaceId = workspaceId;
    network.mockResolvedValueOnce(
      json('{"error":{"message":"secret-workspace-never-echo"}}', { status: 400 }),
    );
    const callbacks = observer();
    await expect(
      anthropicModelProvider.generate(context(), input, callbacks),
    ).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
      workspaceIssue: selected ? "selection" : "selection_missing",
      message: expect.stringContaining("Workspace ID"),
    });
    expect(callbacks.settle).toHaveBeenCalledOnce();
    expect(callbacks.settle.mock.calls[0][1]).toMatchObject({ failure: "invalid_response" });
    expect(network).toHaveBeenCalledOnce();
  },
);
it("refuses a conflicting probe context selector before dispatch", async () => {
  const input = generationInput();
  input.column.settings.workspaceId = workspaceId;
  await expect(
    anthropicModelProvider.generate(
      { ...context(), workspaceId: "wrkspc_AnotherSynthetic" },
      input,
      observer(),
    ),
  ).rejects.toMatchObject({ code: "invalid_request", dispatched: false });
  expect(network).not.toHaveBeenCalled();
});

it.each(
  [400, 404, 418, 401, 403, 429, 500].flatMap((status) =>
    [false, true].map((selected) => ({ status, selected })),
  ),
)(
  "preserves paid settlement for HTTP $status (selector=$selected)",
  async ({ status, selected }) => {
    const input = generationInput();
    if (selected) input.column.settings.workspaceId = workspaceId;
    network.mockResolvedValueOnce(json("{}", { status }));
    const callbacks = observer();
    const code =
      status === 401
        ? "invalid_credentials"
        : status === 403
          ? "refused"
          : status === 429
            ? "rate_limited"
            : status >= 500
              ? "provider_error"
              : "invalid_response";
    await expect(
      anthropicModelProvider.generate(context(), input, callbacks),
    ).rejects.toMatchObject({ code, dispatched: true });
    expect(callbacks.settle).toHaveBeenCalledOnce();
    expect(callbacks.settle.mock.calls[0][1].failure).toBe(code);
    expect(network).toHaveBeenCalledOnce();
  },
);
