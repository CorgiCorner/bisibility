import type messages from "@/messages/core/en/instance-admin.json";

type AdminMessages = typeof messages.instanceAdmin;
/** Shared URL contract; deployment-only routes are supplied by the navigation extension. */
export type AdminRoute = {
  tab: string;
  tabLabel?: string;
  viewLabel?: string;
  question?: string;
  view: string;
  href: string;
  tabKey: `navigation.${keyof AdminMessages["navigation"]}`;
  viewKey:
    | `shell.${Exclude<keyof AdminMessages["shell"], "viewNavigation" | "refreshed">}`
    | `navigation.${keyof AdminMessages["navigation"]}`;
  questionKey: `pages.questions.${keyof AdminMessages["pages"]["questions"]}`;
};
export const ossAdminRoutes = (
  [
    ["Overview", "Status", "overview/status", "overview", "status"],
    ["Operations", "Worker", "operations/worker", "operations", "worker"],
    ["Operations", "Checks", "operations/checks", "operations", "checks"],
    ["Operations", "Data sources", "operations/data-sources", "operations", "dataSources"],
    ["Operations", "Tasks", "operations/tasks", "operations", "tasks"],
    ["Operations", "Notifications", "operations/notifications", "operations", "notifications"],
    ["Users", "Accounts", "users/accounts", "users", "accounts"],
    ["Email", "Sending today", "email/sending-today", "email", "sendingToday"],
    ["Email", "Settings", "email/settings", "email", "settings"],
    ["Audit", "Audit", "audit", "audit", "audit"],
  ] as const
).map<AdminRoute>(([tab, view, path, tabKey, viewKey]) => ({
  tab,
  view,
  href: `/app/admin/${path}`,
  tabKey: `navigation.${tabKey}`,
  viewKey: viewKey === "audit" ? "navigation.audit" : `shell.${viewKey}`,
  questionKey: `pages.questions.${viewKey}`,
}));
export const adminTabOrder = [
  "Overview",
  "Operations",
  "Users",
  "Revenue",
  "Usage & costs",
  "Email",
  "Announcements",
  "Audit",
  "Settings",
];
export function ossAdminRoute(view: string): AdminRoute {
  const route = ossAdminRoutes.find((item) => item.view === view);
  if (!route) throw new Error("Unknown administration page.");
  return route;
}
