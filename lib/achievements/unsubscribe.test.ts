import { createDecipheriv, createHmac } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, createDecipheriv: vi.fn(crypto.createDecipheriv) };
});

const m = vi.hoisted(() => ({ update: vi.fn(), demo: false }));
vi.mock("@/lib/demo/config", () => ({
  readDemoConfig: () => ({ kind: m.demo ? "editable" : "disabled" }),
}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: (purpose: string) => [
    Buffer.alloc(32, purpose === "achievement-email-unsubscribe" ? 7 : 8),
  ],
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { achievementState: { updateMany: m.update } } }));

import {
  createAchievementUnsubscribeToken,
  unsubscribeAchievementEmail,
  verifyAchievementUnsubscribeToken,
} from "./unsubscribe";

beforeEach(() => {
  vi.clearAllMocks();
  m.demo = false;
});
it("authenticates category-only unsubscribe and rejects tampering without changing other preferences", async () => {
  const token = createAchievementUnsubscribeToken("user-a");
  expect(verifyAchievementUnsubscribeToken(token)).toBe("user-a");
  expect(token.split(".")[0]).toBe("v2");
  expect(token).not.toContain(Buffer.from("user-a").toString("base64url"));
  expect(verifyAchievementUnsubscribeToken(`${token.slice(0, -3)}abc`)).toBeNull();
  expect(verifyAchievementUnsubscribeToken("")).toBeNull();
  expect(await unsubscribeAchievementEmail(token)).toBe(true);
  expect(m.update).toHaveBeenCalledWith({
    where: { userId: "user-a", emailEnabled: true },
    data: { emailEnabled: false, revision: { increment: 1 } },
  });
});

it("never writes to a demo even with a valid signed token", async () => {
  m.demo = true;
  expect(await unsubscribeAchievementEmail(createAchievementUnsubscribeToken("user-a"))).toBe(
    false,
  );
  expect(m.update).not.toHaveBeenCalled();
});

it("continues to accept previously issued signed links", () => {
  const payload = Buffer.from("user-a").toString("base64url");
  const signature = createHmac("sha256", Buffer.alloc(32, 7)).update(payload).digest("base64url");
  expect(verifyAchievementUnsubscribeToken(`${payload}.${signature}`)).toBe("user-a");
});

it("requires a full authentication tag for unsubscribe tokens", () => {
  const token = createAchievementUnsubscribeToken("user-a");
  const value = Buffer.from(token.slice(3), "base64url");
  expect(verifyAchievementUnsubscribeToken(token)).toBe("user-a");
  expect(createDecipheriv).toHaveBeenCalledWith(
    "aes-256-gcm",
    expect.any(Buffer),
    value.subarray(0, 12),
    { authTagLength: 16 },
  );
  const truncatedTag = Buffer.concat([value.subarray(0, 16), value.subarray(28)]);
  expect(verifyAchievementUnsubscribeToken(`v2.${truncatedTag.toString("base64url")}`)).toBeNull();
});

it("rejects tokens shorter than the IV and tag before decryption", () => {
  const token = createAchievementUnsubscribeToken("user-a");
  const value = Buffer.from(token.slice(3), "base64url");
  vi.mocked(createDecipheriv).mockClear();
  expect(
    verifyAchievementUnsubscribeToken(`v2.${value.subarray(0, 16).toString("base64url")}`),
  ).toBeNull();
  expect(createDecipheriv).not.toHaveBeenCalled();
});
