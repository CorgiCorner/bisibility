import type { NotificationType } from "@/lib/generated/prisma/client";

export function notificationTypePresentation(type: NotificationType): {
  href: string;
  label: string;
} {
  switch (type) {
    case "alert_fired":
      return { href: "alerts", label: "Alert" };
    case "check_complete":
      return { href: "rank-tracker", label: "Rank check" };
    case "check_failed":
      return { href: "providers", label: "Rank check failed" };
    case "import_done":
      return { href: "providers", label: "Import complete" };
    case "import_failed":
      return { href: "providers", label: "Import failed" };
    case "invite":
      return { href: "settings", label: "Team invite" };
    case "manual_run_summary":
      return { href: "rank-tracker", label: "Manual check" };
    case "member_joined":
      return { href: "settings", label: "Team update" };
    case "provider_incident":
      return { href: "rank-tracker", label: "Provider incident" };
    case "scheduled_window_summary":
      return { href: "rank-tracker", label: "Scheduled checks" };
    case "system":
      return { href: "overview", label: "System" };
    default: {
      const unexpected: never = type;
      throw new Error(`Unhandled notification type: ${unexpected}`);
    }
  }
}
