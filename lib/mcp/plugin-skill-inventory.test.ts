import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = "plugins/bisibility";
const slugs = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(root, "skills", entry.name, "SKILL.md")),
  )
  .map((entry) => entry.name);
const documents = ["README.md", "evals.md", "skills/seo-coach/references/workflow.md"].map(
  (path) => ({ path, text: readFileSync(join(root, path), "utf8") }),
);

describe("plugin skill inventory", () => {
  it.each(slugs)("documents and routes shipped skill %s", (slug) => {
    for (const { path, text } of documents) {
      if (path === "evals.md") {
        const triggers = [
          `Should trigger \`bisibility:${slug}\``,
          `Should trigger only \`bisibility:${slug}\``,
        ];
        expect(
          triggers.some((trigger) => text.includes(trigger)),
          `Missing trigger eval: ${slug}`,
        ).toBe(true);
      } else {
        const commands = [...text.matchAll(/\/bisibility:([a-z0-9-]+)/g)].map((match) => match[1]);
        expect(commands, `Missing /bisibility:${slug} in ${path}`).toContain(slug);
      }
    }
  });

  it.each(documents)("references only shipped skills in $path", ({ path, text }) => {
    // Evals also use unprefixed command names for positive and cross-routing cases.
    const referenced = [...text.matchAll(/\bbisibility:([a-z0-9-]+)/g)].map((match) => match[1]);
    for (const slug of new Set(referenced)) {
      expect(slugs, `Unknown /bisibility:${slug} in ${path}`).toContain(slug);
    }
  });
});
