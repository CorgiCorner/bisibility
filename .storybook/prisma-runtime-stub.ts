// Storybook replaces server-only Prisma modules with this browser-safe boundary.
export const Prisma = {};
export const prisma = {};
export const ProjectMarketStatus = {
  active: "active",
  paused: "paused",
  removed: "removed",
} as const;
