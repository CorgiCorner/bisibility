import type { Prisma } from "@/lib/generated/prisma/client";

export type NotificationReadState = "all" | "read" | "unread";

export function notificationFeedWhere(
  userId: string,
  activeProjectId: string | null,
  readState: NotificationReadState = "all",
): Prisma.NotificationWhereInput {
  const projectScope: Prisma.NotificationWhereInput = activeProjectId
    ? { OR: [{ projectId: null }, { projectId: activeProjectId }] }
    : { projectId: null };
  let readScope: Prisma.NotificationWhereInput = {};
  if (readState === "unread") readScope = { readAt: null };
  else if (readState === "read") readScope = { readAt: { not: null } };

  return {
    ...projectScope,
    ...readScope,
    userId,
  };
}
