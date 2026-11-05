import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { referencedSkills } from "@/lib/agent-ready/skill-packs";
import { describe, expect, it } from "vitest";

const root = "plugins/bisibility";
const workflowPath = "skills/seo-coach/references/workflow.md";
const slugs = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(root, "skills", entry.name, "SKILL.md")),
  )
  .map((entry) => entry.name);
const documents = ["README.md", "evals.md", workflowPath].map((path) => ({
  path,
  text: readFileSync(join(root, path), "utf8"),
}));
type SkillDocument = (typeof documents)[number];

function assertSkillDocumented(slug: string, { path, text }: SkillDocument) {
  if (path === "evals.md") {
    const triggers = [
      `Should trigger \`bisibility:${slug}\``,
      `Should trigger only \`bisibility:${slug}\``,
    ];
    expect(
      triggers.some((trigger) => text.includes(trigger)),
      `Missing trigger eval: ${slug}`,
    ).toBe(true);
  } else if (path === workflowPath) {
    const routes = text
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .flatMap(referencedSkills);
    expect(routes, `Missing route for ${slug} in ${path}`).toContain(slug);
  } else {
    const commands = [...text.matchAll(/\/bisibility:([a-z0-9-]+)/g)].map((match) => match[1]);
    expect(commands, `Missing /bisibility:${slug} in ${path}`).toContain(slug);
  }
}

function assertOnlyShippedSkills({ path, text }: SkillDocument) {
  // README and evals retain plugin commands; workflow references use neutral skill names.
  const referenced = [...text.matchAll(/\bbisibility:([a-z0-9-]+)/g)].map((match) => match[1]);
  for (const slug of new Set([...referenced, ...referencedSkills(text)])) {
    expect(slugs, `Unknown skill ${slug} in ${path}`).toContain(slug);
  }
}

const workflow = documents.find((document) => document.path === workflowPath);
if (!workflow) throw new Error("Missing workflow document");

describe("plugin skill inventory", () => {
  it.each(slugs)("documents and routes shipped skill %s", (slug) => {
    for (const document of documents) assertSkillDocumented(slug, document);
  });

  it.each(documents)("references only shipped skills in $path", assertOnlyShippedSkills);

  it.each(slugs)("rejects a missing routing row for shipped skill %s", (slug) => {
    const text = workflow.text
      .split("\n")
      .filter((line) => !line.startsWith("|") || !referencedSkills(line).includes(slug))
      .join("\n");
    expect(() => assertSkillDocumented(slug, { ...workflow, text })).toThrow(
      `Missing route for ${slug} in ${workflowPath}`,
    );
  });

  it.each(documents)("rejects missing skill documentation in $path", (document) => {
    const slug = "provider-setup";
    const text = document.text.replaceAll(slug, "unshipped-skill");
    expect(() => assertSkillDocumented(slug, { ...document, text })).toThrow();
  });

  it.each(documents)("rejects unknown skill references in $path", (document) => {
    const reference =
      document.path === workflowPath ? "`unshipped-skill` skill" : "/bisibility:unshipped-skill";
    const text = `${document.text}\n${reference}\n`;
    expect(() => assertOnlyShippedSkills({ ...document, text })).toThrow(
      `Unknown skill unshipped-skill in ${document.path}`,
    );
  });
});
