import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleted: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("./access", () => ({ AssistantRequestError: class extends Error {} }));

import { removeAssistantCredential, saveAssistantCredential } from "./credentials";

test("keys are encrypted, versioned and returned only in masked form", async () => {
  mocks.upsert.mockImplementation(async ({ create }) => ({
    id: "credential",
    provider: create.provider,
    last4: create.last4,
    status: "active",
  }));
  mocks.deleted.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (fn) =>
    fn({ assistantCredential: { upsert: mocks.upsert, deleteMany: mocks.deleted } }),
  );
  const raw = "fixture-not-a-real-provider-key";
  const result = await saveAssistantCredential("user", { provider: "openai", apiKey: raw });
  const first = mocks.upsert.mock.calls[0][0].create;
  expect(result).toEqual({
    id: "credential",
    provider: "openai",
    last4: raw.slice(-4),
    status: "active",
  });
  expect(first.encryptedSecret).not.toContain(raw);
  expect(first.versionHash).toMatch(/^[a-f0-9]{64}$/);
  await saveAssistantCredential("user", { provider: "openai", apiKey: raw });
  expect(mocks.upsert.mock.calls[1][0].create.versionHash).not.toBe(first.versionHash);
  await removeAssistantCredential("user", "credential");
  expect(mocks.audit).toHaveBeenCalledTimes(3);
});
