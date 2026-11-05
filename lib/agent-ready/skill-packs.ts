/**
 * Skill packs and harness-neutral cross-references.
 *
 * A skill names another skill only in prose: a backticked slug list followed by
 * "skill" or "skills", for example "the `keyword-import` or `provider-setup`
 * skill". One published tree serves namespaced plugin installs and installs that
 * register each skill under its own name, and invocation syntax differs per
 * client, so no slash command form is valid everywhere. Prose is, and needs no
 * per-target rendering.
 *
 * A pack groups skills that ship all-or-nothing. Packs are disjoint: a skill
 * belongs to at most one pack. A shared skill with no outbound references (a
 * leaf) stays outside every pack and is reached through `requires`, so dropping
 * one pack never removes a skill another pack or a standalone install still uses.
 */
export const skillPackIds = ["router", "project-onboarding", "instance-diagnosis"] as const;
export type SkillPackId = (typeof skillPackIds)[number];

/** Example of the canonical reference form, published with the bundle. */
export const skillReferenceForm = "the `<slug>` skill";

type SkillFile = Readonly<{ path: string; content: string }>;
type SkillDependencies = Readonly<{
  slug: string;
  pack: SkillPackId | null;
  requires: readonly string[];
}>;
type CatalogSkill = Readonly<{ slug: string; title: string }>;
export type SkillReferenceSubject = SkillDependencies & Readonly<{ files: readonly SkillFile[] }>;

const item = "`([a-z0-9]+(?:-[a-z0-9]+)*)`";
const separator = String.raw`(?:,\s+or\s+|,\s+and\s+|,\s+|\s+or\s+|\s+and\s+)`;
const referenceList = new RegExp(`${item}(?:${separator}${item})*\\s+skills?\\b`, "g");
const metadataLine = /^ {2}bisibility\.(?:pack|requires): .*$/gm;

/** Frontmatter `metadata` entries; omitted keys mean no pack and no requirements. */
export function skillPackMetadata(skill: Omit<SkillDependencies, "slug">): string[] {
  return [
    ...(skill.pack ? [`  bisibility.pack: ${skill.pack}`] : []),
    ...(skill.requires.length
      ? [`  bisibility.requires: ${JSON.stringify(skill.requires.join(" "))}`]
      : []),
  ];
}

function referenceSpans(content: string) {
  return [...content.matchAll(referenceList)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    slugs: [...match[0].matchAll(/`([a-z0-9-]+)`/g)].map((slug) => slug[1]),
  }));
}

/** Skills named by canonical references, in order of appearance. */
export function referencedSkills(content: string): string[] {
  return referenceSpans(content).flatMap((span) => span.slugs);
}

function splitFrontmatter(file: SkillFile) {
  const match = file.path === "SKILL.md" ? /^---\n([\s\S]*?)\n---\n/.exec(file.content) : null;
  return match
    ? { frontmatter: match[1], body: file.content.slice(match[0].length) }
    : { frontmatter: "", body: file.content };
}

// A one-word slug can also be an ordinary word (the product name), so only its code, command,
// bold and table-cell forms count. Hostnames such as bisibility.com and hyphenated keys such
// as ci-weekly-report are never mentions.
function literalIndexes(text: string, value: string): number[] {
  if (!value) return [];
  const indexes: number[] = [];
  for (
    let index = text.indexOf(value);
    index >= 0;
    index = text.indexOf(value, index + value.length)
  ) {
    if (
      !/[A-Za-z0-9_-]/.test(text.charAt(index - 1)) &&
      !/[A-Za-z0-9_-]/.test(text.charAt(index + value.length))
    ) {
      indexes.push(index);
    }
  }
  return indexes;
}

function markedMention(text: string, index: number, length: number): boolean {
  const end = index + length;
  if (text.charAt(index - 1) === "`" && text.charAt(end) === "`") return true;
  if (text.slice(index - 2, index) === "**" && text.slice(end, end + 2) === "**") return true;
  if (
    text.charAt(index - 1) === "/" &&
    !/[\w./-]/.test(text.charAt(index - 2)) &&
    !/[\w.-]/.test(text.charAt(end))
  ) {
    return true;
  }
  let left = index - 1;
  let right = end;
  while (left >= 0 && /\s/.test(text.charAt(left))) left--;
  while (right < text.length && /\s/.test(text.charAt(right))) right++;
  return text.charAt(left) === "|" && text.charAt(right) === "|";
}

function bareMentions(text: string, slug: string): number[] {
  const spans = referenceSpans(text);
  return literalIndexes(text, slug)
    .filter((index) =>
      slug.includes("-")
        ? !/^\.[A-Za-z]/.test(text.slice(index + slug.length, index + slug.length + 2))
        : markedMention(text, index, slug.length),
    )
    .filter((index) => !spans.some((span) => index >= span.start && index < span.end));
}

// Paraphrases found in routing sentences, beyond each skill's catalog title.
const proseAliases: Readonly<Record<string, readonly string[]>> = {
  bisibility: ["the router"],
  "competitor-analysis": ["one-competitor"],
  "competitive-landscape": ["landscape comparison"],
};

