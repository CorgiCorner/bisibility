import type { Prisma } from "@/lib/generated/prisma/client";
import { modelAccountDigest } from "@/lib/providers/model/account-scope";
import { catalogFixture, context } from "@/lib/providers/model/anthropic/fixtures.test-support";
import { isModelProviderRegistered } from "@/lib/providers/model/registry";
import { beforeEach, expect, test, vi } from "vitest";
import { resolveModelConnection } from "./connection-resolution";

vi.mock("@/lib/providers/crypto", async (original) => ({
  ...(await original<typeof import("@/lib/providers/crypto")>()),
  decryptProviderCredentials: () => ({ apiKey: context().apiKey }),
}));
const limits = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: limits.consume }));
const row = {
  id: "internal",
  provider: "anthropic",
  kind: "model",
  credentialSource: "own",
  enabled: true,
  status: "connected",
  credentialsEncrypted: "fixture-envelope",
};
const tx = { $queryRaw: vi.fn(async () => [row]) } as unknown as Prisma.TransactionClient;
const db = { $transaction: async (work: (client: typeof tx) => unknown) => work(tx) } as Parameters<
  typeof resolveModelConnection
>[0];
const request = {
  providerId: "anthropic" as const,
  connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa" as const,
};
beforeEach(() => {
  limits.consume.mockReset().mockResolvedValue({ success: true });
  row.enabled = true;
  row.credentialSource = "own";
  row.credentialsEncrypted = crypto.randomUUID();
});

test("all native loaders are registered without loading or dispatching on import", () => {
  expect(
    ["openai", "anthropic", "openrouter", "vercel_ai_gateway"].map(isModelProviderRegistered),
  ).toEqual([true, true, true, true]);
  expect(isModelProviderRegistered("dataforseo")).toBe(false);
});

test("real workspace metadata probe, account and cache scopes include workspace and key revision", async () => {
  const network = vi.fn(
    async () =>
      new Response(JSON.stringify(catalogFixture()), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", network);
  const a = await resolveModelConnection(db, "project", {
    ...request,
    workspaceId: "wrkspc_SyntheticA",
  });
  expect(a.catalog.workspaceId).toBe("wrkspc_SyntheticA");
  expect(a.accountDigest).toBe(
    modelAccountDigest("anthropic", context().apiKey, "wrkspc_SyntheticA"),
  );
  expect(
    (await resolveModelConnection(db, "project", { ...request, workspaceId: "wrkspc_SyntheticA" }))
      .catalog,
  ).toEqual(a.catalog);
  await resolveModelConnection(db, "project", { ...request, workspaceId: "wrkspc_SyntheticB" });
  row.credentialsEncrypted = "new-envelope";
  await resolveModelConnection(db, "project", { ...request, workspaceId: "wrkspc_SyntheticA" });
  expect(network).toHaveBeenCalledTimes(3);
  expect(
    network.mock.calls.map((call) =>
      new Headers((call as unknown as [unknown, RequestInit])[1]?.headers).get(
        "anthropic-workspace-id",
      ),
    ),
  ).toEqual(["wrkspc_SyntheticA", "wrkspc_SyntheticB", "wrkspc_SyntheticA"]);
});

test.each(["disabled", "hosted", "foreign"])(
  "refuses %s connection before metadata",
  async (kind) => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    if (kind === "disabled") row.enabled = false;
    if (kind === "hosted") row.credentialSource = "hosted";
    await expect(
      resolveModelConnection(
        db,
        "project",
        kind === "foreign" ? { ...request, providerId: "openai" } : request,
      ),
    ).rejects.toMatchObject({ reason: "connection_unavailable" });
    expect(network).not.toHaveBeenCalled();
  },
);

test("customer-key catalog throttle rejects before metadata and allows a subsequent probe", async () => {
  const network = vi.fn(
    async () =>
      new Response(JSON.stringify(catalogFixture()), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", network);
  limits.consume.mockResolvedValueOnce({ success: false });
  await expect(resolveModelConnection(db, "project", request)).rejects.toMatchObject({
    reason: "connection_unavailable",
  });
  expect(network).not.toHaveBeenCalled();
  expect(limits.consume).toHaveBeenCalledWith(
    "anthropic",
    { apiKey: context().apiKey },
    { projectId: "project" },
  );
  await expect(resolveModelConnection(db, "project", request)).resolves.toHaveProperty("catalog");
  expect(network).toHaveBeenCalledOnce();
});
