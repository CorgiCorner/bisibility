import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import {
  type AnnouncementContent,
  type AnnouncementIdentity,
  type AnnouncementResult,
  announcementIdentitySchema,
  type InstanceAnnouncement,
  storedAnnouncementSchema,
} from "./schema";

const PREFIX = "instance-announcement:";

function decode(key: string, value: string): InstanceAnnouncement | null {
  const id = key.slice(PREFIX.length);
  if (!key.startsWith(PREFIX) || !announcementIdentitySchema.shape.id.safeParse(id).success)
    return null;
  try {
    const parsed = storedAnnouncementSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return null;
    const { schemaVersion: _version, ...announcement } = parsed.data;
    return { id, ...announcement };
  } catch {
    return null;
  }
}

function encode({ id: _id, ...announcement }: InstanceAnnouncement) {
  return JSON.stringify({ ...announcement, schemaVersion: 1 });
}

function auditView(announcement: InstanceAnnouncement) {
  const { title, message, href, linkLabel } = announcement;
  return {
    announcementId: announcement.id,
    contentHash: createHash("sha256")
      .update(JSON.stringify({ title, message, href, linkLabel }))
      .digest("hex"),
    enabled: announcement.enabled,
  };
}

export async function listInstanceAnnouncements() {
  const rows = await prisma.instanceSetting.findMany({
    where: { key: { startsWith: PREFIX } },
    orderBy: { key: "asc" },
    select: { key: true, value: true },
  });
  return rows.flatMap(({ key, value }) => {
    const announcement = decode(key, value);
    return announcement ? [announcement] : [];
  });
}

/** Request-time read: open clients receive changes when they refresh the page. */
export async function listEnabledInstanceAnnouncements() {
  return (await listInstanceAnnouncements()).filter((announcement) => announcement.enabled);
}

export async function createInstanceAnnouncement(
  actorId: string,
  content: AnnouncementContent,
): Promise<AnnouncementResult> {
  const announcement = { ...content, id: randomUUID(), revision: randomUUID(), enabled: false };
  await prisma.$transaction(async (tx) => {
    await tx.instanceSetting.create({
      data: { key: `${PREFIX}${announcement.id}`, value: encode(announcement) },
    });
    await writeAudit(
      {
        action: "instance_admin.announcement_created",
        actorId,
        after: auditView(announcement),
        targetId: `${PREFIX}${announcement.id}`,
        targetType: "instance_ops",
      },
      tx,
    );
  });
  return { status: "saved", announcement };
}

export async function changeInstanceAnnouncement(
  actorId: string,
  identity: AnnouncementIdentity,
  change: { content: AnnouncementContent } | { enabled: boolean } | { delete: true },
): Promise<AnnouncementResult> {
  return prisma.$transaction(async (tx): Promise<AnnouncementResult> => {
    const key = `${PREFIX}${identity.id}`;
    const row = await tx.instanceSetting.findUnique({ where: { key } });
    const previous = row ? decode(key, row.value) : null;
    if (!row || !previous) return { status: "not_found" };
    if (previous.revision !== identity.revision) return { status: "conflict" };
    const where = { key, value: row.value };
    const next = {
      ...previous,
      ...("content" in change ? change.content : {}),
      ...("enabled" in change ? { enabled: change.enabled } : {}),
      revision: randomUUID(),
    };
    const deleted = "delete" in change;
    // Compare the complete stored value so concurrent edits cannot silently overwrite each other.
    const result = deleted
      ? await tx.instanceSetting.deleteMany({ where })
      : await tx.instanceSetting.updateMany({ where, data: { value: encode(next) } });
    if (result.count !== 1) return { status: "conflict" };
    const action = deleted
      ? "instance_admin.announcement_deleted"
      : "enabled" in change
        ? "instance_admin.announcement_toggled"
        : "instance_admin.announcement_updated";
    await writeAudit(
      {
        action,
        actorId,
        before: auditView(previous),
        ...(deleted ? {} : { after: auditView(next) }),
        targetId: key,
        targetType: "instance_ops",
      },
      tx,
    );
    return deleted
      ? { status: "deleted", id: identity.id }
      : { status: "saved", announcement: next };
  });
}
