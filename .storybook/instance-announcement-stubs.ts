import type { AnnouncementMutation } from "@/lib/actions/instance-announcements";
import type { AnnouncementResult } from "@/lib/instance-announcements/schema";

/** Preview transport never writes application data. */
export async function mutateInstanceAnnouncement(
  _input: AnnouncementMutation,
): Promise<AnnouncementResult> {
  return { status: "unavailable" };
}
