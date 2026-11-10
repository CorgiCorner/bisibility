import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  load: vi.fn(),
  write: vi.fn(),
  connection: vi.fn(),
  capture: vi.fn(),
  transport: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: object) => unknown) => fn({}),
    providerConnection: { findFirst: m.connection },
  },
}));
vi.mock("@/lib/provider-comparison/access", () => ({
  assertComparisonHistoryWrite: m.auth,
  assertComparisonAccess: m.auth,
}));
vi.mock("./source", () => ({ loadRepairSource: m.load, writeRepairSource: m.write }));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ login: "test", password: "test" }),
}));
vi.mock("@/lib/providers/own-key-guard", () => ({ assertOwnKeyStored: vi.fn() }));
vi.mock("@/lib/providers/credential-extension", () => ({ deploymentProviderCredentials: vi.fn() }));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: m.limit }));
vi.mock("@/lib/provider-responses/connection", () => ({ connectionResponseRecorder: m.capture }));
vi.mock("@/lib/providers/serp/dataforseo-redirect-transport", () => ({
  dataForSeoRedirectTransport: () => m.transport,
}));

import { repairSerpUrls } from "./activity";

const target = { kind: "check" as const, checkId: "check_abcdefgh" };
const input = {
  projectId: "project",
  actorId: "actor",
  target,
  sourceHash: "hash",
  workflowId: "job",
  runId: "run",
};
const url = "https://google.com/goto?url=one";
const source = {
  id: "id",
  hash: "hash",
  body: { organic_results: [{ rank: 1, url }], provider_response: { original: true } },
  rows: [{ rank: 1, type: "organic", url }],
};
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue(undefined);
  m.limit.mockResolvedValue({ success: true });
  m.connection.mockResolvedValue({
    id: "connection",
    credentialSource: "own",
    credentialsEncrypted: "cipher",
  });
  m.load.mockResolvedValueOnce(structuredClone(source)).mockImplementation(async () => ({
    ...structuredClone(source),
    body: { ...source.body, _urlRepair: m.write.mock.calls[0]?.[3] },
  }));
  m.transport.mockResolvedValue([{ goto: url, url: "https://destination.test/" }]);
});
it("enriches a stored source without changing positions, costs, or the native response", async () => {
  expect(await repairSerpUrls(input)).toEqual({ resolved: 1, unresolved: 0 });
  expect(m.auth).toHaveBeenNthCalledWith(1, {}, "project", "actor", true);
  expect(m.auth).toHaveBeenNthCalledWith(2, {}, "project", "actor");
  expect(m.connection).toHaveBeenCalledWith({
    where: { projectId: "project", provider: "dataforseo", enabled: true, status: "connected" },
  });
  expect(m.transport).toHaveBeenCalledExactlyOnceWith([url]);
  expect(m.limit).toHaveBeenCalledTimes(1);
  expect(m.capture).toHaveBeenCalledWith("connection", "dataforseo", "url_resolution");
  const overlay = m.write.mock.calls[1][3];
  expect(overlay).toMatchObject({
    status: "completed",
    mappings: { [url]: "https://destination.test/" },
  });
  expect(m.write.mock.calls[1][2].body.organic_results).toEqual(source.body.organic_results);
  expect(m.write.mock.calls[1][2].body.provider_response).toEqual(source.body.provider_response);
  expect(overlay).not.toHaveProperty("position");
  expect(overlay).not.toHaveProperty("costCents");
});
it("makes no provider call after access is revoked", async () => {
  m.auth.mockRejectedValue(new Error("Denied"));
  await expect(repairSerpUrls(input)).rejects.toThrow("Denied");
  expect(m.transport).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
});
it("refuses changed or purged evidence before conversion", async () => {
  m.load.mockReset().mockResolvedValue({ ...source, hash: "changed" });
  await expect(repairSerpUrls(input)).rejects.toThrow("Saved results changed");
  expect(m.transport).not.toHaveBeenCalled();
});
it("does not restore evidence changed while conversion was running", async () => {
  m.load
    .mockReset()
    .mockResolvedValueOnce(structuredClone(source))
    .mockResolvedValue({ ...source, hash: "changed" });
  await expect(repairSerpUrls(input)).rejects.toThrow("Saved results changed");
  expect(m.write).toHaveBeenCalledTimes(1);
});
it("leaves missing conversions unresolved rather than inventing destinations", async () => {
  m.transport.mockResolvedValue([]);
  expect(await repairSerpUrls(input)).toEqual({ resolved: 0, unresolved: 1 });
  expect(m.write.mock.calls[1][3].mappings).toEqual({});
});

it("does not call the converter when the provider rate limit is exhausted", async () => {
  m.limit.mockResolvedValue({ success: false });
  expect(await repairSerpUrls(input)).toEqual({ resolved: 0, unresolved: 1 });
  expect(m.transport).not.toHaveBeenCalled();
});
