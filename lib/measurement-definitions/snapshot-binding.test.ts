import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { serpRankLocation } from "@/lib/serp/location";
import { beforeEach, expect, it, vi } from "vitest";
import type { DefinitionTransaction } from "./model";
import { captureSnapshotDefinition } from "./snapshot-binding";
import { assertSnapshotNativeRequest, snapshotDefinitionSession } from "./snapshot-dispatch";
import { nativeBindingFixture, nativeRequestFixture } from "./worker-native.fixtures";

vi.mock("server-only", () => ({}));
vi.mock("./access", () => ({ assertDefinitionActor: vi.fn(async () => undefined) }));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccessInTransaction: vi.fn(async () => undefined),
}));
beforeEach(() => vi.useRealTimers());
function fixture() {
  const original = nativeBindingFixture("serpapi");
  const capturedAt = new Date(Date.now() - 1000).toISOString();
  const context = {
    version: 1 as const,
    capturedAt,
    keyword: original.request.keyword,
    domain: original.request.domain,
    device: original.request.device,
    location: serpRankLocation(original.request.location),
    nextStart: 20,
    ended: false,
    connectionId: "original-connection",
  };
  const state = {
    version: 1 as const,
    state: "running" as const,
    nextStart: 20,
    ended: false,
    pages: [],
    requestId: "current-request",
    leaseUntil: new Date(Date.now() + 60000).toISOString(),
  };
  const raw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => [
    {
      original: { ...original, capturedAt: original.capturedAt.toISOString() },
      observedAt: "2026-10-01T00:00:00.000Z",
    },
  ]);
  const writes = vi.fn(async () => 1);
  const tx = {
    $queryRaw: raw,
    $executeRaw: writes,
    rankCheck: {
      findFirst: vi.fn(async () => ({
        raw: { snapshotContinuation: context, snapshotExtension: state },
      })),
    },
    project: { findUnique: vi.fn(async () => ({ writeMode: "active", isSample: false })) },
    providerConnection: {
      findUnique: vi.fn(async () => ({
        projectId: original.projectId,
        provider: "serpapi",
        enabled: true,
        status: "connected",
        credentialSource: "own",
        credentialsEncrypted: "synthetic-ciphertext",
      })),
    },
  } as unknown as DefinitionTransaction;
  const input = {
    id: state.requestId,
    actorId: "actual-member",
    projectId: original.projectId,
    keywordId: original.keywordId,
    rankCheckId: original.owner.rankCheckId,
    context,
    state,
  };
  return { original, context, state, raw, writes, tx, input };
}
it("continuation keeps original completed semantics/time, distinct new offset/depth and no current-head recapture", async () => {
  const f = fixture();
  const binding = await captureSnapshotDefinition(f.tx, f.input);
  expect(binding).toMatchObject({
    originalBindingId: f.original.id,
    originalObservedAt: "2026-10-01T00:00:00.000Z",
    nextStart: 20,
    requestDepth: 10,
    context: f.context,
  });
  const request = nativeRequestFixture(f.original, 20);
  assertSnapshotNativeRequest(binding, request);
  expect(() =>
    assertSnapshotNativeRequest(binding, nativeRequestFixture(f.original, 10)),
  ).toThrow();
  const mutated = {
    ...request,
    url: request.url.replace(encodeURIComponent(f.original.request.keyword), "changed"),
  };
  // Construct q mutation independently of URLSearchParams encoding details.
  const url = new URL(mutated.url);
  url.searchParams.set("q", "changed");
  expect(() => assertSnapshotNativeRequest(binding, { ...request, url: url.href })).toThrow();
  const sql = f.raw.mock.calls.map(([strings]) => strings.join("?")).join(" ");
  expect(sql).not.toMatch(
    /measurement_definition_heads|measurement_definition_source|FROM keywords/u,
  );
  expect(f.writes).toHaveBeenCalledOnce();
});
it("an actual snapshot lease is required again immediately before native admission; expired lease grants no proof", async () => {
  const f = fixture();
  const binding = await captureSnapshotDefinition(f.tx, f.input);
  const version = ownCredentialVersion("serpapi", f.context.connectionId, "synthetic-ciphertext");
  if (!version) throw new Error("Synthetic credential version is required.");
  const session = snapshotDefinitionSession(binding, version);
  // The original request context still exists, but the current durable request lease expired.
  f.state.leaseUntil = new Date(Date.now() - 1).toISOString();
  await expect(
    session.beforeReserve.assertRequest(
      f.tx,
      "native-operation",
      nativeRequestFixture(f.original, 20),
    ),
  ).rejects.toThrow();
  expect(f.writes).toHaveBeenCalledOnce(); // only original capture, no admission/dispatch proof
});
it("retained legacy context stays explicit unknown and caller credentials are not priced or retained", async () => {
  const f = fixture();
  f.raw.mockResolvedValueOnce([{ original: null, observedAt: null }] as never);
  const binding = await captureSnapshotDefinition(f.tx, f.input);
  expect(binding).toMatchObject({
    originalBindingId: null,
    originalObservedAt: null,
    originProof: "legacy_retained_context",
  });
  const request = nativeRequestFixture(f.original, 20);
  expect(() =>
    assertSnapshotNativeRequest(binding, {
      ...request,
      headers: { Authorization: "synthetic-secret" },
    }),
  ).toThrow();
  expect(() => snapshotDefinitionSession({ ...binding }, "digest")).toThrow(); // JSON copy cannot mint the trusted continuation principal
});
