import { hashApiKey } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiAuthError, authenticateApiKey, authenticateBearer } from "./auth";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    personalAccessToken: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

const rawKey = "bsb_key_test_1234567890abcdef";

function requestWithKey(key = rawKey) {
  return new Request("https://example.com/api/v1/projects", {
    headers: { authorization: `Bearer ${key}` },
  });
}

function apiKeyRow(
  key = rawKey,
  revokedAt: Date | null = null,
  scopes = ["read", "write", "admin"],
  expiresAt: Date | null = null,
) {
  return {
    expiresAt,
    hashedKey: hashApiKey(key),
    id: "key_1",
    name: "Production",
    prefix: key.slice(0, 21),
    project: {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: "example.com",
      id: "project_1",
      name: "Example",
      publicId: "prj_1",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    projectId: "project_1",
    revokedAt,
    scopes,
  };
}

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiKey.update.mockResolvedValue({ id: "key_1" });
  });

  it("authenticates a valid bearer key and touches lastUsedAt", async () => {
    mocks.prisma.apiKey.findMany.mockResolvedValue([apiKeyRow()]);

    const result = await authenticateApiKey(requestWithKey());

    expect(result.apiKey).toMatchObject({ id: "key_1", projectId: "project_1" });
    expect(result.project.publicId).toBe("prj_1");
    expect(mocks.prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { prefix: rawKey.slice(0, 21) },
      }),
    );
    expect(mocks.prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastUsedAt: expect.any(Date) },
        where: { id: "key_1" },
      }),
    );
  });

  it("returns the stored per-key scopes", async () => {
    mocks.prisma.apiKey.findMany.mockResolvedValue([apiKeyRow(rawKey, null, ["read"])]);

    const result = await authenticateApiKey(requestWithKey());

    expect(result.apiKey.scopes).toEqual(["read"]);
  });

  it("rejects an invalid key without updating usage", async () => {
    mocks.prisma.apiKey.findMany.mockResolvedValue([apiKeyRow("bsb_key_live_other_key")]);

    await expect(authenticateApiKey(requestWithKey())).rejects.toBeInstanceOf(ApiAuthError);

    expect(mocks.prisma.apiKey.update).not.toHaveBeenCalled();
  });

  it.each(["bsk_live_1234567890abcdef", "bsp_live_1234567890abcdef"])(
    "rejects legacy %s credentials before querying storage",
    async (legacyKey) => {
      await expect(authenticateApiKey(requestWithKey(legacyKey))).rejects.toBeInstanceOf(
        ApiAuthError,
      );

      expect(mocks.prisma.apiKey.findMany).not.toHaveBeenCalled();
      expect(mocks.prisma.apiKey.update).not.toHaveBeenCalled();
    },
  );

  it("rejects a revoked key without updating usage", async () => {
    mocks.prisma.apiKey.findMany.mockResolvedValue([
      apiKeyRow(rawKey, new Date("2026-01-03T00:00:00.000Z")),
    ]);

    await expect(authenticateApiKey(requestWithKey())).rejects.toBeInstanceOf(ApiAuthError);

    expect(mocks.prisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("rejects an expired key without updating usage", async () => {
    mocks.prisma.apiKey.findMany.mockResolvedValue([
      apiKeyRow(rawKey, null, ["read"], new Date("2020-01-01T00:00:00.000Z")),
    ]);

    await expect(authenticateApiKey(requestWithKey())).rejects.toBeInstanceOf(ApiAuthError);

    expect(mocks.prisma.apiKey.update).not.toHaveBeenCalled();
  });
});

describe("authenticateBearer", () => {
  const rawPersonalToken = "bsb_pat_live_1234567890abcdef";

  function personalTokenRow(overrides: Record<string, unknown> = {}) {
    return {
      expiresAt: null,
      hashedKey: hashApiKey(rawPersonalToken),
      id: "pat_1",
      name: "CLI",
      prefix: rawPersonalToken.slice(0, 21),
      publicId: "pat_a00000000000000000000000",
      revokedAt: null,
      scopes: ["read", "write", "admin"],
      user: {
        email: "owner@example.com",
        id: "user_1",
        memberships: [{ projectId: "project_1", role: "owner" }],
        name: "Owner",
        publicId: "usr_a00000000000000000000000",
      },
      userId: "user_1",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiKey.update.mockResolvedValue({ id: "key_1" });
    mocks.prisma.personalAccessToken.update.mockResolvedValue({ id: "pat_1" });
  });

  it("routes bsb_key credentials through the project-key path", async () => {
    mocks.prisma.apiKey.findMany.mockResolvedValue([apiKeyRow()]);

    await expect(authenticateBearer(requestWithKey())).resolves.toMatchObject({
      apiKey: { id: "key_1" },
      kind: "project_key",
    });
    expect(mocks.prisma.personalAccessToken.findMany).not.toHaveBeenCalled();
  });

  it("authenticates bsb_pat credentials with user memberships", async () => {
    mocks.prisma.personalAccessToken.findMany.mockResolvedValue([personalTokenRow()]);
    const req = requestWithKey(rawPersonalToken);

    await expect(authenticateBearer(req)).resolves.toMatchObject({
      kind: "personal_token",
      memberships: [{ projectId: "project_1", role: "owner" }],
      token: {
        id: "pat_1",
        publicId: "pat_a00000000000000000000000",
        userId: "user_1",
      },
      user: { email: "owner@example.com", id: "user_1" },
    });
    expect(mocks.prisma.personalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastUsedAt: expect.any(Date) }, where: { id: "pat_1" } }),
    );
  });

  it.each([
    ["expired", { expiresAt: new Date("2020-01-01T00:00:00.000Z") }],
    ["revoked", { revokedAt: new Date("2026-01-01T00:00:00.000Z") }],
  ])("rejects %s personal credentials", async (_state, override) => {
    mocks.prisma.personalAccessToken.findMany.mockResolvedValue([personalTokenRow(override)]);

    await expect(authenticateBearer(requestWithKey(rawPersonalToken))).rejects.toBeInstanceOf(
      ApiAuthError,
    );
    expect(mocks.prisma.personalAccessToken.update).not.toHaveBeenCalled();
  });

  it.each(["bsk_live_1234567890abcdef", "bsp_live_1234567890abcdef"])(
    "rejects legacy %s bearer credentials before querying storage",
    async (legacyKey) => {
      await expect(authenticateBearer(requestWithKey(legacyKey))).rejects.toBeInstanceOf(
        ApiAuthError,
      );

      expect(mocks.prisma.apiKey.findMany).not.toHaveBeenCalled();
      expect(mocks.prisma.personalAccessToken.findMany).not.toHaveBeenCalled();
    },
  );
});
