import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  preview: vi.fn(),
  add: vi.fn(),
  tx: vi.fn(),
  revalidate: vi.fn(),
  domain: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: host.actor,
  requireProjectScope: host.scope,
  parseActionInput: (schema: { parse: (raw: unknown) => unknown }, raw: unknown) =>
    schema.parse(raw),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: host.tx } }));
vi.mock("@/lib/markets/device-targets-service", () => ({
  previewMarketDeviceTargets: host.preview,
  addMarketDeviceTargets: host.add,
}));
vi.mock("@/lib/projects/tracked-domain", () => ({ requireTrackedDomain: host.domain }));
vi.mock("./keyword-helpers", () => ({ revalidateKeywords: host.revalidate }));

import {
  addProjectMarketDeviceTargets,
  previewProjectMarketDeviceTargets,
} from "./project-market-devices";

const input = {
  projectId: `prj_${"a".repeat(24)}`,
  marketId: `pmkt_${"b".repeat(24)}`,
  device: "mobile",
  scheduleId: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  host.actor.mockResolvedValue({ id: "member" });
  host.scope.mockResolvedValue({ id: "internal-project", domain: "example.com" });
  host.tx.mockImplementation(async (run) => run("tx"));
  host.preview.mockResolvedValue({ outcome: "ready" });
  host.add.mockResolvedValue({ outcome: "created", created: 1 });
});
it.each([previewProjectMarketDeviceTargets, addProjectMarketDeviceTargets])(
  "denies viewers/read-only project writes before any target read or add",
  async (action) => {
    host.scope.mockRejectedValue(new Error("forbidden"));
    await expect(
      action({
        ...input,
        ...(action === addProjectMarketDeviceTargets ? { fingerprint: "a".repeat(64) } : {}),
      }),
    ).rejects.toThrow("forbidden");
    expect(host.scope).toHaveBeenCalledWith({ id: "member" }, "create", input.projectId, {
      type: "keyword",
    });
    expect(host.tx).not.toHaveBeenCalled();
    expect(host.add).not.toHaveBeenCalled();
  },
);
it("rechecks current permission after a successful preview and rejects revoked membership", async () => {
  await previewProjectMarketDeviceTargets(input);
  host.scope.mockRejectedValueOnce(new Error("membership revoked"));
  await expect(
    addProjectMarketDeviceTargets({ ...input, fingerprint: "a".repeat(64) }),
  ).rejects.toThrow("membership revoked");
  expect(host.actor).toHaveBeenCalledTimes(2);
  expect(host.add).not.toHaveBeenCalled();
});
it("uses server-resolved internal scope and rejects malformed IDs or fingerprints", async () => {
  await previewProjectMarketDeviceTargets(input);
  expect(host.preview).toHaveBeenCalledWith("tx", "internal-project", input);
  await expect(
    addProjectMarketDeviceTargets({ ...input, fingerprint: "bad", keywordIds: ["foreign"] }),
  ).rejects.toThrow();
  expect(host.add).not.toHaveBeenCalled();
});

it("accepts optional public keyword selections without replacing server-resolved project scope", async () => {
  const selection = { ...input, keywordIds: [`kw_${"c".repeat(24)}`] };
  await previewProjectMarketDeviceTargets(selection);
  expect(host.preview).toHaveBeenCalledWith("tx", "internal-project", selection);
  await addProjectMarketDeviceTargets({ ...selection, fingerprint: "a".repeat(64) });
  expect(host.add).toHaveBeenCalledWith("tx", "member", "internal-project", {
    ...selection,
    fingerprint: "a".repeat(64),
  });
});
it("keeps an explicit empty public selection through the action schema", async () => {
  await previewProjectMarketDeviceTargets({ ...input, keywordIds: [] });
  expect(host.preview).toHaveBeenCalledWith("tx", "internal-project", { ...input, keywordIds: [] });
});
