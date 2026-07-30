import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiInputError } from "./errors";
import { createWebhookEndpointRecord, updateWebhookEndpointRecord } from "./webhook-service";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    webhookEndpoint: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
}));

const data = {
  description: null,
  enabled: true,
  hmacSecret: "webhook-secret",
  url: "https://example.com/webhook",
};
const scope = { actorId: "user_1", projectId: "project_1" };
const endpointPublicId = "we_a00000000000000000000000";

describe("webhook endpoint service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "project_1" }]);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(0);
    mocks.prisma.webhookEndpoint.create.mockResolvedValue({
      createdAt: new Date("2026-07-23T07:00:00.000Z"),
      description: null,
      enabled: true,
      id: "webhook_1",
      lastDeliveryAt: null,
      publicId: endpointPublicId,
      updatedAt: new Date("2026-07-23T07:00:00.000Z"),
      url: data.url,
    });
    mocks.prisma.webhookEndpoint.findFirst.mockResolvedValue({
      createdAt: new Date("2026-07-23T07:00:00.000Z"),
      description: null,
      enabled: true,
      id: "webhook_1",
      lastDeliveryAt: null,
      publicId: endpointPublicId,
      updatedAt: new Date("2026-07-23T07:00:00.000Z"),
      url: data.url,
    });
    mocks.prisma.webhookEndpoint.update.mockResolvedValue({
      createdAt: new Date("2026-07-23T07:00:00.000Z"),
      description: null,
      enabled: true,
      id: "webhook_1",
      lastDeliveryAt: null,
      publicId: endpointPublicId,
      updatedAt: new Date("2026-07-23T07:01:00.000Z"),
      url: data.url,
    });
    mocks.writeAudit.mockResolvedValue(undefined);
  });

  it("rejects the eleventh endpoint with the API input-error contract", async () => {
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(10);

    const error = await createWebhookEndpointRecord(data, scope).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiInputError);
    expect(error.message).toContain("a project can have at most 10 webhook endpoints");
    expect(mocks.prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("locks the project before counting so concurrent creates cannot exceed the cap", async () => {
    await createWebhookEndpointRecord(data, scope);

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.webhookEndpoint.count.mock.invocationCallOrder[0],
    );
    expect(mocks.prisma.webhookEndpoint.count.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.webhookEndpoint.create.mock.invocationCallOrder[0],
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("creates and audits endpoints below the project cap", async () => {
    mocks.prisma.webhookEndpoint.count.mockResolvedValue(9);

    await expect(createWebhookEndpointRecord(data, scope)).resolves.toMatchObject({
      id: "webhook_1",
    });
    expect(mocks.prisma.webhookEndpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hmacSecret: "encrypted:webhook-secret",
          projectId: "project_1",
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook_endpoint.create", targetId: endpointPublicId }),
      mocks.prisma,
    );
    expect(mocks.prisma.webhookEndpoint.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeAudit.mock.invocationCallOrder[0],
    );
  });

  it("fails the create transaction when the audit write fails", async () => {
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(createWebhookEndpointRecord(data, scope)).rejects.toThrow("audit unavailable");
    expect(mocks.prisma.webhookEndpoint.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("rotates a provided non-empty secret", async () => {
    await updateWebhookEndpointRecord("webhook_1", { hmacSecret: "rotated-webhook-secret" }, scope);

    expect(mocks.prisma.webhookEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hmacSecret: "encrypted:rotated-webhook-secret" },
      }),
    );
  });

  it("leaves the secret unchanged when rotation is absent", async () => {
    await updateWebhookEndpointRecord("webhook_1", { enabled: false }, scope);

    expect(mocks.prisma.webhookEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } }),
    );
  });

  it.each([null, ""])("rejects an explicit invalid rotation value %j", async (hmacSecret) => {
    await expect(updateWebhookEndpointRecord("webhook_1", { hmacSecret }, scope)).rejects.toThrow(
      ApiInputError,
    );
    expect(mocks.prisma.webhookEndpoint.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.webhookEndpoint.update).not.toHaveBeenCalled();
  });
});
