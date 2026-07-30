import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { auditTargetPolicy } from "@/lib/audit/target-policy";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return path === "lib/generated" ? [] : sourceFiles(path);
      }
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
    },
  );
}

type AuditCall = {
  line: number;
  path: string;
  targetId: ts.Expression | null;
  targetTypes: string[];
};

function auditCalls(): AuditCall[] {
  return [...sourceFiles("app"), ...sourceFiles("lib")].flatMap((path) => {
    const text = source(path);
    if (!text.includes("writeAudit")) return [];
    const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const calls: AuditCall[] = [];

    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "writeAudit" || node.expression.text === "writeAuditFailure")
      ) {
        const input = node.arguments[0];
        if (input && ts.isObjectLiteralExpression(input)) {
          const assignment = (name: string) =>
            input.properties.find(
              (item): item is ts.PropertyAssignment =>
                ts.isPropertyAssignment(item) && item.name.getText(tree) === name,
            );
          const targetType = assignment("targetType");
          const targetTypes: string[] = [];
          if (targetType) {
            const collectTargetTypes = (candidate: ts.Node) => {
              if (ts.isStringLiteral(candidate)) {
                targetTypes.push(candidate.text);
              } else if (ts.isConditionalExpression(candidate)) {
                collectTargetTypes(candidate.whenTrue);
                collectTargetTypes(candidate.whenFalse);
              } else if (ts.isParenthesizedExpression(candidate)) {
                collectTargetTypes(candidate.expression);
              }
            };
            collectTargetTypes(targetType.initializer);
          }
          calls.push({
            line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
            path: relative(process.cwd(), resolve(process.cwd(), path)),
            targetId: assignment("targetId")?.initializer ?? null,
            targetTypes,
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(tree);
    return calls;
  });
}

describe("public API raw-ID leak guard", () => {
  it("does not serialize internal Location or sitemap snapshot IDs", () => {
    expect(source("lib/api/locations.ts")).not.toMatch(/\bid:\s*candidate\.id/);
    expect(source("lib/api/locations-search.ts")).not.toMatch(
      /\bid:\s*(row\.id|`(?:location|country):)/,
    );
    expect(source("lib/sitemap/monitors.ts")).toContain(
      "select: { fetchedAt: true, sitemapUrl: true, urlCount: true }",
    );
  });

  it("does not serialize internal traffic snapshot or sync IDs", () => {
    const analyticsSource = source("lib/api/analytics.ts");
    expect(analyticsSource).not.toContain("snakeizeKeys(summary)");
    expect(analyticsSource).not.toMatch(/select:\s*\{[^}]*\bid:\s*true[^}]*\bprojectId:\s*true/s);
    expect(analyticsSource).toContain(
      'connection_id: requireApiPublicId(publicConnectionIds.get(connectionId) ?? "", "conn")',
    );
    expect(analyticsSource).toContain('project_id: requireApiPublicId(projectId, "prj")');
  });

  it("does not accept raw project IDs for derived sitemap-monitor resources", () => {
    const monitorSource = source("lib/sitemap/monitors.ts");
    expect(monitorSource).toContain("where: { publicId: context.projectId }");
    expect(monitorSource).not.toContain("context.monitorId !== project.id");
    expect(source("lib/api/public-id.ts")).toContain('requirePathId(path, 3, "prj")');
  });

  it("covers every direct audit writer with the target policy registry", () => {
    for (const call of auditCalls()) {
      for (const targetType of call.targetTypes) {
        const policy = auditTargetPolicy(targetType);
        expect(policy, `${call.path}:${call.line} targetType=${targetType}`).not.toBeNull();
        if (
          policy?.mode === "public" &&
          call.targetId &&
          ts.isPropertyAccessExpression(call.targetId) &&
          call.targetId.name.text === "id"
        ) {
          throw new Error(
            `${call.path}:${call.line} writes a direct .id target for public ${targetType}; require its v3 public ID explicitly.`,
          );
        }
      }
    }
  });
});
