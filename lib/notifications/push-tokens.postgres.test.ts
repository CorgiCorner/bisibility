import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { deletePushToken, projectPushRecipients, registerPushToken } from "./push-tokens";

const users: string[] = [];

async function user() {
  const id = `push-token-user-${randomUUID()}`;
  await prisma.user.create({
    data: { email: `${randomUUID()}@example.com`, id, name: "Push", publicId: makePublicId("usr") },
  });
  users.push(id);
  return id;
}

function token() {
  return randomUUID().replaceAll("-", "").repeat(2).toUpperCase();
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("device push tokens", () => {
  const input = (value: string) => ({
    bundleId: "com.example.app",
    environment: "sandbox" as const,
    token: value,
  });

  it("registers idempotently and moves a token to the account that registers it last", async () => {
    const first = await user();
    const second = await user();
    const value = token();
    const created = await registerPushToken(first, input(value));
    const again = await registerPushToken(first, input(value));
    expect(again.id).toBe(created.id);
    expect(again.token).toBe(value.toLowerCase());
    const moved = await registerPushToken(second, input(value));
    expect(moved).toMatchObject({ id: created.id, userId: second });
    expect(moved.publicId).not.toBe(created.publicId);
    expect(await prisma.devicePushToken.count({ where: { token: value.toLowerCase() } })).toBe(1);
    expect(await deletePushToken(first, moved.publicId)).toBeNull();
  });

  it("targets project members who keep alertPush on, for the configured bundle only", async () => {
    const owner = await user();
    const member = await user();
    const optedOut = await user();
    const project = await prisma.project.create({
      data: {
        domain: `push-${randomUUID()}.example.com`,
        name: "Push fixture",
        ownerId: owner,
        publicId: makePublicId("prj"),
      },
    });
    for (const userId of [member, optedOut]) {
      await prisma.membership.create({
        data: { projectId: project.id, publicId: makePublicId("mbr"), role: "member", userId },
      });
    }
    await prisma.notificationPreference.create({
      data: { alertPush: false, projectId: project.id, userId: optedOut },
    });
    const ownerToken = token();
    await registerPushToken(owner, input(ownerToken));
    await registerPushToken(member, { ...input(token()), bundleId: "com.example.other" });
    await registerPushToken(optedOut, input(token()));
    const recipients = await projectPushRecipients(project.id, "com.example.app");
    expect(recipients).toEqual([
      { environment: "sandbox", token: ownerToken.toLowerCase(), userId: owner },
    ]);
  });

  it("preserves a token transferred after the caller's ownership read", async () => {
    const previousOwner = await user();
    const nextOwner = await user();
    const value = token();
    const original = await registerPushToken(previousOwner, input(value));
    const reads: {
      findFirst(
        ...args: Parameters<typeof prisma.devicePushToken.findFirst>
      ): Promise<Awaited<ReturnType<typeof prisma.devicePushToken.findFirst>>>;
    } = prisma.devicePushToken;
    const findFirst = reads.findFirst.bind(reads);
    const read = vi.spyOn(reads, "findFirst").mockImplementationOnce(async (args) => {
      const snapshot = await findFirst(args);
      // The new login registers the device while the old login's delete is in flight.
      await registerPushToken(nextOwner, input(value));
      return snapshot;
    });
    try {
      expect(await deletePushToken(previousOwner, original.publicId)).toBeNull();
      const transferred = await prisma.devicePushToken.findUniqueOrThrow({
        where: { token: value.toLowerCase() },
      });
      expect(transferred.userId).toBe(nextOwner);
      expect(transferred.publicId).not.toBe(original.publicId);
      expect(await deletePushToken(previousOwner, transferred.publicId)).toBeNull();
      expect(await deletePushToken(nextOwner, transferred.publicId)).toMatchObject({
        id: transferred.id,
      });
    } finally {
      read.mockRestore();
    }
  });

  it("deletes tokens with the account", async () => {
    const owner = await user();
    const value = token();
    await registerPushToken(owner, input(value));
    await prisma.user.delete({ where: { id: owner } });
    expect(await prisma.devicePushToken.count({ where: { token: value.toLowerCase() } })).toBe(0);
  });
});
