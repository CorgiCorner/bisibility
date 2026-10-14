import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const TOP_LEVEL_ROOTS = [
  "instrumentation-client.ts",
  "instrumentation.ts",
  "mdx-components.tsx",
  "middleware.ts",
];

function isProductionSource(file: string) {
  return (
    SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
    !/\.(?:test|spec|stories)\.[^.]+$/.test(file) &&
    !file.includes("/__tests__/") &&
    !file.endsWith(".d.ts")
  );
}

function listSources(directory: string, root = ROOT): string[] {
  const absoluteDirectory = path.join(root, directory);
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    const isDirectory =
      entry.isDirectory() ||
      (entry.isSymbolicLink() && statSync(path.join(root, relative)).isDirectory());
    return isDirectory
      ? listSources(relative, root)
      : isProductionSource(relative)
        ? [relative]
        : [];
  });
}

function resolveImport(importer: string, specifier: string, sources: Set<string>) {
  let candidate: string;
  if (specifier.startsWith("@/")) {
    candidate = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  } else {
    return null;
  }

  const candidates = [
    candidate,
    ...SOURCE_EXTENSIONS.map((extension) => `${candidate}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.posix.join(candidate, `index${extension}`)),
  ];
  return candidates.find((source) => sources.has(source)) ?? null;
}

function importsFor(source: string, sources: Set<string>, root = ROOT) {
  const contents = readFileSync(path.join(root, source), "utf8");
  const imports = ts.preProcessFile(contents, true, true).importedFiles;
  return imports
    .map(({ fileName }) => resolveImport(source, fileName, sources))
    .filter((resolved): resolved is string => resolved !== null);
}

function isProductionRoot(source: string) {
  if (TOP_LEVEL_ROOTS.includes(source)) return true;
  if (source.startsWith("lib/actions/")) return true;
  return (
    source.startsWith("app/") &&
    /\/(?:actions|default|error|global-error|layout|loading|not-found|page|route|template)\.(?:ts|tsx)$/.test(
      source,
    )
  );
}

function unreachableSettingsSources(
  allSources: string[],
  readImports: (source: string) => string[],
) {
  // Pop settings entry points first; every production root remains eligible.
  const priority = (source: string) => Number(/\/(?:settings|integrations)\//.test(source));
  const pending = allSources.filter(isProductionRoot).sort((a, b) => priority(a) - priority(b));
  const reachable = new Set<string>();
  const remaining = new Set(
    allSources.filter((source) => source.startsWith("components/settings/")),
  );
  while (pending.length > 0 && remaining.size > 0) {
    const source = pending.pop();
    if (!source || reachable.has(source)) continue;
    reachable.add(source);
    remaining.delete(source);
    if (remaining.size > 0) pending.push(...readImports(source));
  }
  return [...remaining].sort();
}

describe("settings production reachability", () => {
  it("does not parse an unrelated graph after every settings target is reached", () => {
    const sources = [
      "app/page.tsx",
      "app/layout.tsx",
      "components/settings/One.ts",
      "components/settings/Two.ts",
      "lib/unrelated.ts",
    ];
    const edges: Record<string, string[]> = {
      "app/page.tsx": ["lib/unrelated.ts"],
      "app/layout.tsx": ["components/settings/One.ts", "components/settings/Two.ts"],
    };
    const parsed: string[] = [];
    expect(
      unreachableSettingsSources(sources, (source) => {
        parsed.push(source);
        return edges[source] ?? [];
      }),
    ).toEqual([]);
    expect(parsed).not.toContain("lib/unrelated.ts");
    expect(parsed).not.toContain("app/page.tsx");
  });

  it("retains alias, relative, index, require and cycle edges while reporting an orphan", () => {
    const root = mkdtempSync(path.join(tmpdir(), "settings-reachability-"));
    const files = {
      "app/page.tsx": 'export { default } from "@/components/settings/Entry";',
      "app/page.test.tsx": 'import "@/components/settings/Orphan";',
      "components/settings/Entry.tsx": 'import "./group"; export default function Entry() {}',
      "components/settings/group/index.js":
        'const leaf = require("../Leaf"); module.exports = leaf;',
      "components/settings/Leaf.ts": 'import "./Entry";',
      "components/settings/Orphan.ts": "export const orphan = true;",
      "components/settings/ignored.d.ts": 'import "./Orphan";',
      "lib/unused.ts": "export const unused = true;",
    };
    try {
      for (const [file, contents] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), contents);
      }
      const sources = SOURCE_ROOTS.flatMap((directory) => listSources(directory, root));
      const set = new Set(sources);
      expect(sources).not.toContain("app/page.test.tsx");
      expect(sources).not.toContain("components/settings/ignored.d.ts");
      expect(
        unreachableSettingsSources(sources, (source) => importsFor(source, set, root)),
      ).toEqual(["components/settings/Orphan.ts"]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps symlinked settings directories in the production source scope", () => {
    const root = mkdtempSync(path.join(tmpdir(), "settings-source-link-"));
    try {
      mkdirSync(path.join(root, "components/settings"), { recursive: true });
      mkdirSync(path.join(root, "lib/shared"), { recursive: true });
      writeFileSync(path.join(root, "lib/shared/Shared.ts"), "export const shared = true;");
      symlinkSync(
        path.join(root, "lib/shared"),
        path.join(root, "components/settings/shared"),
        "dir",
      );
      expect(listSources("components", root)).toContain("components/settings/shared/Shared.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
  it("keeps every settings source reachable from a production entry point", () => {
    const allSources = SOURCE_ROOTS.flatMap((directory) => listSources(directory)).concat(
      TOP_LEVEL_ROOTS.filter((source) => existsSync(path.join(ROOT, source))),
    );
    const sourceSet = new Set(allSources);
    const unreachable = unreachableSettingsSources(allSources, (source) =>
      importsFor(source, sourceSet),
    );
    expect(unreachable).toEqual([]);
  }, 10_000);
});
