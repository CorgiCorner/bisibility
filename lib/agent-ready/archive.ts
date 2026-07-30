import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { TaskSkill } from "./skills/types";

type ArchiveFile = { path: string; content: string };

function assertSafeArchivePath(path: string) {
  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
  if (Buffer.byteLength(path, "utf8") > 100) {
    throw new Error(`Archive path exceeds the USTAR name limit: ${path}`);
  }
}

function tarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(path, 0, 100, "utf8"); // name
  header.write("0000644\0", 100, 8, "utf8"); // mode
  header.write("0000000\0", 108, 8, "utf8"); // uid
  header.write("0000000\0", 116, 8, "utf8"); // gid
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8"); // size
  header.write("00000000000\0", 136, 12, "utf8"); // mtime = 0 (deterministic)
  header.write("        ", 148, 8, "utf8"); // checksum placeholder (8 spaces)
  header.write("0", 156, 1, "utf8"); // typeflag: regular file
  header.write("ustar\0", 257, 6, "utf8"); // magic
  header.write("00", 263, 2, "utf8"); // version

  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += header[i];
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8"); // checksum
  return header;
}

export function buildTar(files: ArchiveFile[]): Buffer {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const chunks: Buffer[] = [];
  for (const file of sorted) {
    assertSafeArchivePath(file.path);
    const content = Buffer.from(file.content, "utf8");
    chunks.push(tarHeader(file.path, content.length), content);
    const remainder = content.length % 512;
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder, 0));
  }
  chunks.push(Buffer.alloc(1024, 0)); // two zero blocks terminate the archive
  return Buffer.concat(chunks);
}

function taskSkillFrontmatter(skill: TaskSkill): string {
  return [
    "---",
    `name: ${skill.slug}`,
    `description: ${JSON.stringify(skill.description)}`,
    "license: AGPL-3.0-only",
    `compatibility: ${skill.compatibility}`,
    "metadata:",
    "  publisher: bisibility",
    `  bisibility.kind: ${skill.kind}`,
    `  version: ${JSON.stringify(skill.version)}`,
    "---",
  ].join("\n");
}

export function taskSkillSkillMd(skill: TaskSkill): string {
  return `${taskSkillFrontmatter(skill)}\n\n${skill.body}\n`;
}

export function buildSkillArchive(skill: TaskSkill): Buffer {
  const files: ArchiveFile[] = [
    { content: taskSkillSkillMd(skill), path: `${skill.slug}/SKILL.md` },
  ];
  for (const reference of skill.references ?? []) {
    files.push({ content: reference.content, path: `${skill.slug}/${reference.path}` });
  }
  const gz = gzipSync(buildTar(files), { level: 9 });
  // Normalize gzip metadata for reproducible digests across runtimes: zero MTIME
  // (bytes 4-7) and set the OS byte (9) to 0xff ("unknown").
  gz.writeUInt32LE(0, 4);
  gz[9] = 0xff;
  return gz;
}

export type SkillArchive = { bytes: Buffer; sha256: string };

// Deterministic skill archives and digests are cached once per process.
const archiveCache = new Map<string, SkillArchive>();

export function getSkillArchive(skill: TaskSkill): SkillArchive {
  const cached = archiveCache.get(skill.slug);
  if (cached) return cached;
  const bytes = buildSkillArchive(skill);
  const built: SkillArchive = {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  archiveCache.set(skill.slug, built);
  return built;
}
