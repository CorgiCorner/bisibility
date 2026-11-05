import { createDecipheriv, randomBytes } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, createDecipheriv: vi.fn(crypto.createDecipheriv) };
});

const m = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { notificationPreference: { upsert: m.upsert } } }));

import {
  createNotificationUnsubscribeToken,
  unsubscribeNotificationEmail,
  verifyNotificationUnsubscribeToken,
} from "./notification-unsubscribe";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
function stubDemo(mode: "editable" | "legacy") {
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  if (mode === "legacy") vi.stubEnv("READ_ONLY_DEMO", "1");
  else {
    vi.stubEnv("DEMO_MODE", "editable");
    vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
  }
}
const ownerToken = () =>
  createNotificationUnsubscribeToken({
    userId: "owner-a",
    projectId: "project-a",
    stream: "report",
  });
it("honors one-click unsubscribe in the editable demo, where Owner mail ships normally", async () => {
  stubDemo("editable");
  expect(await unsubscribeNotificationEmail(ownerToken())).toBe(true);
  expect(m.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId_projectId: { userId: "owner-a", projectId: "project-a" } },
      update: { reportEmail: false },
    }),
  );
});
it("keeps refusing unsubscribe in the legacy read-only snapshot, which sends no mail", async () => {
  stubDemo("legacy");
  expect(await unsubscribeNotificationEmail(ownerToken())).toBe(false);
  expect(m.upsert).not.toHaveBeenCalled();
});
it.each(["alert", "report"] as const)(
  "opts out only the named project and %s stream",
  async (stream) => {
    const token = createNotificationUnsubscribeToken({
      userId: "user-a",
      projectId: "project-a",
      stream,
    });
    expect(token).not.toContain("user-a");
    expect(await unsubscribeNotificationEmail(token)).toBe(true);
    const field = stream === "alert" ? "alertEmail" : "reportEmail";
    expect(m.upsert).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "user-a", projectId: "project-a" } },
      create: { userId: "user-a", projectId: "project-a", [field]: false },
      update: { [field]: false },
    });
  },
);
it("rejects tampered and expired tokens", async () => {
  const token = createNotificationUnsubscribeToken(
    { userId: "user-a", projectId: "project-a", stream: "alert" },
    new Date("2020-01-01"),
  );
  expect(await unsubscribeNotificationEmail(token)).toBe(false);
  const fresh = createNotificationUnsubscribeToken({
    userId: "user-a",
    projectId: "project-a",
    stream: "alert",
  });
  const bytes = Buffer.from(fresh, "base64url");
  bytes[12] = (bytes[12] ?? 0) ^ 1;
  const tampered = bytes.toString("base64url");
  expect(await unsubscribeNotificationEmail(tampered)).toBe(false);
  expect(m.upsert).not.toHaveBeenCalled();
});

it("requires a full authentication tag for unsubscribe tokens", () => {
  const token = createNotificationUnsubscribeToken({
    userId: "user-a",
    projectId: "project-a",
    stream: "alert",
  });
  const value = Buffer.from(token, "base64url");
  expect(verifyNotificationUnsubscribeToken(token)).toBe(true);
  expect(createDecipheriv).toHaveBeenCalledWith(
    "aes-256-gcm",
    expect.any(Buffer),
    value.subarray(0, 12),
    { authTagLength: 16 },
  );
  const truncatedTag = Buffer.concat([value.subarray(0, 16), value.subarray(28)]);
  expect(verifyNotificationUnsubscribeToken(truncatedTag.toString("base64url"))).toBe(false);
});

it("rejects tokens shorter than the IV and tag before decryption", () => {
  const token = createNotificationUnsubscribeToken({
    userId: "user-a",
    projectId: "project-a",
    stream: "alert",
  });
  const value = Buffer.from(token, "base64url");
  vi.mocked(createDecipheriv).mockClear();
  expect(verifyNotificationUnsubscribeToken(value.subarray(0, 16).toString("base64url"))).toBe(
    false,
  );
  expect(createDecipheriv).not.toHaveBeenCalled();
});

it("accepts a deleted bound scope but propagates other database failures", async () => {
  const token = createNotificationUnsubscribeToken({
    userId: "user-a",
    projectId: "project-a",
    stream: "alert",
  });
  m.upsert.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
      code: "P2003",
      clientVersion: "test",
    }),
  );
  expect(await unsubscribeNotificationEmail(token)).toBe(true);
  const failure = new Error("database unavailable");
  m.upsert.mockRejectedValueOnce(failure);
  await expect(unsubscribeNotificationEmail(token)).rejects.toBe(failure);
});

it("rejects the audit token fuzz corpus while accepting the original token", () => {
  for (let i = 0; i < 500; i++) {
    expect(verifyNotificationUnsubscribeToken(randomBytes(i % 1500).toString("base64url"))).toBe(
      false,
    );
  }
  const token = createNotificationUnsubscribeToken({
    userId: "user-a",
    projectId: "project-a",
    stream: "alert",
  });
  expect(verifyNotificationUnsubscribeToken(token)).toBe(true);
  const raw = Buffer.from(token, "base64url");
  for (let i = 0; i < raw.length; i++) {
    const altered = Buffer.from(raw);
    altered[i] = (altered[i] ?? 0) ^ 1;
    expect(verifyNotificationUnsubscribeToken(altered.toString("base64url"))).toBe(false);
  }
  for (const input of [
    "",
    `${token}=`,
    `${token}\n`,
    ` ${token}`,
    "a".repeat(2001),
    ...Array.from({ length: 29 }, (_, n) => Buffer.alloc(n).toString("base64url")),
  ]) {
    expect(verifyNotificationUnsubscribeToken(input)).toBe(false);
  }
});
