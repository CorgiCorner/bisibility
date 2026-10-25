export type SkillCategory =
  | "start-here"
  | "audit"
  | "research"
  | "ai-visibility"
  | "local"
  | "links"
  | "monitoring"
  | "setup-admin";

export type SkillStatus = "available" | "beta" | "coming-soon";

export const skillGroups = ["seo", "ai-visibility", "setup-admin"] as const;
export type SkillGroup = (typeof skillGroups)[number];

export type SkillCatalogEntry = Readonly<{
  slug: string;
  title: string;
  category: SkillCategory;
  status: SkillStatus;
  channels: Readonly<{ plugin: boolean; archive: boolean }>;
}>;

export function skillGroup(skill: SkillCatalogEntry): SkillGroup {
  if (skill.category === "ai-visibility" || skill.slug === "ai-visibility-audit") {
    return "ai-visibility";
  }
  if (
    skill.category === "setup-admin" ||
    (skill.category === "start-here" && skill.slug !== "seo-coach")
  ) {
    return "setup-admin";
  }
  return "seo";
}

const catalogEntries = [
  {
    slug: "project-setup",
    title: "Project setup",
    category: "start-here",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "seo-coach",
    title: "SEO coach",
    category: "start-here",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "domain-onboarding",
    title: "Domain onboarding",
    category: "start-here",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "bisibility",
    title: "Bisibility skill router",
    category: "start-here",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "seo-audit",
    title: "SEO audit",
    category: "audit",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "ai-visibility-audit",
    title: "Brand Visibility audit",
    category: "audit",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "keyword-opportunity-research",
    title: "Keyword opportunity research",
    category: "research",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "keyword-import",
    title: "Keyword import",
    category: "setup-admin",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "rank-tracking-report",
    title: "Rank tracking report",
    category: "monitoring",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "weekly-report",
    title: "Weekly report",
    category: "monitoring",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "alert-triage",
    title: "Alert triage",
    category: "monitoring",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "backlink-profile-analysis",
    title: "Backlink profile analysis",
    category: "links",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "provider-setup",
    title: "Provider setup",
    category: "setup-admin",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "team-api-governance",
    title: "Team API governance",
    category: "setup-admin",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "self-host-health",
    title: "Self-host health",
    category: "setup-admin",
    status: "available",
    channels: { plugin: true, archive: true },
  },
  {
    slug: "keyword-clustering",
    title: "Keyword clustering",
    category: "research",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "competitor-analysis",
    title: "Competitor analysis",
    category: "research",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "competitive-landscape",
    title: "Competitive landscape",
    category: "research",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "ai-prompt-research",
    title: "AI prompt research",
    category: "ai-visibility",
    status: "available",
    channels: { plugin: true, archive: false },
  },
  {
    slug: "local-seo",
    title: "Local SEO",
    category: "local",
    status: "available",
    channels: { plugin: true, archive: false },
  },
] as const satisfies readonly SkillCatalogEntry[];

// Retain planned/beta states in consumer types even when every current skill is available.
export const skillCatalog: readonly (Omit<(typeof catalogEntries)[number], "status"> & {
  status: SkillStatus;
})[] = catalogEntries;

export function skillArchivePath(entry: SkillCatalogEntry): string | null {
  return entry.channels.archive ? `/.well-known/agent-skills/${entry.slug}.tar.gz` : null;
}
