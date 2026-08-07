import { FROZEN_NOW_MS } from "@/tests/clock";
import ts from "typescript";

const NEAR_FROZEN_NOW_MS = 24 * 60 * 60 * 1_000;
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/u;
const NEAR_FROZEN_DATE_PREFIXES = [-1, 0, 1].map((dayOffset) =>
  new Date(FROZEN_NOW_MS + dayOffset * NEAR_FROZEN_NOW_MS).toISOString().slice(0, 10),
);

export type DateFixtureViolation = {
  column: number;
  line: number;
  value: string;
};

export function findNearFrozenDateLiterals(fileName: string, sourceText: string) {
  if (!NEAR_FROZEN_DATE_PREFIXES.some((datePrefix) => sourceText.includes(datePrefix))) {
    return [];
  }

  const scriptKind = fileName.endsWith(".json")
    ? ts.ScriptKind.JSON
    : fileName.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : fileName.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const violations: DateFixtureViolation[] = [];

  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) && UTC_DATE_PATTERN.test(node.text)) {
      const timestamp = Date.parse(node.text);
      if (Number.isFinite(timestamp) && Math.abs(timestamp - FROZEN_NOW_MS) <= NEAR_FROZEN_NOW_MS) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({
          column: location.character + 1,
          line: location.line + 1,
          value: node.text,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}
