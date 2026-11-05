import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import bundle from "./plugin-skill-files.generated.json";
import { skillCatalog } from "./skill-catalog";
import {
  referencedSkills,
  type SkillReferenceSubject,
  skillPackIds,
  skillPackProblems,
  skillPackSummary,
  skillReferenceForm,
  skillReferenceProblems,
} from "./skill-packs";
import { taskSkills } from "./skills";

type BundledSkill = { pack: string | null; requires: readonly string[] };

const pluginRoot = path.join(process.cwd(), "plugins/bisibility/skills");
const knownSlugs = skillCatalog.map((entry) => entry.slug);
const bundled: Record<string, BundledSkill> = bundle.skills;
const pluginEntries = skillCatalog.filter((entry) => entry.channels.plugin);

// Skills that ship without any pack: the standalone set.
const standaloneSet = [
  "ai-prompt-research",
  "ai-visibility-audit",
  "alert-triage",
  "backlink-profile-analysis",
  "competitive-landscape",
  "competitor-analysis",
  "keyword-clustering",
  "keyword-opportunity-research",
  "local-seo",
  "project-setup",
  "provider-setup",
  "rank-tracking-report",
  "seo-audit",
  "team-api-governance",
  "weekly-report",
];

function pluginFiles(directory: string, prefix = ""): { path: string; content: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pluginFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`)
      : [
          {
            path: `${prefix}${entry.name}`,
            content: readFileSync(path.join(directory, entry.name), "utf8"),
          },
        ],
  );
}

function pluginSubject(slug: string): SkillReferenceSubject {
  const entry = skillCatalog.find((candidate) => candidate.slug === slug);
  if (!entry) throw new Error(`Unknown catalog slug ${slug}`);
  return { ...entry, files: pluginFiles(path.join(pluginRoot, slug)) };
}

function plant(subject: SkillReferenceSubject, text: string): SkillReferenceSubject {
  return {
    ...subject,
    files: subject.files.map((file) =>
      file.path === "SKILL.md" ? { ...file, content: `${file.content}\n${text}\n` } : file,
    ),
  };
}

const problems = (subject: SkillReferenceSubject) =>
  skillReferenceProblems([subject], skillCatalog);

// A consumer ships chosen packs all-or-nothing and rejects any skill with a missing requirement.
function installable(skills: Record<string, BundledSkill>, packs: readonly string[]): string[] {
  let selected = Object.keys(skills).filter((slug) => {
    const pack = skills[slug].pack;
    return pack === null || packs.includes(pack);
  });
  for (;;) {
    const kept = new Set(selected);
    const unmet = selected.filter((slug) => skills[slug].requires.some((req) => !kept.has(req)));
    // A standalone skill with an unmet requirement drops alone; a pack member drops its whole pack.
    const brokenPacks = new Set(unmet.flatMap((slug) => skills[slug].pack ?? []));
    const inBrokenPack = (slug: string) => brokenPacks.has(skills[slug].pack ?? "");
    const next = selected.filter((slug) => !unmet.includes(slug) && !inBrokenPack(slug));
    if (next.length === selected.length) return next.sort();
    selected = next;
  }
}

describe("skill packs and requirements", () => {
  it("declares a pack and requirements for every bundled skill", () => {
    expect(bundle.version).toBe(2);
    expect(bundle.referenceForm).toBe(skillReferenceForm);
    expect(Object.keys(bundled).sort()).toEqual(pluginEntries.map((entry) => entry.slug).sort());
    for (const entry of pluginEntries) {
      expect(bundled[entry.slug], entry.slug).toHaveProperty("pack", entry.pack);
      expect(bundled[entry.slug].requires, entry.slug).toEqual(entry.requires);
    }
    expect(bundle.packs).toEqual(skillPackSummary(pluginEntries));
    expect(Object.keys(bundle.packs)).toEqual([...skillPackIds]);
    expect(skillPackProblems(skillCatalog)).toEqual([]);
  });

  it("keeps the shared leaf outside every pack and reachable through requirements", () => {
    expect(bundle.packs["project-onboarding"]).toEqual({
      members: ["domain-onboarding", "keyword-import"],
      requires: ["provider-setup"],
    });
    expect(bundle.packs["instance-diagnosis"]).toEqual({
      members: ["self-host-health"],
      requires: ["provider-setup"],
    });
    expect(bundle.packs.router.members).toEqual(["bisibility", "seo-coach"]);
    expect(bundled["provider-setup"]).toMatchObject({ pack: null, requires: [] });
  });

  it("points every reference at an existing skill in the same pack or a declared requirement", () => {
    const subjects = pluginEntries.map((entry) => pluginSubject(entry.slug));
    expect(skillReferenceProblems(subjects, skillCatalog)).toEqual([]);
    for (const subject of subjects) {
      for (const slug of subject.files.flatMap((file) => referencedSkills(file.content))) {
        expect(knownSlugs, `${subject.slug} -> ${slug}`).toContain(slug);
        const samePack = subject.pack !== null && bundled[slug].pack === subject.pack;
        expect(slug === subject.slug || samePack || subject.requires.includes(slug)).toBe(true);
      }
    }
    const archiveSubjects = taskSkills.map((task) => {
      const entry = skillCatalog.find((candidate) => candidate.slug === task.slug);
      if (!entry) throw new Error(`Uncatalogued task skill ${task.slug}`);
      const files = [{ path: "SKILL.md", content: task.body }, ...(task.references ?? [])];
      return { ...entry, files };
    });
    expect(skillReferenceProblems(archiveSubjects, skillCatalog)).toEqual([]);
  });
});

describe("skill reference validation", () => {
  const leaf = pluginSubject("weekly-report");
  const outside = "weekly-report/SKILL.md: provider-setup outside a reference";

  it("accepts the canonical prose form in lists and sentences", () => {
    const sample =
      "Use the `keyword-import` or `provider-setup` skill, then the `alert-triage` skill.";
    expect(referencedSkills(sample)).toEqual(["keyword-import", "provider-setup", "alert-triage"]);
    expect(referencedSkills("The `a-b`, `c-d` and\n`e-f` skills run.")).toEqual([
      "a-b",
      "c-d",
      "e-f",
    ]);
    expect(referencedSkills("Read `provider-setup` next.")).toEqual([]);
    expect(problems(leaf)).toEqual([]);
  });

  it.each([
    ["namespaced command", "Next run `/bisibility:provider-setup`."],
    ["slash command", "Next run /provider-setup."],
    ["bold name", "If credentials fail, use **provider-setup**."],
    ["backticked slug", "If credentials fail, use `provider-setup`."],
    ["plain slug", "If credentials fail, use provider-setup next."],
    ["table cell", "| Repair a connection | provider-setup | write |"],
  ])("rejects a %s reference", (_form, text) => {
    expect(problems(plant(leaf, text)).some((problem) => problem.startsWith(outside))).toBe(true);
  });

  it.each([
    [
      "catalog title",
      "If credentials fail, follow provider setup.",
      "Provider setup",
      "provider-setup",
    ],
    [
      "routing paraphrase",
      "Then route to a one-competitor comparison.",
      "one-competitor",
      "competitor-analysis",
    ],
    ["router paraphrase", "Otherwise ask the router.", "the router", "bisibility"],
  ])("rejects a %s used as a skill name", (_form, text, name, slug) => {
    expect(problems(plant(leaf, text))).toContain(
      `weekly-report/SKILL.md: "${name}" names ${slug} without the \`${slug}\` skill`,
    );
  });

  it.each([
    ["backticked", "Ask `bisibility` first."],
    ["bold", "Ask **bisibility** first."],
    ["slash command", "Run /bisibility first."],
    ["table cell", "| Choose a task | bisibility | read |"],
  ])("rejects a %s one-word slug that is also the product name", (_form, text) => {
    expect(problems(plant(leaf, text))).toContain(
      "weekly-report/SKILL.md: bisibility outside a reference; write the `bisibility` skill",
    );
  });

  it.each([
    [
      "hyphenated slug",
      "alpha-beta.+",
      "Unrelated title",
      "alpha-beta.+",
      "alpha-betaXX",
      "outside a reference",
    ],
    ["marked slug", "alpha.+", "Unrelated title", "`alpha.+`", "`alphaXX`", "outside a reference"],
    ["title", "other", "Name (alpha)+", "Name (alpha)+", "Name alpha", "names other"],
  ])(
    "matches regex metacharacters literally in a %s",
    (_form, slug, title, literal, nearMiss, issue) => {
      const subject: SkillReferenceSubject = {
        slug: "subject",
        pack: null,
        requires: [],
        files: [{ path: "notes.md", content: literal }],
      };
      const catalog = [{ slug, title }];
      expect(
        skillReferenceProblems([subject], catalog).some((problem) => problem.includes(issue)),
      ).toBe(true);
      const other = { ...subject, files: [{ path: "notes.md", content: nearMiss }] };
      expect(skillReferenceProblems([other], catalog)).toEqual([]);
    },
  );

  it("allows prose names beside the canonical reference, hostnames and hyphenated keys", () => {
    const text = [
      "For provider setup, use the `provider-setup` skill.",
      "",
      "Open https://bisibility.com for a bisibility project and create the ci-weekly-report key.",
    ].join("\n");
    const triage = pluginSubject("alert-triage");
    expect(problems({ ...plant(triage, text), requires: ["provider-setup"] })).toEqual([
      'alert-triage/SKILL.md: frontmatter metadata must be ["  bisibility.requires: \\"provider-setup\\""]',
    ]);
  });

  it("fails a planted dangling reference once and passes after it is restored", () => {
    const source = pluginSubject("domain-onboarding");
    expect(problems(plant(source, "Then use the `no-such-skill` skill."))).toEqual([
      "domain-onboarding/SKILL.md: the `no-such-skill` skill names no skill",
    ]);
    expect(problems(plant(leaf, "If credentials fail, use the `provider-setup` skill."))).toEqual([
      "weekly-report: references provider-setup without declaring it in requires",
    ]);
    expect(problems({ ...source, requires: [...source.requires, "alert-triage"] })).toEqual([
      "domain-onboarding: requires alert-triage but never references it",
      'domain-onboarding/SKILL.md: frontmatter metadata must be ["  bisibility.pack: project-onboarding","  bisibility.requires: \\"keyword-import provider-setup alert-triage\\""]',
    ]);
    expect(problems(source)).toEqual([]);
  });

  it("matches punctuation in catalog titles literally", () => {
    const catalog = [
      { slug: leaf.slug, title: "Weekly report" },
      { slug: "provider-setup", title: "Provider (setup)+" },
    ];
    const subject = {
      ...leaf,
      requires: [],
      files: [{ path: "references/title.md", content: "Provider (setup)+ handles credentials." }],
    };
    expect(skillReferenceProblems([subject], catalog)).toEqual([
      'weekly-report/references/title.md: "Provider (setup)+" names provider-setup without the `provider-setup` skill',
    ]);
    expect(
      skillReferenceProblems(
        [{ ...subject, files: [{ path: "references/title.md", content: "Provider setup." }] }],
        catalog,
      ),
    ).toEqual([]);
  });
});

