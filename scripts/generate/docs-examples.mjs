#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const region = "client-usage";
const examples = [
  {
    id: "python-client-usage",
    language: "python",
    page: "docs/sdks/python.mdx",
    source: "examples/python/quickstart.py",
  },
  {
    id: "typescript-client-usage",
    language: "typescript",
    page: "docs/sdks/typescript.mdx",
    source: "examples/ts/quickstart.ts",
  },
  {
    id: "go-client-usage",
    language: "go",
    page: "docs/sdks/go.mdx",
    source: "examples/go/quickstart/main.go",
  },
  {
    id: "mcp-client-usage",
    language: "javascript",
    page: "docs/sdks/mcp.mdx",
    source: "examples/mcp/quickstart.mjs",
  },
];

const exampleMethodSources = {
  python: "examples/python/quickstart.py",
  typescript: "examples/ts/quickstart.ts",
  go: "examples/go/quickstart/main.go",
};

function isRegionMarker(line, kind) {
  const marker = `docs:${kind}:${region}`;
  const trimmed = line.trim();
  return trimmed === `// ${marker}` || trimmed === `# ${marker}`;
}

function extractRegion(source, sourcePath) {
  const lines = source.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => (isRegionMarker(line, "start") ? [index] : []));
  const ends = lines.flatMap((line, index) => (isRegionMarker(line, "end") ? [index] : []));

  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new Error(
      `${sourcePath} must contain one ordered docs:start:${region}/docs:end:${region} pair.`,
    );
  }

  return dedent(lines.slice(starts[0] + 1, ends[0]));
}

// Regions sit inside a function or a `with` block, so they carry the enclosing indentation.
// Pasting that verbatim is a syntax error in Python, so strip the common prefix instead of
// asking every example to live at column zero.
function dedent(lines) {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^[\t ]*/)[0]);
  if (indents.length === 0) {
    return lines.join("\n");
  }

  let prefix = indents[0];
  for (const indent of indents) {
    while (!indent.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  return lines.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line)).join("\n");
}

function blockFor(example, source) {
  const excerpt = extractRegion(source, example.source);
  return [
    `{/* docs-example:start ${example.id} */}`,
    `{/* Generated from ${example.source} (region ${region}). Do not edit. */}`,
    `\`\`\`${example.language}`,
    excerpt,
    "```",
    `{/* docs-example:end ${example.id} */}`,
  ].join("\n");
}

function replaceBlock(page, example, block) {
  const start = `{/* docs-example:start ${example.id} */}`;
  const end = `{/* docs-example:end ${example.id} */}`;
  const startIndex = page.indexOf(start);
  const endIndex = page.indexOf(end);

  if (
    startIndex === -1 ||
    endIndex === -1 ||
    startIndex !== page.lastIndexOf(start) ||
    endIndex !== page.lastIndexOf(end) ||
    startIndex >= endIndex
  ) {
    throw new Error(`${example.page} must contain one ordered ${example.id} generated block.`);
  }

  return `${page.slice(0, startIndex)}${block}${page.slice(endIndex + end.length)}`;
}

function firstDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const limit = Math.max(expectedLines.length, actualLines.length);
  let index = 0;
  while (index < limit && expectedLines[index] === actualLines[index]) index += 1;
  return index + 1;
}

async function generatedPage(example) {
  const pagePath = path.join(root, example.page);
  const sourcePath = path.join(root, example.source);
  const [page, source] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(sourcePath, "utf8"),
  ]);
  return { generated: replaceBlock(page, example, blockFor(example, source)), page, pagePath };
}

const tableLanguages = ["python", "typescript", "go", "mcp"];

const methodPatterns = {
  go: /^\s*"([^"]+)":\s*\(\*bisibility\.Client\)\.([A-Za-z0-9_]+),\s*$/,
  python: /^\s*"([^"]+)":\s*BisibilityClient\.([A-Za-z0-9_]+),\s*$/,
  typescript: /^\s*"([^"]+)":\s*BisibilityClient\.prototype\.([A-Za-z0-9_]+),\s*$/,
};

