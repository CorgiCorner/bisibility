import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillCatalog } from "../../lib/agent-ready/skill-catalog.ts";

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
const skills = Object.fromEntries(skillCatalog.filter((skill) => skill.channels.plugin)
  .map((skill) => [skill.slug, [license, ...filesAt(path.join(root, "plugins/bisibility/skills", skill.slug))]]));
const rendered = `${JSON.stringify(skills, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== rendered) throw new Error("Frozen plugin skill files are stale; regenerate with scripts/generate/plugin-skill-files.mjs");
} else writeFileSync(output, rendered);
