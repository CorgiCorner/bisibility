import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ownedRoots = [
  "components/overview",
  "components/research",
  "components/search-insights",
  "components/domain-overview",
  "components/keywords",
  "components/keyword-detail",
  "components/rank-tracker",
  "components/rank-check",
  "components/checks",
  "components/backlinks",
  "components/competitors",
  "components/alerts",
  "components/timeline",
  "components/cost-estimate",
  "components/markets",
  "components/getting-started",
  "components/account",
  "components/settings",
  "components/cloud",
  "app/app/(workspace)",
  "app/cloud",
];

const allowedMonoLine = (line: string) =>
  /<(?:code|pre)\b/.test(line) ||
  /\{(?:publicId|requestId|checkId|jobId|runId|projectId)\}/.test(line) ||
  (/fontFamily:\s*["']var\(--font-mono\)/.test(line) && /(?:code|syntax|command)/i.test(line));

const ownedSourceFiles = () =>
  ownedRoots.flatMap((root) =>
    readdirSync(root, { encoding: "utf8", recursive: true }).map((file) => join(root, file)),
  );

describe("owned product and settings typography", () => {
  it("reserves Mono for actual syntax and opaque identifiers", () => {
    const files = ownedSourceFiles().filter(
      (file) => /\.(?:ts|tsx)$/.test(file) && !/\.(?:test|stories)\./.test(file),
    );
    const violations = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          /MonoText|font-mono|var\(--font-mono\)/.test(line) && !allowedMonoLine(line)
            ? [`${file}:${index + 1}:${line.trim()}`]
            : [],
        ),
    );
    expect(violations).toEqual([]);
  });

  it("uses Sans tabular numerals for representative product metrics", () => {
    const files = [
      "components/cost-estimate/ProviderSpendMeter.tsx",
      "components/search-insights/SearchInsightsRowsTable.tsx",
      "components/domain-overview/DomainOverviewKeywordsTable.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/font-mono[^"'\n]*tabular-nums|tabular-nums[^"'\n]*font-mono/);
    }
  });
});
