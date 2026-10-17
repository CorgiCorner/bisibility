import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
// eslint-disable-next-line no-restricted-imports -- Verify the install projection against its public source catalog.
import { SKILLS } from "@/components/install/install-catalog";
import { describe, expect, it } from "vitest";
import { skillArchivePath, skillCatalog } from "./skill-catalog";
import { taskSkills } from "./skills";

const pluginRoot = join(process.cwd(), "plugins/bisibility/skills");
const pluginSlugs = readdirSync(pluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(pluginRoot, entry.name, "SKILL.md")))
  .map((entry) => entry.name);

function sortedSlugs(entries: readonly { slug: string }[]) {
  return entries.map((entry) => entry.slug).sort();
}

describe("unified skill catalog", () => {
  it("has unique slugs", () => {
    expect(new Set(skillCatalog.map((entry) => entry.slug)).size, "Duplicate catalog slug").toBe(
      skillCatalog.length,
    );
  });

  it("uses kebab-case slugs", () => {
    for (const entry of skillCatalog) {
      expect(entry.slug, `Invalid kebab-case slug: ${entry.slug}`).toMatch(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      );
    }
  });

  it("matches the shipped plugin directories", () => {
    expect(
      sortedSlugs(skillCatalog.filter((entry) => entry.channels.plugin)),
      "Plugin channel mismatch",
    ).toEqual([...pluginSlugs].sort());
  });

  it("matches each plugin frontmatter name to its directory", () => {
    for (const slug of pluginSlugs) {
      const source = readFileSync(join(pluginRoot, slug, "SKILL.md"), "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
      const name = /^name:\s*(.+)$/m.exec(frontmatter ?? "")?.[1]?.trim();
      expect(name, `Plugin frontmatter name mismatch: ${slug}`).toBe(slug);
    }
  });

  it("matches the served archive slugs", () => {
    expect(
      sortedSlugs(skillCatalog.filter((entry) => entry.channels.archive)),
      "Archive channel mismatch",
    ).toEqual(sortedSlugs(taskSkills));
  });

  it("gives coming-soon entries no distribution channel", () => {
    for (const entry of skillCatalog.filter((entry) => entry.status === "coming-soon")) {
      expect(entry.channels, `Coming-soon channel: ${entry.slug}`).toEqual({
        plugin: false,
        archive: false,
      });
    }
  });

  it("gives available and beta entries a distribution channel", () => {
    for (const entry of skillCatalog.filter((entry) => entry.status !== "coming-soon")) {
      expect(
        entry.channels.plugin || entry.channels.archive,
        `Missing distribution channel: ${entry.slug}`,
      ).toBe(true);
    }
  });

  it("projects exactly one install row per catalog entry in status order", () => {
    expect([...SKILLS.map((row) => row.name)].sort(), "Install rows mismatch").toEqual(
      sortedSlugs(skillCatalog),
    );
    const ordered = [
      ...skillCatalog.filter((entry) => entry.status !== "coming-soon"),
      ...skillCatalog.filter((entry) => entry.status === "coming-soon"),
    ];
    expect(SKILLS.map((row) => row.name)).toEqual(ordered.map((entry) => entry.slug));
    for (const entry of skillCatalog) {
      const row = SKILLS.find((candidate) => candidate.name === entry.slug);
      expect(row?.status).toBe(entry.status);
      expect(row?.plugin).toBe(entry.channels.plugin);
    }
  });

  it("offers archive paths exactly for the archive channel", () => {
    for (const entry of skillCatalog) {
      const expectedPath = entry.channels.archive
        ? `/.well-known/agent-skills/${entry.slug}.tar.gz`
        : null;
      expect(skillArchivePath(entry), `Archive helper mismatch: ${entry.slug}`).toBe(expectedPath);
      expect(
        SKILLS.find((row) => row.name === entry.slug)?.archivePath,
        `Install archive path mismatch: ${entry.slug}`,
      ).toBe(expectedPath);
    }
  });

  it.each(["en", "es-ES", "ja", "pl"])("describes every catalog slug in %s", (locale) => {
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), `messages/core/${locale}/project-install.json`), "utf8"),
    ) as { projectInstall: { skills: Record<string, string> } };
    for (const entry of skillCatalog) {
      expect(
        messages.projectInstall.skills[entry.slug],
        `Missing ${locale} skills.${entry.slug} message`,
      ).toEqual(expect.any(String));
      expect(messages.projectInstall.skills[entry.slug].trim()).not.toBe("");
    }
  });
});
