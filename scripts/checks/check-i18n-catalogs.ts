import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { activeLocaleValues } from "../../i18n/config.ts";
import {
  flattenMessageCatalog,
  mergeMessageCatalogs,
  messageSignature,
  type MessageCatalog,
  validateCatalogParity,
} from "../../i18n/catalog-contract.ts";
import { i18nSurfaceManifest } from "../../i18n/surface-manifest.ts";

const root = resolve(import.meta.dirname, "../..");
const coveragePath = resolve(root, "i18n/catalog-coverage.json");
export const messageTypesPath = resolve(root, "i18n/core-messages.generated.ts");
const execFile = promisify(execFileCallback);

export type CatalogCoverageEntry = {
  arguments: [string, number][];
  key: string;
  tags: string[];
};

function assertNoDuplicateJsonMembers(source: string, filePath: string) {
  let position = 0;

  function fail(): never {
    throw new Error(`Invalid JSON catalog ${filePath}.`);
  }

  function skipWhitespace() {
    while (/\s/u.test(source[position] ?? "")) position += 1;
  }

  function readString(): string {
    if (source[position] !== '"') fail();
    const start = position;
    position += 1;
    while (position < source.length) {
      const character = source[position++];
      if (character === "\\") {
        position += 1;
        continue;
      }
      if (character === '"') return JSON.parse(source.slice(start, position)) as string;
    }
    fail();
  }

  function readValue(path: string): void {
    skipWhitespace();
    const character = source[position];
    if (character === "{") return readObject(path);
    if (character === "[") return readArray(path);
    if (character === '"') {
      readString();
      return;
    }

    const start = position;
    while (position < source.length && !/[\s,\]}]/u.test(source[position] ?? "")) position += 1;
    if (start === position) fail();
  }

  function readObject(path: string): void {
    position += 1;
    skipWhitespace();
    if (source[position] === "}") {
      position += 1;
      return;
    }

    const members = new Set<string>();
    while (true) {
      const member = readString();
      const memberPath = `${path}.${member}`;
      if (members.has(member)) throw new Error(`Duplicate JSON member "${member}" at ${memberPath}.`);
      members.add(member);
      skipWhitespace();
      if (source[position] !== ":") fail();
      position += 1;
      readValue(memberPath);
      skipWhitespace();
      if (source[position] === "}") {
        position += 1;
        return;
      }
      if (source[position] !== ",") fail();
      position += 1;
      skipWhitespace();
    }
  }

  function readArray(path: string): void {
    position += 1;
    skipWhitespace();
    let index = 0;
    if (source[position] === "]") {
      position += 1;
      return;
    }

    while (true) {
      readValue(`${path}[${index++}]`);
      skipWhitespace();
      if (source[position] === "]") {
        position += 1;
        return;
      }
      if (source[position] !== ",") fail();
      position += 1;
      skipWhitespace();
    }
  }

  readValue("catalog");
  skipWhitespace();
  if (position !== source.length) fail();
}

export async function readCatalogDirectory(directory: string): Promise<MessageCatalog> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`No catalog fragments found in ${directory}.`);

  const fragments = await Promise.all(
    files.map(async (file) => {
      const filePath = resolve(directory, file);
      try {
        const source = await readFile(filePath, "utf8");
        assertNoDuplicateJsonMembers(source, filePath);
        return JSON.parse(source);
      } catch (error) {
        throw new Error(
          `Invalid JSON catalog ${filePath}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }),
  );
  return mergeMessageCatalogs(...fragments);
}

export async function validateActivatedCatalogs(catalogRoot: string) {
  const english = await readCatalogDirectory(resolve(catalogRoot, "en"));
  const issues = validateCatalogParity(english, english);

  for (const locale of activeLocaleValues) {
    const catalog = locale === "en" ? english : await readCatalogDirectory(resolve(catalogRoot, locale));
    issues.push(...validateCatalogParity(english, catalog));
  }

  return { english, issues };
}

export function coverageFor(catalog: MessageCatalog): CatalogCoverageEntry[] {
  return Object.entries(flattenMessageCatalog(catalog))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, message]) => {
      const signature = messageSignature(message);
      return {
        arguments: [...signature.arguments.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
        key,
        tags: [...signature.tags].sort(),
      };
    });
}

export function catalogType(catalog: MessageCatalog, depth = 0): string {
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  const entries = Object.entries(catalog)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const type = typeof value === "string" ? JSON.stringify(value) : catalogType(value, depth + 1);
      const property = /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? key : JSON.stringify(key);
      return `${childIndent}readonly ${property}: ${type};`;
    });
  return `{\n${entries.join("\n")}\n${indent}}`;
}

export function generatedMessageTypes(
  typeName: string,
  catalog: MessageCatalog,
  generatorPath = "scripts/checks/check-i18n-catalogs.ts",
) {
  return `// Generated by ${generatorPath}. Do not edit.\nexport type ${typeName} = ${catalogType(catalog)};\n`;
}

/** Formats generated source exactly as the repository formatter would, without touching disk. */
export async function formatWithBiome(source: string, filePath: string) {
  const biome = spawn(resolve(root, "node_modules/.bin/biome"), [
    "format",
    `--stdin-file-path=${filePath}`,
  ]);
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  biome.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  biome.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  const formatted = new Promise<string>((resolveFormatted, rejectFormatted) => {
    biome.on("error", rejectFormatted);
    biome.on("close", (code) => {
      if (code === 0) resolveFormatted(Buffer.concat(chunks).toString("utf8"));
      else
        rejectFormatted(
          new Error(`biome format failed: ${Buffer.concat(errors).toString("utf8")}`),
        );
    });
  });
  biome.stdin.end(source);
  return await formatted;
}

async function main() {
  const { english: englishCore, issues } = await validateActivatedCatalogs(
    resolve(root, "messages", "core"),
  );

  if (issues.length > 0) {
    throw new Error(`i18n catalog validation failed:\n${issues.join("\n")}`);
  }

  const coverage = {
    foundationSources: i18nSurfaceManifest.foundationSources,
    locales: { en: coverageFor(englishCore) },
    schemaVersion: 1,
  };
  // `--write` used to format the file AFTER writing it while `--check` compared the raw generator
  // output, so any catalog value carrying a straight double quote - which biome rewrites into a
  // single-quoted literal - was permanently stale and `--write` could never settle it. Both paths
  // now compare and emit the same formatted bytes.
  const messageTypes = await formatWithBiome(
    generatedMessageTypes("CoreMessages", englishCore),
    messageTypesPath,
  );
  if (process.argv.includes("--write")) {
    await Promise.all([
      writeFile(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`),
      writeFile(messageTypesPath, messageTypes),
    ]);
    await execFile(resolve(root, "node_modules/.bin/biome"), ["format", "--write", coveragePath]);
    return;
  }

  const [committed, committedMessageTypes] = await Promise.all([
    readFile(coveragePath, "utf8").then((source) => JSON.parse(source)),
    readFile(messageTypesPath, "utf8"),
  ]);
  if (JSON.stringify(committed) !== JSON.stringify(coverage)) {
    throw new Error("i18n/catalog-coverage.json is stale. Run check-i18n-catalogs.ts --write.");
  }
  if (committedMessageTypes !== messageTypes) {
    throw new Error("i18n/core-messages.generated.ts is stale. Run check-i18n-catalogs.ts --write.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
