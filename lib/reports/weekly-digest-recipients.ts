import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isDemoViewer } from "@/lib/demo/config";
import {
  notificationPreferenceSelect,
  resolveNotificationPreferences,
} from "@/lib/notifications/preference-defaults";

export const digestUserSelect = {
  id: true,
  publicId: true,
  email: true,
  emailVerified: true,
  notificationPreferences: { select: notificationPreferenceSelect },
} as const;

type Candidate = {
  id: string;
  publicId: string;
  emailVerified: boolean;
  notificationPreferences: Array<{ reportEmail: boolean }>;
};
export function digestCandidates(project: {
  owner: Candidate;
  members: Array<{ user: Candidate }>;
}) {
  return [
    ...new Map(
      [project.owner, ...project.members.map(({ user }) => user)]
        .filter(
          (user) =>
            !isDemoViewer(user.publicId) &&
            user.emailVerified &&
            (user.notificationPreferences[0]?.reportEmail ??
              resolveNotificationPreferences(null).reportEmail),
        )
        .map((user) => [user.id, user]),
    ).keys(),
  ];
}

/** Fresh authority and address read at the transport boundary. */
export async function digestRecipient(userId: string, projectId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      OR: [
        { projects: { some: { id: projectId, writeMode: { not: "migrated" } } } },
        { memberships: { some: { projectId, project: { writeMode: { not: "migrated" } } } } },
      ],
    },
    select: {
      ...digestUserSelect,
      notificationPreferences: {
        select: notificationPreferenceSelect,
        where: { projectId },
        take: 1,
      },
    },
  });
  if (
    !user?.emailVerified ||
    isDemoViewer(user.publicId) ||
    !resolveNotificationPreferences(user.notificationPreferences[0] ?? null).reportEmail
  )
    return null;
  return user.email;
}
