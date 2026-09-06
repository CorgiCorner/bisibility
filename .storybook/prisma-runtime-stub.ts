// Storybook replaces server-only Prisma modules with this browser-safe boundary.
export const Prisma = {};
export const prisma = {};
export const ProjectMarketStatus = {
  active: "active",
  paused: "paused",
  removed: "removed",
} as const;

export const NotificationType = {
  alert_fired: "alert_fired",
  check_complete: "check_complete",
  check_failed: "check_failed",
  import_done: "import_done",
  import_failed: "import_failed",
  invite: "invite",
  member_joined: "member_joined",
  system: "system",
} as const;
