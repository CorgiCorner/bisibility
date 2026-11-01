import { createDecipheriv } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, createDecipheriv: vi.fn(crypto.createDecipheriv) };
});

const m = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => ({ kind: "disabled" }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { notificationPreference: { upsert: m.upsert } } }));

import {
  createNotificationUnsubscribeToken,
  unsubscribeNotificationEmail,
  verifyNotificationUnsubscribeToken,
} from "./notification-unsubscribe";

beforeEach(() => vi.clearAllMocks());
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