// A prose name is a reference too unless its paragraph also names the skill canonically.
function proseNames(body: string, skill: CatalogSkill): string[] {
  const names = [skill.title, ...(proseAliases[skill.slug] ?? [])];
  return body
    .split(/\n\s*\n/)
    .filter((paragraph) => !referencedSkills(paragraph).includes(skill.slug))
    .flatMap((paragraph) =>
      names.filter(
        (name) => literalIndexes(paragraph.toLowerCase(), name.toLowerCase()).length > 0,
      ),
    );
}

function formProblems(subject: SkillReferenceSubject, catalog: readonly CatalogSkill[]): string[] {
  const known = new Set(catalog.map((skill) => skill.slug));
  return subject.files.flatMap((file) => {
    const where = `${subject.slug}/${file.path}`;
    const { frontmatter, body } = splitFrontmatter(file);
    const scanned = `${frontmatter.replace(metadataLine, "")}\n${body}`;
    const others = catalog.filter((skill) => skill.slug !== subject.slug);
    return [
      ...referencedSkills(file.content)
        .filter((slug) => !known.has(slug))
        .map((slug) => `${where}: the \`${slug}\` skill names no skill`),
      ...others
        .filter((skill) => bareMentions(scanned, skill.slug).length)
        .map(
          (skill) =>
            `${where}: ${skill.slug} outside a reference; write the \`${skill.slug}\` skill`,
        ),
      ...others.flatMap((skill) =>
        proseNames(body, skill).map(
          (name) => `${where}: "${name}" names ${skill.slug} without the \`${skill.slug}\` skill`,
        ),
      ),
    ];
  });
}

function requirementProblems(subject: SkillReferenceSubject, known: Set<string>): string[] {
  const referenced = new Set(
    subject.files
      .flatMap((file) => referencedSkills(file.content))
      .filter((slug) => known.has(slug) && slug !== subject.slug),
  );
  return [
    ...[...referenced]
      .filter((slug) => !subject.requires.includes(slug))
      .map((slug) => `${subject.slug}: references ${slug} without declaring it in requires`),
    ...subject.requires
      .filter((slug) => !referenced.has(slug))
      .map((slug) => `${subject.slug}: requires ${slug} but never references it`),
  ];
}

function metadataProblems(subject: SkillReferenceSubject): string[] {
  const skill = subject.files.find((file) => file.path === "SKILL.md");
  if (!skill?.content.startsWith("---\n")) return [];
  const { frontmatter } = splitFrontmatter(skill);
  const expected = skillPackMetadata(subject);
  const actual = frontmatter.match(metadataLine) ?? [];
  const header = !expected.length || /^metadata:$/m.test(frontmatter);
  return actual.join("\n") === expected.join("\n") && header
    ? []
    : [`${subject.slug}/SKILL.md: frontmatter metadata must be ${JSON.stringify(expected)}`];
}

/** Every reference must be canonical and name the skill itself or a declared requirement. */
export function skillReferenceProblems(
  subjects: readonly SkillReferenceSubject[],
  catalog: readonly CatalogSkill[],
): string[] {
  const known = new Set(catalog.map((skill) => skill.slug));
  return subjects.flatMap((subject) => [
    ...formProblems(subject, catalog),
    ...requirementProblems(subject, known),
    ...metadataProblems(subject),
  ]);
}

export function skillPackProblems(entries: readonly SkillDependencies[]): string[] {
  const slugs = new Set(entries.map((entry) => entry.slug));
  return [
    ...skillPackIds
      .filter((id) => slugs.has(id))
      .map((id) => `pack ${id} reuses a skill slug; pack and skill names must differ`),
    ...skillPackIds
      .filter((id) => !entries.some((entry) => entry.pack === id))
      .map((id) => `pack ${id} has no members`),
    ...entries.flatMap((entry) =>
      entry.requires
        .filter((slug) => slug === entry.slug || !slugs.has(slug))
        .map((slug) => `${entry.slug}: requires ${slug}, which is itself or no skill`),
    ),
  ];
}

/** Pack members and the skills outside the pack that must already be installed. */
export function skillPackSummary(entries: readonly SkillDependencies[]) {
  return Object.fromEntries(
    skillPackIds.map((id) => {
      const members = entries.filter((entry) => entry.pack === id).map((entry) => entry.slug);
      const requires = new Set(
        entries
          .filter((entry) => entry.pack === id)
          .flatMap((entry) => entry.requires)
          .filter((slug) => !members.includes(slug)),
      );
      return [id, { members: members.sort(), requires: [...requires].sort() }];
    }),
  ) as Record<SkillPackId, { members: string[]; requires: string[] }>;
}

/** The skill, its pack members and every transitive requirement: the smallest valid install. */
export function skillInstallSet(slug: string, entries: readonly SkillDependencies[]): string[] {
  const selected = new Set<string>();
  const pending = [slug];
  while (pending.length) {
    const next = pending.pop();
    const entry = entries.find((candidate) => candidate.slug === next);
    if (!entry || selected.has(entry.slug)) continue;
    selected.add(entry.slug);
    pending.push(...entry.requires);
    if (entry.pack)
      pending.push(...entries.filter((e) => e.pack === entry.pack).map((e) => e.slug));
  }
  return [slug, ...[...selected].filter((member) => member !== slug).sort()];
}
