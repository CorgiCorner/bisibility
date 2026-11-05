import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillCatalog } from "../../lib/agent-ready/skill-catalog.ts";
import {
  skillPackProblems,
  skillPackSummary,
  skillReferenceForm,
  skillReferenceProblems,
} from "../../lib/agent-ready/skill-packs.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const output = path.join(root, "lib/agent-ready/plugin-skill-files.generated.json");
function filesAt(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
    .flatMap((entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Skill symlinks are not distributable: ${relative}`);
      if (entry.isDirectory()) {
        if (!["references", "scripts"].includes(entry.name) && !prefix) throw new Error(`Unexpected skill directory: ${relative}`);
        return filesAt(path.join(directory, entry.name), `${relative}/`);
      }
      if (!entry.isFile() || !(relative === "SKILL.md" || /^(references|scripts)\/[a-zA-Z0-9_./-]+\.(md|json|mjs|mts)$/.test(relative))) {
        throw new Error(`Unexpected skill file: ${relative}`);
      }
      return [{ path: relative, content: readFileSync(path.join(directory, entry.name), "utf8") }];
    });
}
const license = { path: "LICENSE", content: readFileSync(path.join(root, "plugins/bisibility/LICENSE"), "utf8") };
const entries = skillCatalog.filter((skill) => skill.channels.plugin);
const sources = entries.map((skill) => ({
  slug: skill.slug,
  pack: skill.pack,
  requires: skill.requires,
  files: filesAt(path.join(root, "plugins/bisibility/skills", skill.slug)),
}));
const problems = [
  ...skillReferenceProblems(sources, skillCatalog),
  ...skillPackProblems(skillCatalog),
];
if (problems.length) throw new Error(`Skill reference check failed:\n${problems.join("\n")}`);
// References are prose naming the skill, so the bundle carries the plugin files byte for byte.
const bundle = {
  version: 2,
  referenceForm: skillReferenceForm,
  packs: skillPackSummary(entries),
  skills: Object.fromEntries(entries.map((skill, index) => [skill.slug, {
    pack: skill.pack,
    requires: skill.requires,
    files: [license, ...sources[index].files],
  }])),
};
const rendered = execFileSync(
  path.join(root, "node_modules/.bin/biome"),
  ["format", `--stdin-file-path=${output}`],
  { input: `${JSON.stringify(bundle, null, 2)}\n`, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== rendered) throw new Error("Frozen plugin skill files are stale; regenerate with scripts/generate/plugin-skill-files.mjs");
} else writeFileSync(output, rendered);
