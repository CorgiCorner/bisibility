import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
// @ts-expect-error The lint helper is a JavaScript module.
import { researchTerminologyViolations } from "../../lib/research/terminology-guard.mjs";

type TerminologyViolation = { fileName: string };

function withFixture(files: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "research-terminology-guard-"));
  try {
    for (const [fileName, source] of Object.entries(files)) {
      const absolutePath = path.join(root, fileName);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, source);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("research terminology lint guard", () => {
  it("rejects case-insensitive whole-word occurrences in every guarded source root", () => {
    withFixture(
      {
        "lib/keyword-research/summary.ts": "export const label = 'MARKET';",
        "lib/domain-overview/summary.ts": "export const label = 'market';",
        "lib/backlinks/summary.ts": "export const label = 'Market';",
        "components/research/Summary.tsx": "export const label = 'market';",
        "components/domain-overview/Summary.tsx": "export const label = 'Market';",
        "components/backlinks/Summary.tsx": "export const label = 'market';",
      },
      (root) => {
        const violations = researchTerminologyViolations(root) as TerminologyViolation[];

        assert.deepEqual(
          violations.map((violation) => violation.fileName),
          [
            "components/backlinks/Summary.tsx",
            "components/domain-overview/Summary.tsx",
            "components/research/Summary.tsx",
            "lib/backlinks/summary.ts",
            "lib/domain-overview/summary.ts",
            "lib/keyword-research/summary.ts",
          ],
        );
      },
    );
  });

  it("permits test fixtures and terms that only contain the letters as part of another word", () => {
    withFixture(
      {
        "lib/keyword-research/default-scope.test.ts": "const tracked = 'market';",
        "components/research/Summary.tsx": "export const label = 'supermarket';",
        "components/keywords/Summary.tsx": "export const label = 'market';",
      },
      (root) => assert.deepEqual(researchTerminologyViolations(root), []),
    );
  });
});
