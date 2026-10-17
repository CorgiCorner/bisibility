import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GET as sourceGET } from "@/app/.well-known/agent-skills/[skill]/[...file]/route";
import { GET } from "@/app/.well-known/agent-skills/[skill]/route";
import { describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import { getSkillArchive, taskSkillSkillMd } from "./archive";
import { getSkillZip } from "./plugin-skill-archive";
import frozenFiles from "./plugin-skill-files.generated.json";
import { skillCatalog } from "./skill-catalog";
import { taskSkills } from "./skills";
import { buildZip } from "./zip";

vi.mock("@/lib/auth/auth", () => ({
  AUTH_URL: "https://auth.example.com",
  MCP_RESOURCE_URL: "https://app.example.com/api/mcp",
}));

const root = new URL("../..", import.meta.url).pathname;
function unzip(bytes: Buffer): Record<string, string> {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        [
          "import io,json,sys,zipfile",
          "with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:",
          " assert archive.testzip() is None",
          " assert len(archive.namelist()) == len(set(archive.namelist()))",
          " print(json.dumps({name:archive.read(name).decode('utf-8') for name in archive.namelist()}))",
        ].join("\n"),
      ],
      { input: bytes, encoding: "utf8" },
    ),
  );
}

function request(skill: string, etag?: string) {
  return GET(
    new Request(`https://app.example.com/.well-known/agent-skills/${encodeURIComponent(skill)}`, {
      headers: etag ? { "If-None-Match": etag } : {},
    }),
    { params: Promise.resolve({ skill }) },
  );
}

describe("desktop skill ZIP archives", () => {
  it("keeps frozen public plugin bytes complete and current", () => {
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/generate/plugin-skill-files.mjs", "--check"],
      { cwd: root },
    );
    for (const [slug, files] of Object.entries(frozenFiles)) {
      expect(skillCatalog.find((skill) => skill.slug === slug)?.channels.plugin).toBe(true);
      for (const file of files) {
        expect(file.path).toMatch(
          /^(LICENSE|SKILL\.md|(references|scripts)\/[a-zA-Z0-9_./-]+\.(md|json|mjs|mts))$/,
        );
        expect(file.content).toBe(
          readFileSync(
            file.path === "LICENSE"
              ? path.join(root, "plugins/bisibility/LICENSE")
              : path.join(root, "plugins/bisibility/skills", slug, file.path),
            "utf8",
          ),
        );
      }
    }
  });

  it.each(skillCatalog.filter((skill) => skill.status !== "coming-soon"))(
    "exports every file for $slug with a real ZIP reader",
    (skill) => {
      const archive = getSkillZip(skill.slug);
      expect(archive).not.toBeNull();
      if (!archive) throw new Error("Missing available skill ZIP");
      const actual = unzip(archive.bytes);
      const task = taskSkills.find((entry) => entry.slug === skill.slug);
      const files = skill.channels.plugin
        ? frozenFiles[skill.slug as keyof typeof frozenFiles]
        : task
          ? [{ path: "SKILL.md", content: taskSkillSkillMd(task) }, ...(task.references ?? [])]
          : [];
      expect(actual).toEqual(
        Object.fromEntries(files.map((file) => [`${skill.slug}/${file.path}`, file.content])),
      );
      const frontmatter = actual[`${skill.slug}/SKILL.md`].match(
        /^---\n([\s\S]*?)\n---(?:\n|$)/,
      )?.[1];
      expect(frontmatter).toBeTruthy();
      const metadata = parseYaml(frontmatter ?? "");
      expect(metadata.name).toBe(skill.slug);
      expect(metadata.description).toEqual(expect.any(String));
      if (metadata.compatibility !== undefined)
        expect(metadata.compatibility).toEqual(expect.any(String));
      expect(getSkillZip(skill.slug)?.bytes).toEqual(archive.bytes);
    },
  );

  it.each(skillCatalog.filter((skill) => skill.status !== "coming-soon"))(
    "serves complete source with working reference URLs for $slug",
    async (skill) => {
      const source = async (file: string) =>
        sourceGET(new Request("https://app.example.com"), {
          params: Promise.resolve({ skill: skill.slug, file: file.split("/") }),
        });
      const response = await source("SKILL.md");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      const content = await response.text();
      const archive = getSkillZip(skill.slug);
      if (!archive) throw new Error("Available skill archive missing");
      const actualFiles = unzip(archive.bytes);
      expect(content.trimEnd()).toBe(actualFiles[`${skill.slug}/SKILL.md`].trimEnd());
      for (const [, target] of content.matchAll(/\]\((references\/[^)#]+)\)/g)) {
        const reference = await source(target);
        expect(reference.status).toBe(200);
        expect((await reference.text()).trimEnd()).toBe(
          actualFiles[`${skill.slug}/${target}`].trimEnd(),
        );
      }
      expect((await source("../SKILL.md")).status).toBe(404);
      expect((await source(".env")).status).toBe(404);
    },
  );

  it("serves a package index linked to every available workflow source on this instance", async () => {
    const response = await request("workflows.md");
    expect(response.status).toBe(200);
    const index = await response.text();
    for (const skill of skillCatalog) {
      expect(index.includes(`./${skill.slug}/SKILL.md`)).toBe(skill.status !== "coming-soon");
    }
    expect(index).not.toContain("github.com");
    expect(index).toContain("explicit approval");
  });

  it("preserves UTF-8 names and content and sorts entries deterministically", () => {
    const files = [
      { path: "skill/references/日本語.md", content: "Zażółć 日本語\n" },
      { path: "skill/SKILL.md", content: "name: skill\n" },
    ];
    expect(unzip(buildZip(files))).toEqual(
      Object.fromEntries(files.map((file) => [file.path, file.content])),
    );
    expect(buildZip([...files].reverse())).toEqual(buildZip(files));
  });

  it.each([
    "../secret",
    "/secret",
    "skill/../secret",
    "skill\\secret",
    "C:/secret",
    "skill//secret",
    "skill/./secret",
    "secret\0",
  ])("rejects unsafe writer path %s", (unsafe) => {
    expect(() => buildZip([{ path: unsafe, content: "" }])).toThrow(/Unsafe/);
  });

  it("serves ZIP MIME, safe name, cache and conditional digest", async () => {
    const response = await request("project-setup.zip");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="project-setup.zip"',
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(unzip(Buffer.from(await response.arrayBuffer()))["project-setup/SKILL.md"]).toContain(
      "name: project-setup",
    );
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    const unchanged = await request("project-setup.zip", etag ?? "");
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
  });

  it.each([
    "missing.zip",
    "local-seo.zip",
    "../project-setup.zip",
    "%2e%2e%2fproject-setup.zip",
    "project-setup/secret.zip",
    "__proto__.zip",
  ])("does not export unknown, planned or traversal request %s", async (slug) => {
    expect((await request(slug)).status).toBe(404);
  });

  it("preserves original tar.gz bytes and headers", async () => {
    const task = taskSkills.find((entry) => entry.slug === "bisibility");
    if (!task) throw new Error("Missing original task fixture");
    const response = await request("bisibility.tar.gz");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(getSkillArchive(task).bytes);
  });
});
