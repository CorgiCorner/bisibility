import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existing: new Set<string>(),
  readFileSync: vi.fn(() => '{"name":"bisibility"}'),
}));

vi.mock("node:fs", () => {
  const existsSync = (path: string) => mocks.existing.has(path);
  return {
    default: { existsSync, readFileSync: mocks.readFileSync },
    existsSync,
    readFileSync: mocks.readFileSync,
  };
});

// The production loader is intentionally plain ESM so Node can load it before TypeScript hooks.
// @ts-expect-error There is no declaration file for this Node loader module.
import { load, resolve } from "./loader.mjs";

describe("Temporal ESM loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing.clear();
  });

  it("short-circuits server-only and Next runtime modules", () => {
    const nextResolve = vi.fn();
    expect(resolve("server-only", {}, nextResolve)).toMatchObject({ shortCircuit: true });
    expect(resolve("next/headers", {}, nextResolve)).toMatchObject({ shortCircuit: true });
    expect(nextResolve).not.toHaveBeenCalled();
  });

  it("resolves project aliases to TypeScript files", () => {
    const base = `${process.cwd()}/lib/example`;
    mocks.existing.add(`${base}.ts`);
    const nextResolve = vi.fn((specifier: string) => ({ url: specifier }));

    resolve(
      "@/lib/example",
      { parentURL: pathToFileURL(`${process.cwd()}/index.ts`).href },
      nextResolve,
    );

    expect(nextResolve).toHaveBeenCalledWith(pathToFileURL(`${base}.ts`).href, expect.anything());
  });

  it("resolves generated, file, and index relative imports", () => {
    const parentURL = pathToFileURL(`${process.cwd()}/lib/temporal/worker.ts`).href;
    const nextResolve = vi.fn((specifier: string) => ({ url: specifier }));
    mocks.existing.add(`${process.cwd()}/lib/temporal/runtime.generated.ts`);
    resolve("./runtime.generated", { parentURL }, nextResolve);
    expect(nextResolve).toHaveBeenLastCalledWith("./runtime.generated.ts", { parentURL });

    mocks.existing.add(`${process.cwd()}/lib/temporal/activity.ts`);
    resolve("./activity", { parentURL }, nextResolve);
    expect(nextResolve).toHaveBeenLastCalledWith("./activity.ts", { parentURL });

    mocks.existing.add(`${process.cwd()}/lib/temporal/workflows/index.ts`);
    resolve("./workflows", { parentURL }, nextResolve);
    expect(nextResolve).toHaveBeenLastCalledWith("./workflows/index.ts", { parentURL });
  });

  it("delegates unresolved and already extended imports", () => {
    const nextResolve = vi.fn((specifier: string) => ({ url: specifier }));
    resolve("external-package", {}, nextResolve);
    resolve(
      "./module.js",
      { parentURL: pathToFileURL(`${process.cwd()}/index.ts`).href },
      nextResolve,
    );
    expect(nextResolve).toHaveBeenNthCalledWith(1, "external-package", {});
    expect(nextResolve).toHaveBeenNthCalledWith(2, "./module.js", expect.anything());
  });

  it("loads project JSON as an ESM default export and delegates other files", () => {
    const nextLoad = vi.fn((url: string) => ({ format: "module", source: url }));
    const projectJson = pathToFileURL(`${process.cwd()}/package.json`).href;
    expect(load(projectJson, {}, nextLoad)).toEqual({
      format: "module",
      shortCircuit: true,
      source: 'export default {"name":"bisibility"};',
    });
    expect(mocks.readFileSync).toHaveBeenCalled();

    const dependencyJson = pathToFileURL(`${process.cwd()}/node_modules/pkg/package.json`).href;
    expect(load(dependencyJson, {}, nextLoad)).toEqual({
      format: "module",
      source: dependencyJson,
    });
  });
});
