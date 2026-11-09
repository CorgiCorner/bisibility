import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";
import { expect, it } from "vitest";

// Frozen relocation inventory from turn 1, including the split insight exports.
const relocated = new Set([
  "OssAdministrationInsights",
  "OssAnnouncements",
  "OssMeteringDetails",
  "OssRecoveryAccounting",
  "OssUsagePreview",
  "UsagePeriodContext",
  "OssGrowthPreview",
  "OssConsumptionPreview",
]);
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.[cm]?[jt]sx?$/.test(file) ? [file] : [];
  });
}
function violations(file: string, source: string) {
  const found: string[] = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function checkSpecifier(value: string) {
    const resolved = value.startsWith(".")
      ? path.resolve(path.dirname(file), value)
      : path.resolve(value.replace(/^@\//, ""));
    const privateRoot = path.resolve("components/private");
    if (resolved === privateRoot || resolved.startsWith(`${privateRoot}${path.sep}`))
      found.push(value);
    if (relocated.has(path.basename(value).replace(/\.[jt]sx?$/, ""))) found.push(value);
  }
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      checkSpecifier(node.arguments[0].text);
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    )
      checkSpecifier(node.argument.literal.text);
    if (ts.isIdentifier(node) && relocated.has(node.text)) found.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}
it("keeps every file in the OSS admin tree free of private imports and relocated components", () => {
  for (const file of [
    ...files(path.resolve("components/admin")),
    ...files(path.resolve("app/(regional)/app/admin")),
    ...files(path.resolve("lib/queries/admin")),
  ]) {
    expect(violations(file, readFileSync(file, "utf8")), file).toEqual([]);
  }
});
it.each([
  'import X from "@/components/private/admin-preview/X";',
  'export { X } from "../../private/admin-preview/X";',
  'const X = import("@/components/private/admin-preview/X");',
  'const X = require("@/components/private/admin-preview/X");',
  'import { OssGrowthPreview as X } from "./neutral-name";',
  'type X = import("@/components/private").X;',
])("rejects private or relocated references: %s", (source) => {
  expect(violations(path.resolve("components/admin/redesign/probe.tsx"), source)).not.toEqual([]);
});
