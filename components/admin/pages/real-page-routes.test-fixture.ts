import Audit from "@/app/(regional)/app/admin/audit/page";
import Sending from "@/app/(regional)/app/admin/email/sending-today/page";
import Settings from "@/app/(regional)/app/admin/email/settings/page";
import Checks from "@/app/(regional)/app/admin/operations/checks/page";
import Sources from "@/app/(regional)/app/admin/operations/data-sources/page";
import Notifications from "@/app/(regional)/app/admin/operations/notifications/page";
import Tasks from "@/app/(regional)/app/admin/operations/tasks/page";
import Worker from "@/app/(regional)/app/admin/operations/worker/page";
import Status from "@/app/(regional)/app/admin/overview/status/page";
import Features from "@/app/(regional)/app/admin/settings/features/page";
import Accounts from "@/app/(regional)/app/admin/users/accounts/page";
export const realRoutes = {
  Audit,
  Features,
  Settings,
  "Sending today": Sending,
  Checks,
  "Data sources": Sources,
  Notifications,
  Tasks,
  Worker,
  Status,
  Accounts,
};
