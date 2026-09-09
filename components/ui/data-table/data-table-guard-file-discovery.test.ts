import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findDataTableLibraryImportViolations,
  findTableOwnershipViolations,
  readTrackedApplicationSources,
  readTrackedTablePaths,
  readTrackedTableSources,
  type TableOwnershipExemptions,
} from "./data-table-guard-helpers";

const temporaryRoots: string[] = [];
const exemptions: TableOwnershipExemptions = {
  permanentStaticPaths: new Set(),
  permanentStaticRoots: [],
  temporaryMigrationPaths: new Set(),
};

function temporaryRoot(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function writeSource(root: string, path: string, source: string) {
  const file = join(root, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, source);
}

function git(root: string, args: string[]) {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("data table guard file discovery", () => {
  it("walks a Git-free nested snapshot in deterministic order and retains guard coverage", () => {
    const parentRepository = temporaryRoot("data-table-guard-parent-");
    git(parentRepository, ["init", "--quiet"]);
    const snapshot = join(parentRepository, "snapshot");
    mkdirSync(snapshot);
    writeSource(snapshot, "app/layout.tsx", "export const Layout = () => <main />;");
    writeSource(
      snapshot,
      "components/BadTable.tsx",
      "export const BadTable = () => <table><tbody /></table>;",
    );
    writeSource(
      snapshot,
      "components/Example.stories.tsx",
      'import { useReactTable } from "@tanstack/react-table"; export { useReactTable };',
    );
    writeSource(
      snapshot,
      "components/__fixtures__/TableFixture.tsx",
      "export const TableFixture = () => <table />;",
    );
    writeSource(snapshot, "lib/table-model.ts", "export const tableModel = true;");

    expect(readTrackedTablePaths(snapshot)).toEqual([
      "app/layout.tsx",
      "components/BadTable.tsx",
      "components/Example.stories.tsx",
      "components/__fixtures__/TableFixture.tsx",
    ]);
    expect(readTrackedApplicationSources(snapshot).map((source) => source.path)).toEqual([
      "app/layout.tsx",
      "components/BadTable.tsx",
      "components/Example.stories.tsx",
      "components/__fixtures__/TableFixture.tsx",
      "lib/table-model.ts",
    ]);
    expect(findTableOwnershipViolations(readTrackedTableSources(snapshot), exemptions)).toEqual([
      expect.objectContaining({ kind: "html-table", path: "components/BadTable.tsx" }),
    ]);
    expect(findDataTableLibraryImportViolations(readTrackedApplicationSources(snapshot))).toEqual([
      expect.objectContaining({ path: "components/Example.stories.tsx" }),
    ]);
  });

  it("excludes generated, dependency, cache, and symlink paths without hiding shipped catalogs", () => {
    const snapshot = temporaryRoot("data-table-guard-archive-");
    writeSource(snapshot, "components/Visible.tsx", "export const Visible = () => <main />;");
    writeSource(snapshot, "components/node_modules/Hidden.tsx", "export const Hidden = true;");
    writeSource(snapshot, "components/.cache/Hidden.tsx", "export const Hidden = true;");
    writeSource(snapshot, "lib/generated/client.ts", "export const generated = true;");
    writeSource(snapshot, "lib/cache/cache.ts", "export const cache = true;");
    writeSource(snapshot, "lib/serp/generated/catalog.ts", "export const catalog = true;");
    writeSource(snapshot, "lib/reports/report.ts", "export const report = true;");
    writeSource(snapshot, "outside/Linked.tsx", "export const Linked = true;");
    symlinkSync(join(snapshot, "outside/Linked.tsx"), join(snapshot, "components/linked.tsx"));
    symlinkSync(join(snapshot, "outside"), join(snapshot, "components/linked"));

    expect(readTrackedApplicationSources(snapshot).map((source) => source.path)).toEqual([
      "components/Visible.tsx",
      "lib/cache/cache.ts",
      "lib/reports/report.ts",
      "lib/serp/generated/catalog.ts",
    ]);
  });

  it("keeps Git roots tracked-only and rejects malformed repository metadata", () => {
    const repository = temporaryRoot("data-table-guard-repository-");
    git(repository, ["init", "--quiet"]);
    writeSource(repository, "app/Tracked.tsx", "export const Tracked = () => <main />;");
    writeSource(repository, "components/Untracked.tsx", "export const Untracked = () => <main />;");
    git(repository, ["add", "app/Tracked.tsx"]);

    expect(readTrackedTablePaths(repository)).toEqual(["app/Tracked.tsx"]);

    const malformed = temporaryRoot("data-table-guard-malformed-");
    writeSource(malformed, "app/Layout.tsx", "export const Layout = () => <main />;");
    writeFileSync(join(malformed, ".git"), "gitdir: ../missing-worktree\n");

    expect(() => readTrackedTablePaths(malformed)).toThrow();
  });

  it("rejects an empty local Git directory instead of inheriting a parent repository", () => {
    const parentRepository = temporaryRoot("data-table-guard-parent-metadata-");
    git(parentRepository, ["init", "--quiet"]);
    writeSource(parentRepository, "app/Parent.tsx", "export const Parent = () => <main />;");
    git(parentRepository, ["add", "app/Parent.tsx"]);
    const snapshot = join(parentRepository, "snapshot");
    mkdirSync(join(snapshot, ".git"), { recursive: true });
    writeSource(snapshot, "app/Snapshot.tsx", "export const Snapshot = () => <main />;");

    expect(() => readTrackedTablePaths(snapshot)).toThrow();
  });

  it("recognizes a worktree .git file as tracked-source metadata", () => {
    const repository = temporaryRoot("data-table-guard-worktree-");
    git(repository, ["init", "--quiet"]);
    writeSource(repository, "app/Tracked.tsx", "export const Tracked = () => <main />;");
    git(repository, ["add", "app/Tracked.tsx"]);
    git(repository, [
      "-c",
      "user.email=tests@example.com",
      "-c",
      "user.name=Tests",
      "commit",
      "-m",
      "fixture",
    ]);
    const worktree = join(repository, "worktree");
    git(repository, ["worktree", "add", "--quiet", "-b", "discovery-worktree", worktree]);

    expect(readTrackedTablePaths(worktree)).toEqual(["app/Tracked.tsx"]);
  });
});
