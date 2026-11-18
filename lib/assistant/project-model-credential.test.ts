import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, test, vi } from "vitest";
import { readProjectModelCredential } from "./project-model-credential";

const mocks = vi.hoisted(() => ({ find: vi.fn(), lock: vi.fn(), decode: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decode,
  encryptSecret: (value: string) => `encrypted:${value}`,
}));
const tx = {
  providerConnection: { findFirst: mocks.find },
  $queryRaw: mocks.lock,
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({
    id: "key-1",
    credentialsEncrypted: "envelope-1",
    enabled: true,
    status: "connected",
  });
  mocks.decode.mockReturnValue({ apiKey: "test1234" });
});

test("shares an existing project model key without copying it to personal credentials", async () => {
  const value = await readProjectModelCredential(tx, "project-1", "member-1", "openai");
  expect(value).toMatchObject({
    id: "project-model:key-1",
    provider: "openai",
    userId: "member-1",
    status: "active",
    last4: "1234",
  });
  expect(value?.encryptedSecret).toBe("encrypted:test1234");
  expect(mocks.find.mock.calls[0][0].where).toEqual({
    projectId: "project-1",
    provider: "openai",
    kind: "model",
    credentialSource: "own",
  });
});

test("locks and rechecks the retained project key, rejecting a personal credential reference", async () => {
  await readProjectModelCredential(tx, "project-1", "member-1", "openai", "project-model:key-1");
  expect(mocks.lock).toHaveBeenCalledOnce();
  expect(mocks.find.mock.calls[0][0].where.id).toBe("key-1");
  expect(
    await readProjectModelCredential(tx, "project-1", "member-1", "openai", "personal-key"),
  ).toBeNull();
  expect(mocks.find).toHaveBeenCalledTimes(1);
});

test.each(["disabled", "unreadable", "revoked"])(
  "a %s project key cannot authorize a request",
  async (kind) => {
    if (kind === "disabled")
      mocks.find.mockResolvedValue({
        id: "key-1",
        credentialsEncrypted: "envelope-1",
        enabled: false,
        status: "connected",
      });
    if (kind === "revoked")
      mocks.find.mockResolvedValue({
        id: "key-1",
        credentialsEncrypted: "envelope-1",
        enabled: true,
        status: "needs_reauth",
      });
    if (kind === "unreadable")
      mocks.decode.mockImplementation(() => {
        throw new Error("Bad envelope");
      });
    expect(await readProjectModelCredential(tx, "project-1", "member-1", "openai")).toMatchObject({
      status: "invalid",
      encryptedSecret: "",
    });
  },
);

test("rotation changes the frozen version even if the connection id remains the same", async () => {
  const first = await readProjectModelCredential(tx, "project-1", "member-1", "openai");
  mocks.find.mockResolvedValue({
    id: "key-1",
    credentialsEncrypted: "envelope-2",
    enabled: true,
    status: "connected",
  });
  const next = await readProjectModelCredential(tx, "project-1", "member-1", "openai");
  expect(first?.id).toBe(next?.id);
  expect(first?.versionHash).not.toBe(next?.versionHash);
});