describe("one reference form for every install path", () => {
  it("bundles the plugin files byte for byte with no slash command references", () => {
    for (const entry of pluginEntries) {
      const { files } = bundle.skills[entry.slug as keyof typeof bundle.skills];
      for (const file of pluginSubject(entry.slug).files) {
        const bundledFile = files.find((candidate) => candidate.path === file.path);
        expect(bundledFile?.content, `${entry.slug}/${file.path}`).toBe(file.content);
        expect(file.content, `${entry.slug}/${file.path}`).not.toMatch(/\/bisibility:/);
      }
    }
  });

  it("names dependencies in prose that every install path resolves", () => {
    const onboarding = readFileSync(path.join(pluginRoot, "domain-onboarding/SKILL.md"), "utf8");
    expect(onboarding).toContain("use the `keyword-import` or `provider-setup` skill instead");
    expect(referencedSkills(onboarding)).toEqual([
      "keyword-import",
      "provider-setup",
      "provider-setup",
    ]);
  });
});

describe("pack consumer selection", () => {
  it("ships exactly the standalone set when no pack is chosen", () => {
    expect(installable(bundled, [])).toEqual(standaloneSet);
  });

  it("adds a pack whole only when every outside requirement is present", () => {
    expect(installable(bundled, ["project-onboarding"])).toEqual(
      [...standaloneSet, "domain-onboarding", "keyword-import"].sort(),
    );
    // The router needs members of packs that were not chosen, so it is rejected as a whole.
    expect(installable(bundled, ["router"])).toEqual(standaloneSet);
    expect(installable(bundled, [...skillPackIds])).toEqual([...knownSlugs].sort());
  });

  it("rejects every skill and pack whose requirement is missing", () => {
    const { "provider-setup": _removed, ...withoutLeaf } = bundled;
    const result = installable(withoutLeaf, ["project-onboarding", "instance-diagnosis"]);
    expect(result).not.toContain("keyword-import");
    expect(result).not.toContain("domain-onboarding");
    expect(result).not.toContain("self-host-health");
    expect(result).toContain("seo-audit");
  });
});
