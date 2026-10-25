import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatedArchivePluginSlugs } from "../../lib/agent-ready/archive-plugin-skills.ts";
import { skill as bisibility } from "../../lib/agent-ready/skills/bisibility.ts";
import { skill as domainOnboarding } from "../../lib/agent-ready/skills/domain-onboarding.ts";
import { skill as keywordImport } from "../../lib/agent-ready/skills/keyword-import.ts";
import { skill as providerSetup } from "../../lib/agent-ready/skills/provider-setup.ts";
import { skill as selfHostHealth } from "../../lib/agent-ready/skills/self-host-health.ts";
import { skill as teamApiGovernance } from "../../lib/agent-ready/skills/team-api-governance.ts";
import { skill as weeklyReport } from "../../lib/agent-ready/skills/weekly-report.ts";

const taskSkills = [
  bisibility,
  domainOnboarding,
  keywordImport,
  providerSetup,
  selfHostHealth,
  teamApiGovernance,
  weeklyReport,
];

const root = fileURLToPath(new URL("../..", import.meta.url));
const check = process.argv.includes("--check");

function withTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function pluginSkillMarkdown(skill) {
  if (skill.description.includes("\n") || /[:#]/.test(skill.description)) {
    throw new Error(`Plugin description must be one plain line: ${skill.slug}`);
  }
  if (!skill.description.includes("Use when ") || !skill.description.includes("Do not use for ")) {
    throw new Error(`Plugin description must say when to use and not use ${skill.slug}`);
  }
  const links = (skill.references ?? [])
    .map((reference) => `Read [${reference.path}](${reference.path}) for the endpoint contract.`)
    .join("\n");
  const body = links ? `${skill.body}\n\n${links}` : skill.body;
  return withTrailingNewline(
    `---\nname: ${skill.slug}\ndescription: ${skill.description}\n---\n\n${body}`,
  );
}

function renderedFiles(skill) {
  return [
    { path: "SKILL.md", content: pluginSkillMarkdown(skill) },
    ...(skill.references ?? []).map((reference) => ({
      path: reference.path,
      content: withTrailingNewline(reference.content),
    })),
  ];
}

for (const slug of generatedArchivePluginSlugs) {
  const skill = taskSkills.find((entry) => entry.slug === slug);
  if (!skill) throw new Error(`Missing task skill for generated plugin directory: ${slug}`);
  const directory = path.join(root, "plugins/bisibility/skills", slug);
  for (const file of renderedFiles(skill)) {
    const target = path.join(directory, file.path);
    if (check) {
      if (readFileSync(target, "utf8") !== file.content) {
        throw new Error(
          `Generated plugin skill is stale: ${slug}/${file.path}. Regenerate with scripts/generate/archive-plugin-skills.mjs`,
        );
      }
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}
