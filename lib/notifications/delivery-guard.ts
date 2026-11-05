import "server-only";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import {
  notificationPreferenceSelect,
  resolveNotificationPreferences,
} from "./preference-defaults";

type DeliveryDb = Pick<
  Prisma.TransactionClient,
  "project" | "notificationPreference" | "$queryRaw"
>;
export function guardedNotificationType(type: NotificationType): boolean {
  switch (type) {
    case "provider_incident":
    case "manual_run_summary":
    case "scheduled_window_summary":
      return true;
    case "alert_fired":
    case "check_complete":
    case "check_failed":
    case "invite":
    case "member_joined":
    case "import_done":
    case "import_failed":
    case "system":
      return false;
    default: {
      const unexpected: never = type;
      throw new Error(`Unhandled notification type: ${unexpected}`);
    }
  }
}

export function notificationRequiresProject(type: NotificationType): boolean {
  switch (type) {
    case "alert_fired":
    case "check_complete":
    case "check_failed":
    case "import_done":
    case "import_failed":
    case "provider_incident":
    case "manual_run_summary":
    case "scheduled_window_summary":
      return true;
    case "invite":
    case "member_joined":
    case "system":
      return false;
    default: {
      const unexpected: never = type;
      throw new Error(`Unhandled notification type: ${unexpected}`);
    }
  }
}

/** New types fail closed on project, live membership and their independent preference. */
export async function notificationDeliveryAllowed(
  db: DeliveryDb,
  userId: string,
  projectId: string | null,
  type: NotificationType,
): Promise<boolean> {
  const guarded = guardedNotificationType(type);
  if (!projectId) return !notificationRequiresProject(type);
  if (type === "provider_incident" && !recoverySwitches().incidentBell) return false;
  if (guarded) await db.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR SHARE`;
  if (
    guarded &&
    !(await db.project.findFirst({
      where: {
        id: projectId,
        writeMode: { not: "migrated" },
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    }))
  )
    return false;
  const field = legacyPreference(type);
  if (!guarded && !field) return true;
  const stored = await db.notificationPreference.findUnique({
    where: { userId_projectId: { userId, projectId: projectId } },
    select: notificationPreferenceSelect,
  });
  const preference = resolveNotificationPreferences(stored);
  switch (type) {
    case "provider_incident":
      return preference.providerIncidentInApp;
    case "manual_run_summary":
    case "scheduled_window_summary":
      return preference.checkNotificationSetting !== "none";
    default:
      return field ? preference[field] : true;
  }
}

function legacyPreference(type: NotificationType) {
  if (type === "alert_fired") return "alertInApp";
  if (type === "check_complete" || type === "check_failed") return "checkInApp";
  if (type === "invite" || type === "member_joined") return "inviteInApp";
  if (type === "import_done" || type === "import_failed") return "importInApp";
  return null;
}
