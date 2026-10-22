import { captureSnapshotDefinition } from "@/lib/measurement-definitions/snapshot-binding";
import { snapshotDefinitionSession } from "@/lib/measurement-definitions/snapshot-dispatch";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { beforeEach, expect, it, vi } from "vitest";
import { runCheckWithFallback } from "./fallback-chain";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  access: vi.fn(),
  actor: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    rankCheck: { findUnique: vi.fn(), findFirst: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx),
  },
}));
vi.mock("@/lib/measurement-definitions/access", () => ({ assertDefinitionActor: mocks.actor }));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccessInTransaction: mocks.access,
}));
vi.mock("./provider-chain-loader", () => ({
  loadFreshSerpProviderConnection: async () => connection,
  ProviderChainError: class extends Error {},
}));
vi.mock("./runner", () => ({ runCheck: mocks.run, RankCheckRunnerError: class extends Error {} }));
const connection = {
  id: "own-connection",
  provider: "serpapi",
  credentialSource: "own",
  credentialsEncrypted: "synthetic-ciphertext",
};
const context = {
  version: 1 as const,
  capturedAt: new Date().toISOString(),
  keyword: "flowtools",
  domain: "example.com",
  device: "desktop" as const,
  location: {
    gl: "pl",
    hl: "pl",
    primaryGeoCode: null,
    primaryGeoName: "Poland",
    secondaryGeoName: "Poland",
  },
  connectionId: connection.id,
  nextStart: 10,
  ended: false,
};
const state = {
  version: 1 as const,
  state: "running" as const,
  nextStart: 10,
  ended: false,
  pages: [],
  requestId: "snapshot-request",
  leaseUntil: new Date(Date.now() + 180000).toISOString(),
};
const input = {
  projectId: "project",
  rankCheckId: "completed-snapshot",
  keyword: {
    id: "keyword",
    text: context.keyword,
    domain: context.domain,
    device: context.device,
    location: context.location,
  },
  connections: [connection],
  depth: 10 as const,
  schedule: {},
  source: "app" as const,
  resolveProvider: () => ({ id: "serpapi" }),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.$queryRaw.mockResolvedValue([{ original: null, observedAt: null }]);
  mocks.tx.$executeRaw.mockResolvedValue(1);
  mocks.tx.project.findUnique.mockResolvedValue({
    id: "project",
    writeMode: "active",
    isSample: false,
  });
  mocks.tx.providerConnection.findUnique.mockResolvedValue({
    ...connection,
    projectId: "project",
    enabled: true,
    status: "connected",
  });
  mocks.tx.rankCheck.findUnique.mockResolvedValue({
    status: "completed",
    provider: "serpapi",
    keywordId: "keyword",
    runItem: null,
  });
  mocks.tx.rankCheck.findFirst.mockResolvedValue({
    raw: { snapshotContinuation: context, snapshotExtension: state },
  });
  mocks.run.mockResolvedValue({ rankCheck: {}, usageRecorded: true });
});
async function continuation() {
  const binding = await captureSnapshotDefinition(mocks.tx as never, {
    id: state.requestId,
    actorId: "actor",
    projectId: "project",
    keywordId: "keyword",
    rankCheckId: "completed-snapshot",
    context,
    state,
  });
  const version = ownCredentialVersion("serpapi", connection.id, connection.credentialsEncrypted);
  if (!version) throw new Error("Fixture credential version missing");
  return snapshotDefinitionSession(binding, version);
}
it("accepts the original completed snapshot only through its trusted continuation lease", async () => {
  const session = await continuation();
  await expect(
    runCheckWithFallback({ ...input, definitionContinuation: session } as never),
  ).resolves.toMatchObject({ provider: "serpapi" });
  expect(mocks.run).toHaveBeenCalledOnce();
  expect(mocks.access).toHaveBeenCalled();
  expect(mocks.tx.rankCheck.findUnique).not.toHaveBeenCalled();
});
it("keeps ordinary completed rank reservations rejected before runner dispatch", async () => {
  await expect(runCheckWithFallback(input as never)).rejects.toMatchObject({
    cause: { message: "Rank reservation mismatch." },
  });
  expect(mocks.run).not.toHaveBeenCalled();
});
it("rejects a copied continuation before runner dispatch", async () => {
  const session = await continuation();
  await expect(
    runCheckWithFallback({ ...input, definitionContinuation: { ...session } } as never),
  ).rejects.toThrow();
  expect(mocks.run).not.toHaveBeenCalled();
});
it.each(["project", "connection", "access", "lease"])(
  "rejects changed %s before runner dispatch",
  async (field) => {
    const session = await continuation();
    if (field === "project")
      mocks.tx.project.findUnique.mockResolvedValue({
        id: "project",
        writeMode: "read_only",
        isSample: false,
      });
    if (field === "connection")
      mocks.tx.providerConnection.findUnique.mockResolvedValue({
        ...connection,
        projectId: "project",
        enabled: false,
        status: "connected",
      });
    if (field === "access") mocks.access.mockRejectedValueOnce(new Error("access denied"));
    if (field === "lease")
      mocks.tx.rankCheck.findFirst.mockResolvedValue({
        raw: {
          snapshotContinuation: context,
          snapshotExtension: { ...state, requestId: "new-request" },
        },
      });
    await expect(
      runCheckWithFallback({ ...input, definitionContinuation: session } as never),
    ).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled();
  },
);
