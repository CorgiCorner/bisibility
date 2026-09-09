import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

/**
 * The modules that assemble import status for a rendered request must not open a Temporal client.
 *
 * Production runs the app on Vercel and Temporal on a Hetzner box whose firewall admits operator
 * addresses only, so the connection cannot succeed. `@temporalio/client` defaults `connectTimeout`
 * to 10,000 ms and gRPC retries a refused connection until that deadline, so such a call is a ten
 * second wait followed by a guaranteed failure. Measured: 10,010 ms against a blackholed address,
 * 10,002 ms against a refused one, 23 ms against a reachable cluster. Three pages paid it on every
 * render until the calls were removed.
 *
 * SCOPE, and why it is this narrow. A repo-wide "no page reaches a Temporal client" check was
 * tried first and abandoned: `lib/auth/session` reaches `lib/auth/auth`, which reaches the welcome
 * email client, so import reachability marks almost every page as a violation while none of them
 * opens a connection on a normal request. Module imports do not tell you whether the call runs.
 * Rather than ship a guard that is either noise or theatre, this checks the small set of modules
 * whose whole job is to assemble status for a render, where any Temporal import IS a request-path
 * call. Add a module here when it joins that set.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const REQUEST_PATH_MODULES = [
  "lib/search-insights/status-facts.ts",
  "lib/queries/integration-consumer-status.ts",
  "lib/settings/search-sync-metrics.ts",
  "lib/search-insights/queries/context.ts",
  "lib/search-insights/queries/first-view.ts",
];

const FORBIDDEN = [
  "@/lib/temporal/client",
  "@/lib/temporal/scheduler-client",
  "@/lib/temporal/search-insights-client",
  "@/lib/temporal/traffic-client",
  "@/lib/temporal/alert-delivery-client",
  "@/lib/temporal/welcome-email-client",
  "@temporalio/client",
];

function forbiddenImports(file) {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  for (const statement of parsed.statements) {
    const isImport =
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier);
    if (!isImport) continue;
    // A type-only import erases at build time and cannot open a connection.
    if (statement.importClause?.isTypeOnly || statement.isTypeOnly) continue;
    const specifier = statement.moduleSpecifier.text;
    if (FORBIDDEN.some((bad) => specifier === bad || specifier.startsWith(`${bad}/`))) {
      found.push(specifier);
    }
  }
  return found;
}

function main() {
  const violations = [];
  for (const file of REQUEST_PATH_MODULES) {
    for (const specifier of forbiddenImports(file)) violations.push({ file, specifier });
  }

  if (violations.length > 0) {
    console.error(
      "A module that assembles status for a render must not open a Temporal client. The web process cannot reach the cluster in production, so this is a ten second wait followed by a guaranteed failure. Read the state the worker already persisted, or queue the work and let the worker claim it.\n",
    );
    for (const { file, specifier } of violations) console.error(`  ${file} imports ${specifier}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `temporal-request-boundary: ${REQUEST_PATH_MODULES.length} request-path modules, no Temporal client imports`,
  );
}

main();
