import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { RUN_STATUSES, TERMINAL_RUN_STATUSES } from "./contract";

const advancementOwners: Readonly<Record<string, string>> = {
  blocked: "due run launcher",
  cancelling: "cancellation command and run reconciler",
  planned: "due run launcher",
  queued: "worker run launcher",
  running: "rank-check item claim",
};

const terminalStatuses = new Set<string>(TERMINAL_RUN_STATUSES);
const projectRoot = process.cwd();
const sourceRoots = [resolve(projectRoot, "lib/rank-check"), resolve(projectRoot, "lib/temporal")];
const allowedStartWriters = {
  "lib/rank-check/items-claim.ts": "Claims the first due item, which starts its queued run.",
  "lib/rank-check/planner/launch-due.ts":
    "Resumes a blocked run only when it had started before blocking.",
} as const;

function orphanedStatuses(statuses: readonly string[]) {
  return statuses.filter((status) => !terminalStatuses.has(status) && !advancementOwners[status]);
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [path] : [];
    });
}

function propertyName(property: ts.ObjectLiteralElementLike) {
  if (!ts.isPropertyAssignment(property) || !property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    return property.name.text;
  if (
    ts.isComputedPropertyName(property.name) &&
    (ts.isStringLiteral(property.name.expression) ||
      ts.isNoSubstitutionTemplateLiteral(property.name.expression))
  ) {
    return property.name.expression.text;
  }
  return null;
}

function expressionCanBeRunning(expression: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expression))
    return expressionCanBeRunning(expression.expression);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text === "running";
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      expressionCanBeRunning(expression.whenTrue) || expressionCanBeRunning(expression.whenFalse)
    );
  }
  if (ts.isTemplateExpression(expression)) {
    return (
      expression.head.text === "running" ||
      expression.templateSpans.some(
        (span) => expressionCanBeRunning(span.expression) || span.literal.text === "running",
      )
    );
  }
  return false;
}

function isRankCheckRunUpdate(call: ts.CallExpression) {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  if (call.expression.name.text !== "update" && call.expression.name.text !== "updateMany") {
    return false;
  }
  const model = call.expression.expression;
  return ts.isPropertyAccessExpression(model) && model.name.text === "rankCheckRun";
}

function updateCanStartRun(call: ts.CallExpression) {
  if (!isRankCheckRunUpdate(call)) return false;
  const input = call.arguments.find(ts.isObjectLiteralExpression);
  const data = input?.properties.find((property) => propertyName(property) === "data");
  if (!data || !ts.isPropertyAssignment(data) || !ts.isObjectLiteralExpression(data.initializer)) {
    return false;
  }
  const status = data.initializer.properties.find(
    (property) => propertyName(property) === "status",
  );
  return Boolean(
    status && ts.isPropertyAssignment(status) && expressionCanBeRunning(status.initializer),
  );
}

function rawSqlCanStartRun(
  literal: ts.StringLiteral | ts.TemplateLiteral,
  sourceFile: ts.SourceFile,
) {
  const sql = literal
    .getText(sourceFile)
    .replace(/\$\{[\s\S]*?\}/g, "?")
    .toLowerCase();
  return (
    /\bupdate\s+(?:only\s+)?"?rank_check_runs"?\b/.test(sql) &&
    /\bstatus\b\s*=\s*[\s\S]*?['"]running['"]/.test(sql)
  );
}

function rawSqlCallCanStartRun(call: ts.CallExpression, sourceFile: ts.SourceFile) {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    !["$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"].includes(
      call.expression.name.text,
    )
  ) {
    return false;
  }
  return call.arguments.some(
    (argument) =>
      (ts.isStringLiteral(argument) ||
        ts.isNoSubstitutionTemplateLiteral(argument) ||
        ts.isTemplateExpression(argument)) &&
      rawSqlCanStartRun(argument, sourceFile),
  );
}

function sourceCanStartRun(source: string, path = "fixture.ts") {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let startsRun = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isCallExpression(node) &&
        (updateCanStartRun(node) || rawSqlCallCanStartRun(node, file))) ||
      (ts.isTaggedTemplateExpression(node) && rawSqlCanStartRun(node.template, file))
    ) {
      startsRun = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return startsRun;
}

function rankCheckRunStartWriters() {
  return sourceRoots
    .flatMap(sourceFiles)
    .filter((path) => sourceCanStartRun(readFileSync(path, "utf8"), path))
    .map((path) => relative(projectRoot, path));
}

describe("run status advancement ownership", () => {
  it("names a component that advances every non-terminal run status", () => {
    const orphaned = orphanedStatuses(RUN_STATUSES);

    expect(orphaned, `Run statuses without advancement owners: ${orphaned.join(", ")}`).toEqual([]);
    expect(
      RUN_STATUSES.filter((status) => !terminalStatuses.has(status)).map((status) => ({
        owner: advancementOwners[status],
        status,
      })),
    ).toEqual([
      { owner: "due run launcher", status: "planned" },
      { owner: "due run launcher", status: "blocked" },
      { owner: "worker run launcher", status: "queued" },
      { owner: "rank-check item claim", status: "running" },
      { owner: "cancellation command and run reconciler", status: "cancelling" },
    ]);
  });

  it("explicitly exempts terminal run statuses from advancement ownership", () => {
    const exempt = RUN_STATUSES.filter((status) => terminalStatuses.has(status));

    expect(exempt).toEqual(TERMINAL_RUN_STATUSES);
    expect(exempt.map((status) => advancementOwners[status])).toEqual([undefined, undefined]);
  });

  it("detects conditional, template, and raw-SQL writers of a running run", () => {
    expect(
      sourceCanStartRun(
        'client.rankCheckRun.updateMany({ data: { status: started ? "running" : "queued" } });',
      ),
    ).toBe(true);
    expect(sourceCanStartRun("client.rankCheckRun.update({ data: { status: `running` } });")).toBe(
      true,
    );
    expect(
      sourceCanStartRun("db.$executeRaw`UPDATE \"rank_check_runs\" SET status = 'running'`"),
    ).toBe(true);
    expect(
      sourceCanStartRun("db.$executeRawUnsafe(\"UPDATE rank_check_runs SET status = 'running'\")"),
    ).toBe(true);
  });

  it("permits only the documented RankCheckRun writers that can start a run", () => {
    expect(allowedStartWriters).toEqual({
      "lib/rank-check/items-claim.ts": "Claims the first due item, which starts its queued run.",
      "lib/rank-check/planner/launch-due.ts":
        "Resumes a blocked run only when it had started before blocking.",
    });
    expect(rankCheckRunStartWriters()).toEqual(Object.keys(allowedStartWriters));
  });
});
