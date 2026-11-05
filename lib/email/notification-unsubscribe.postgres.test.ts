import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { afterAll, expect, it, vi } from "vitest";

vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.alloc(32, 7)],
}));
vi.mock("@/lib/demo/config", () => ({
  readDemoConfig: () => ({ kind: "disabled" }),
  readOnlyDemoConfig: () => null,
}));

import {
  createNotificationUnsubscribeToken,
  unsubscribeNotificationEmail,
} from "./notification-unsubscribe";

const owners: string[] = [];

async function scope() {
  const owner = await prisma.user.create({
    data: {
      publicId: makePublicId("usr"),
      name: "Unsubscribe fixture",
      email: `${randomUUID()}@example.com`,
    },
  });
  owners.push(owner.id);
  const project = await prisma.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId: owner.id,
      name: "Unsubscribe fixture",
      domain: "example.com",
    },
  });
  return { userId: owner.id, projectId: project.id };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: owners } } });
  await prisma.$disconnect();
});

it("opts out only the alert email stream of a live scope", async () => {
  const ids = await scope();
  const token = createNotificationUnsubscribeToken({ ...ids, stream: "alert" });
  expect(await unsubscribeNotificationEmail(token)).toBe(true);
  expect(await unsubscribeNotificationEmail(token)).toBe(true);
  const row = await prisma.notificationPreference.findUniqueOrThrow({
    where: { userId_projectId: ids },
  });
  expect(row).toMatchObject({
    alertEmail: false,
    reportEmail: true,
    alertPush: true,
  });
});

it.each(["project", "user"] as const)(
  "returns idempotent success when the bound %s was deleted",
  async (deleted) => {
    const ids = await scope();
    const token = createNotificationUnsubscribeToken({
      ...ids,
      stream: "report",
    });
    if (deleted === "project") await prisma.project.delete({ where: { id: ids.projectId } });
    else await prisma.user.delete({ where: { id: ids.userId } });
    expect(await unsubscribeNotificationEmail(token)).toBe(true);
    expect(await unsubscribeNotificationEmail(token)).toBe(true);
    expect(await prisma.notificationPreference.count({ where: ids })).toBe(0);
  },
);
