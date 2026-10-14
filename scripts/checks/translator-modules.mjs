import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "@typescript/typescript6";

export function analyzeImportedModule(specifier, context, collect) {
  if (!context?.resolveModule || context.depth >= 8) return undefined;
  const target = context.resolveModule(specifier, context.fileName);
  if (!target || context.active.has(target.fileName)) return undefined;
  if (context.cache.has(target.fileName)) return context.cache.get(target.fileName);
  const kind = target.fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const source = ts.createSourceFile(
    target.fileName,
    target.code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const analysis = collect(source, context.translatorFactories, {
    ...context,
    active: new Set(context.active).add(target.fileName),
    depth: context.depth + 1,
    fileName: target.fileName,
  });
  context.cache.set(target.fileName, analysis);
  return analysis;
}

/** Parses only local source; no runtime imports, outside-root reads or package execution. */
export function createRepoModuleResolver(root) {
  const baseRoot = resolve(root);
  return (specifier, fromFile) => {
    const base = specifier.startsWith("@/")
      ? join(baseRoot, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(resolve(baseRoot, fromFile)), specifier)
        : undefined;
    for (const suffix of base ? ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] : []) {
      const file = base + suffix;
      if (/\.tsx?$/u.test(file) && !relative(baseRoot, file).startsWith("..") && existsSync(file))
        return { fileName: file, code: readFileSync(file, "utf8") };
    }
    return undefined;
  };
}