function methodRegion(source, sourcePath) {
  const start = source.indexOf("docs:start:method-contract");
  const end = source.indexOf("docs:end:method-contract");
  if (start === -1 || end === -1 || start >= end) {
    throw new Error(`${sourcePath} must contain one ordered method-contract region.`);
  }
  return source.slice(start, end);
}

export function parseExampleMethodContract(language, source, sourcePath = language) {
  const pattern = methodPatterns[language];
  if (!pattern) throw new Error(`Unsupported SDK language ${language}.`);
  const entries = new Map();
  for (const line of methodRegion(source, sourcePath).split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    if (entries.has(match[1])) throw new Error(`${sourcePath} repeats workflow ${match[1]}.`);
    entries.set(match[1], match[2]);
  }
  if (entries.size === 0) throw new Error(`${sourcePath} has an empty method-contract region.`);
  return entries;
}

function parseMethodsTable(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 6) continue;
    const workflow = cells[1];
    if (!workflow || workflow === "Workflow") continue;
    if (tableLanguages.every((_, i) => /^-+$/.test(cells[i + 2] ?? ""))) continue;
    const unbacktick = (c) => c.replace(/^`|`$/g, "");
    rows.push({
      workflow,
      python: unbacktick(cells[2]),
      typescript: unbacktick(cells[3]),
      go: unbacktick(cells[4]),
      mcp: unbacktick(cells[5]),
    });
  }
  return rows;
}

export function checkMethodParity({ methodsContent, exampleSources, mcpToolNames }) {
  const failures = [];
  const rows = parseMethodsTable(methodsContent);
  for (const [lang, source] of Object.entries(exampleSources)) {
    const contract = parseExampleMethodContract(lang, source);
    const workflows = new Set(rows.map((row) => row.workflow));
    for (const row of rows) {
      const method = contract.get(row.workflow);
      if (!method) {
        failures.push(`${lang} example contract is missing workflow ${row.workflow}.`);
      } else if (method !== row[lang]) {
        failures.push(`${lang} example method ${method} != docs method ${row[lang]} for ${row.workflow}.`);
      }
    }
    for (const workflow of contract.keys()) {
      if (!workflows.has(workflow)) failures.push(`${lang} example has extra workflow ${workflow}.`);
    }
  }
  for (const row of rows) {
    if (!mcpToolNames.has(row.mcp)) failures.push(`MCP method ${row.mcp} is not canonical.`);
  }
  return failures;
}

async function runParityCheck() {
  const methodsContent = await readFile(path.join(root, "docs/sdks/methods.mdx"), "utf8");
  const exampleSources = {};
  for (const [lang, sourcePath] of Object.entries(exampleMethodSources)) {
    exampleSources[lang] = await readFile(path.join(root, sourcePath), "utf8");
  }
  const mcpContract = JSON.parse(
    await readFile(path.join(root, "lib/mcp/canonical-contract.json"), "utf8"),
  );
  const mcpToolNames = new Set(mcpContract.map((tool) => tool.name));
  return checkMethodParity({ methodsContent, exampleSources, mcpToolNames });
}

async function main() {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");

  if (write === check) {
    console.error("Usage: node scripts/generate/docs-examples.mjs --write|--check");
    process.exitCode = 2;
    return;
  }

  const stale = [];
  const parityFailures = [];
  for (const example of examples) {
    const result = await generatedPage(example);
    if (result.page === result.generated) continue;

    if (write) {
      await writeFile(result.pagePath, result.generated);
      console.log(`Wrote ${example.page}`);
    } else {
      stale.push(`${example.page} is stale (first difference at line ${firstDifference(
        result.generated,
        result.page,
      )}).`);
    }
  }

  if (check) {
    parityFailures.push(...(await runParityCheck()));
  }

  if (stale.length > 0) {
    console.error(`${stale.join("\n")}\nRun npm run generate:docs-examples to update the pages.`);
    process.exitCode = 1;
  }
  if (parityFailures.length > 0) {
    console.error(`SDK method parity failures:\n${parityFailures.join("\n")}`);
    process.exitCode = 1;
  }
  if (stale.length > 0 || parityFailures.length > 0) return;

  if (write) {
    console.log("SDK documentation examples are current.");
  } else {
    console.log("SDK documentation examples are in sync.");
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  await main();
}

export { parseMethodsTable };
