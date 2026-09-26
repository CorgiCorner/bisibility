import { describe, expect, it, vi } from "vitest";
import { recordProviderUsage } from "./recorder";
import { createProviderRequestAttribution } from "./tag";

const attribution = {
  context: {
    correlationId: "request-1",
    feature: "keyword_metrics" as const,
    projectId: "project_1",
    source: "sdk" as const,
    trigger: "manual" as const,
  },
  tag: "app=bisibility;stage=dev;src=sdk;trg=manual;f=keyword_metrics;p=project_1;c=request-1",
};
const attributionWithCredential = {
  ...attribution,
  credential: { id: "key_9", kind: "project_key" as const },
};
function client(count = 1) {
  return { providerCostEntry: { createMany: vi.fn().mockResolvedValue({ count }) } };
}

describe("provider usage recorder", () => {
  it.each(["editable:prj_example", `project:${"a".repeat(100)}`])(
    "preserves trusted project identity when the provider tag normalizes %s",
    async (projectId) => {
      const db = client();
      const request = await createProviderRequestAttribution({ ...attribution.context, projectId });
      await expect(
        recordProviderUsage(db, {
          attribution: request,
          connectionId: "connection_1",
          costCents: 0,
          failed: false,
          projectId,
          provider: "serpapi",
          usageQuantity: 2,
        }),
      ).resolves.toEqual({ status: "recorded" });
      expect(request.context.projectId).toBe(projectId);
      expect(request.tag).not.toContain(`p=${projectId};`);
      expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ projectId, usageQuantity: 2 })],
        skipDuplicates: true,
      });
    },
  );
  it("records cost, native quantity, and trusted request identity", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 2.5,
        failed: false,
        provider: "provider-a",
        providerRequestId: "native-1",
        usageQuantity: 3,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          connectionId: "connection_1",
          costCents: 2.5,
          providerRequestId: "native-1",
          usageQuantity: 3,
        }),
      ],
      skipDuplicates: true,
    });
  });
  it("persists credential attribution when it is provided", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 1,
        credentialId: "api_key_1",
        credentialKind: "project_key",
        failed: false,
        provider: "provider-a",
        usageQuantity: 1,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ credentialId: "api_key_1", credentialKind: "project_key" })],
      skipDuplicates: true,
    });
  });
  it("persists the attribution credential when input fields are absent", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution: attributionWithCredential,
        connectionId: "connection_1",
        costCents: 1,
        failed: false,
        provider: "provider-a",
        usageQuantity: 1,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ credentialId: "key_9", credentialKind: "project_key" })],
      skipDuplicates: true,
    });
  });
  it("prefers explicit input credential fields over the attribution credential", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution: attributionWithCredential,
        connectionId: "connection_1",
        costCents: 1,
        credentialId: "pat_2",
        credentialKind: "personal_token",
        failed: false,
        provider: "provider-a",
        usageQuantity: 1,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ credentialId: "pat_2", credentialKind: "personal_token" })],
      skipDuplicates: true,
    });
  });
  it("omits credential attribution when it is not provided", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 1,
        failed: false,
        provider: "provider-a",
        usageQuantity: 1,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ credentialId: undefined, credentialKind: undefined })],
      skipDuplicates: true,
    });
  });
  it("returns duplicate deterministically for a repeated native request id", async () => {
    const db = client(0);
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 2.5,
        failed: false,
        provider: "provider-a",
        providerRequestId: "native-1",
        usageQuantity: 1,
      }),
    ).resolves.toEqual({ status: "duplicate" });
  });
  it("records zero-cost quota usage when native quantity is positive", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 0,
        failed: false,
        provider: "provider-a",
        usageQuantity: 2,
      }),
    ).resolves.toEqual({ status: "recorded" });
    expect(db.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ costCents: 0, usageQuantity: 2 })],
      skipDuplicates: true,
    });
  });
  it("skips requests with neither monetary cost nor native usage", async () => {
    const values = { costCents: 0, failed: false, usageQuantity: null };
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        provider: "provider-a",
        providerRequestId: "native-1",
        ...values,
      }),
    ).resolves.toEqual({ status: "skipped" });
    expect(db.providerCostEntry.createMany).not.toHaveBeenCalled();
  });
  it("rejects attribution for another project", async () => {
    const db = client();
    await expect(
      recordProviderUsage(db, {
        attribution,
        connectionId: "connection_1",
        costCents: 1,
        failed: false,
        projectId: "project_2",
        provider: "provider-a",
      }),
    ).rejects.toThrow("project identity");
  });
});
