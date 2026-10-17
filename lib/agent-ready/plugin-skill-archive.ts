import { createHash } from "node:crypto";
import { type SkillArchive, taskSkillSkillMd } from "./archive";
import frozenFiles from "./plugin-skill-files.generated.json";
import { skillCatalog } from "./skill-catalog";
import { taskSkills } from "./skills";
import { buildZip } from "./zip";

const cache = new Map<string, SkillArchive>();

function skillFiles(slug: string) {
  const skill = skillCatalog.find((entry) => entry.slug === slug && entry.status !== "coming-soon");
  if (!skill) return null;
  const task = taskSkills.find((entry) => entry.slug === skill.slug);
  return skill.channels.plugin
    ? Object.hasOwn(frozenFiles, skill.slug)
      ? frozenFiles[skill.slug as keyof typeof frozenFiles]
      : null
    : task
      ? [{ path: "SKILL.md", content: taskSkillSkillMd(task) }, ...(task.references ?? [])]
      : null;
}

/** Exact trusted-file lookup. Relative links keep working on the nested source route. */
export function getSkillSourceFile(slug: string, file: string): string | null {
  return skillFiles(slug)?.find((entry) => entry.path === file)?.content ?? null;
}

export function getSkillZip(slug: string): SkillArchive | null {
  const files = skillFiles(slug);
  if (!files) return null;
  const cached = cache.get(slug);
  if (cached) return cached;
  const bytes = buildZip(files.map((file) => ({ ...file, path: `${slug}/${file.path}` })));
  const archive = { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  cache.set(slug, archive);
  return archive;
}

/** Package-level instructions index; every source link is available on this same instance. */
export function getWorkflowSourceIndex(): string {
  return [
    "# Bisibility skills",
    "",
    "Choose a workflow matching your goal, then read its complete instructions and linked references before acting.",
    "Use your agent's supported connection and authentication flow for the instance you intend to use. Connecting supplies tools; it does not install workflow instructions.",
    "MCP workflows need the tools and scopes declared by the connected instance. REST workflows require an API-capable client and a securely configured scoped key. Never paste secrets into chat.",
    "Do not make changes or launch paid work without the workflow's required explicit approval. Missing permissions or tools are a blocker, not permission to invent a workaround.",
    "",
    ...skillCatalog
      .filter((entry) => entry.status !== "coming-soon")
      .map(
        (entry) =>
          `- [${entry.title}](./${entry.slug}/SKILL.md) (${entry.channels.plugin ? "MCP" : "REST API"})`,
      ),
    "",
  ].join("\n");
}
