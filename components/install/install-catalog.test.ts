import { skillCatalog } from "@/lib/agent-ready/skill-catalog";
import { skillInstallSet } from "@/lib/agent-ready/skill-packs";
import { describe, expect, it } from "vitest";
import { skillsInstallCommand } from "./install-catalog";

const available = skillCatalog.filter((entry) => entry.status !== "coming-soon");

describe("pack-aware install commands", () => {
  const all = "npx skills add CorgiCorner/bisibility";

  it("installs a pack member or dependent skill with its whole set, never alone", () => {
    expect(skillsInstallCommand("domain-onboarding")).toBe(
      `${all} --skill domain-onboarding keyword-import provider-setup`,
    );
    expect(skillsInstallCommand("keyword-import")).toBe(
      `${all} --skill keyword-import domain-onboarding provider-setup`,
    );
    expect(skillsInstallCommand("self-host-health")).toBe(
      `${all} --skill self-host-health provider-setup`,
    );
    expect(skillsInstallCommand("seo-audit")).toBe(`${all} --skill seo-audit ai-visibility-audit`);
    expect(skillsInstallCommand("provider-setup")).toBe(`${all} --skill provider-setup`);
    expect(skillsInstallCommand("seo-coach")).toBe(all);
    expect(skillsInstallCommand("bisibility")).toBe(all);
    expect(skillsInstallCommand()).toBe(all);
  });

  it.each(available)("covers every requirement and pack member of $slug", (entry) => {
    const set = skillInstallSet(entry.slug, skillCatalog);
    const command = skillsInstallCommand(entry.slug);
    for (const slug of [...entry.requires, ...set]) {
      expect(command === all || command.split(" ").includes(slug), `${entry.slug} -> ${slug}`).toBe(
        true,
      );
    }
    for (const member of skillCatalog.filter((other) => entry.pack && other.pack === entry.pack)) {
      expect(set).toContain(member.slug);
    }
  });
});
