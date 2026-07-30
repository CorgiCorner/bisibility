// Native Node cannot resolve the app's extensionless TypeScript imports, so this
// worker-only hook appends `.ts` or `/index.ts`.
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RELATIVE = /^\.\.?\//;
const HAS_EXTENSION = /\.[^./]+$/;
const SERVER_ONLY_EMPTY_MODULE = "data:text/javascript,export%20%7B%7D;";
const PROJECT_ROOT_URL = pathToFileURL(`${process.cwd()}/`).href;

// Next.js request/runtime modules the worker's lib graph pulls in but never
// calls. Resolve them to no-op stubs so the worker stays independent of `next`.
const NEXT_RUNTIME_STUB = new URL("./next-runtime-stub.mjs", import.meta.url).href;
const NEXT_RUNTIME_MODULES = new Set([
  "next/headers",
  "next/cache",
  "next/navigation",
  "next/server",
  "next/link",
]);

function resolveTypeScriptPath(base) {
  if (existsSync(base)) {
    return pathToFileURL(base).href;
  }

  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(`${base}${suffix}`)) {
      return pathToFileURL(`${base}${suffix}`).href;
    }
  }

  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { shortCircuit: true, url: SERVER_ONLY_EMPTY_MODULE };
  }

  const loadRealNextServer =
    specifier === "next/server" && process.env.BISIBILITY_SMOKE_REAL_NEXT_SERVER === "1";
  if (loadRealNextServer) {
    return nextResolve("next/server.js", context);
  }
  if (NEXT_RUNTIME_MODULES.has(specifier) && !loadRealNextServer) {
    return { shortCircuit: true, url: NEXT_RUNTIME_STUB };
  }

  if (specifier.startsWith("@/")) {
    const resolved = resolveTypeScriptPath(resolvePath(process.cwd(), specifier.slice(2)));
    if (resolved) {
      return nextResolve(resolved, context);
    }
  }

  if (RELATIVE.test(specifier) && specifier.endsWith(".generated") && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    if (existsSync(`${base}.ts`)) {
      return nextResolve(`${specifier}.ts`, context);
    }
  }

  if (RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));

    if (existsSync(`${base}.ts`)) {
      return nextResolve(`${specifier}.ts`, context);
    }

    if (existsSync(`${base}/index.ts`)) {
      return nextResolve(`${specifier}/index.ts`, context);
    }
  }

  return nextResolve(specifier, context);
}

// Native Node requires JSON import attributes that app code omits, so expose JSON
// as default-export modules without source changes.
export function load(url, context, nextLoad) {
  if (
    url.startsWith(PROJECT_ROOT_URL) &&
    !url.includes("/node_modules/") &&
    url.endsWith(".json")
  ) {
    return {
      format: "module",
      source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
