"use server";

import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import {
  type AnnouncementResult,
  announcementContentSchema,
  announcementIdentitySchema,
} from "@/lib/instance-announcements/schema";
import {
  changeInstanceAnnouncement,
  createInstanceAnnouncement,
} from "@/lib/instance-announcements/store";
import { z } from "zod";

const saveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), content: announcementContentSchema() }).strict(),
  z
    .object({
      kind: z.literal("update"),
      identity: announcementIdentitySchema,
      content: announcementContentSchema(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("toggle"),
      identity: announcementIdentitySchema,
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal("delete"), identity: announcementIdentitySchema }).strict(),
]);

export type AnnouncementMutation = z.infer<typeof saveSchema>;

export async function mutateInstanceAnnouncement(input: unknown): Promise<AnnouncementResult> {
  const session = await getInstanceAdminSession();
  if (!session) return { status: "forbidden" };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const mutation = parsed.data;
  try {
    const result =
      mutation.kind === "create"
        ? await createInstanceAnnouncement(session.user.id, mutation.content)
        : await changeInstanceAnnouncement(
            session.user.id,
            mutation.identity,
            mutation.kind === "update"
              ? { content: mutation.content }
              : mutation.kind === "toggle"
                ? { enabled: mutation.enabled }
                : { delete: true },
          );
    return result;
  } catch {
    return { status: "unavailable" };
  }
}
