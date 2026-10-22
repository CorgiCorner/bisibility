import { z } from "zod";

export function isAnnouncementHref(value: string) {
  if (!value) return true;
  if (/[\s\\]/u.test(value)) return false;
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function announcementContentSchema(messages = { required: "required", link: "link" }) {
  return z
    .object({
      title: z.string().trim().min(1, messages.required).max(120, messages.required),
      message: z.string().trim().min(1, messages.required).max(2000, messages.required),
      href: z.string().trim().max(2048, messages.link).refine(isAnnouncementHref, messages.link),
      linkLabel: z.string().trim().max(80, messages.link),
    })
    .strict();
}

export const announcementIdentitySchema = z
  .object({
    id: z.uuid(),
    revision: z.uuid(),
  })
  .strict();

export const storedAnnouncementSchema = announcementContentSchema()
  .extend({
    enabled: z.boolean(),
    revision: z.uuid(),
    schemaVersion: z.literal(1),
  })
  .strict();

export type AnnouncementContent = z.infer<ReturnType<typeof announcementContentSchema>>;
export type AnnouncementIdentity = z.infer<typeof announcementIdentitySchema>;
export type InstanceAnnouncement = AnnouncementContent &
  AnnouncementIdentity & { enabled: boolean };
export type AnnouncementResult =
  | { status: "saved"; announcement: InstanceAnnouncement }
  | { status: "deleted"; id: string }
  | {
      status:
        | "two_factor_required"
        | "forbidden"
        | "invalid"
        | "not_found"
        | "conflict"
        | "unavailable";
    };
