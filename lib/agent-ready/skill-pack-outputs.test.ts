import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import { taskSkillSkillMd } from "./archive";
import { createAgentSkillsIndex } from "./documents";
import { getSkillSourceFile, getWorkflowSourceIndex } from "./plugin-skill-archive";
import { skillCatalog } from "./skill-catalog";
import { taskSkills } from "./skills";

vi.mock("@/lib/auth/auth", () => ({
  AUTH_URL: "https://auth.example.com",
  MCP_RESOURCE_URL: "https://app.example.com/api/mcp",
}));

const pluginRoot = path.join(process.cwd(), "plugins/bisibility/skills");
const available = skillCatalog.filter((entry) => entry.status !== "coming-soon");

function frontmatterMetadata(markdown: string): Record<string, string> | undefined {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "";
  return parseYaml(frontmatter)?.metadata;
}

function packMetadata(entry: (typeof skillCatalog)[number]) {
  return {
    ...(entry.pack ? { "bisibility.pack": entry.pack } : {}),
    ...(entry.requires.length ? { "bisibility.requires": entry.requires.join(" ") } : {}),
  };
}

describe("pack metadata wherever skills are listed", () => {
  it.each(available)(
    "publishes pack and requirements in the $slug plugin, ZIP and source",
    (entry) => {
      const plugin = readFileSync(path.join(pluginRoot, entry.slug, "SKILL.md"), "utf8");
      const served = getSkillSourceFile(entry.slug, "SKILL.md") ?? "";
      for (const markdown of [plugin, served]) {
        const metadata = frontmatterMetadata(markdown) ?? {};
        expect(metadata["bisibility.pack"], entry.slug).toBe(entry.pack ?? undefined);
        expect(metadata["bisibility.requires"]?.split(" ") ?? [], entry.slug).toEqual(
          entry.requires,
        );
      }
    },
  );

  it("publishes pack metadata in task archives and the discovery index", () => {
    const index = createAgentSkillsIndex("https://app.example.com");
    for (const task of taskSkills) {
      const entry = skillCatalog.find((candidate) => candidate.slug === task.slug);
      if (!entry) throw new Error(`Uncatalogued task skill ${task.slug}`);
      const expected = packMetadata(entry);
      const listed = index.skills.find(
        (skill) => skill.name === task.slug && skill.type === "archive",
      );
      const metadata = listed && "metadata" in listed ? listed.metadata : undefined;
      expect(metadata, task.slug).toEqual(Object.keys(expected).length ? expected : undefined);
      expect(frontmatterMetadata(taskSkillSkillMd(task)), task.slug).toMatchObject(expected);
    }
    const onboarding = taskSkills.find((task) => task.slug === "domain-onboarding");
    if (!onboarding) throw new Error("Missing domain-onboarding task skill");
    expect(taskSkillSkillMd(onboarding)).toContain(
      "use the `keyword-import` or `provider-setup` skill instead",
    );
  });

  it("lists packs and requirements in the workflow source index", () => {
    const index = getWorkflowSourceIndex();
    expect(index).toContain(
      "- [Domain onboarding](./domain-onboarding/SKILL.md) (REST API; pack `project-onboarding`; requires `keyword-import`, `provider-setup`)",
    );
    expect(index).toContain(
      "- [SEO audit](./seo-audit/SKILL.md) (MCP; requires `ai-visibility-audit`)",
    );
    expect(index).toContain("- [Provider setup](./provider-setup/SKILL.md) (REST API)\n");
  });
});
