import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { DataMigrationManifestEntry } from "@/lib/data-migrations/manifest";
import {
  computeDataMigrationChecksum,
  resolveActiveDataMigrations,
} from "./resolver";
import type { DataMigrationImplementation } from "./types";

const id = "20260728060000_example";

function manifest(
  overrides: Partial<DataMigrationManifestEntry> = {},
): DataMigrationManifestEntry {
  return {
    checksum: "a".repeat(64),
    contractMigrationId: "20260728063000_contract",
    execution: "deploy-blocking",
    id,
    lifecycle: "active",
    prerequisiteSchemaMigrationId: "20260728050000_prerequisite",
    ...overrides,
  };
}

function implementation(
  sourceUrl: URL,
  overrides: Partial<DataMigrationImplementation> = {},
): DataMigrationImplementation {
  return {
    checksumInputs: [{ label: `${id}.ts`, url: sourceUrl }],
    id,
    run: vi.fn(),
    sourceUrl,
    ...overrides,
  };
}

describe("data migration resolver", () => {
  it("resolves active metadata and verifies declared implementation inputs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "data-migration-resolver-"));
    const source = pathToFileURL(join(directory, `${id}.ts`));
    const dependency = pathToFileURL(join(directory, "dependency.ts"));
    try {
      await writeFile(source, "export async function run() {};\n");
      await writeFile(dependency, "export const behavior = 1;\n");
      const entry = implementation(source, {
        checksumInputs: [
          { label: `${id}.ts`, url: source },
          { label: "dependency.ts", url: dependency },
        ],
      });
      const checksum = await computeDataMigrationChecksum(entry);

      await expect(
        resolveActiveDataMigrations([manifest({ checksum })], [entry]),
      ).resolves.toEqual([
        expect.objectContaining({
          checksum,
          lifecycle: "active",
          run: entry.run,
        }),
      ]);

      await writeFile(dependency, "export const behavior = 2;\n");
      await expect(
        resolveActiveDataMigrations([manifest({ checksum })], [entry]),
      ).rejects.toThrow("checksum mismatch");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires exactly one implementation for each active manifest entry", async () => {
    await expect(resolveActiveDataMigrations([manifest()], [])).rejects.toThrow(
      "has no implementation",
    );
    const source = new URL(`file:///tmp/${id}.ts`);
    await expect(resolveActiveDataMigrations([], [implementation(source)])).rejects.toThrow(
      "has no manifest entry",
    );
    await expect(
      resolveActiveDataMigrations(
        [manifest({ lifecycle: "retired" })],
        [implementation(source)],
      ),
    ).rejects.toThrow("Retired");
  });

  it("allows historical manifest entries without implementations", async () => {
    await expect(
      resolveActiveDataMigrations([manifest({ lifecycle: "retired" })], []),
    ).resolves.toEqual([]);
  });

  it("rejects missing, duplicate, and nondeterministic checksum inputs", async () => {
    const source = new URL(`file:///tmp/${id}.ts`);
    const alpha = new URL("file:///tmp/alpha.ts");
    const beta = new URL("file:///tmp/beta.ts");
    const cases: Array<[string, readonly { label: string; url: URL }[]]> = [
      ["declare checksum inputs", []],
      ["first checksum input", [{ label: "alpha.ts", url: alpha }]],
      [
        "duplicate checksum input labels",
        [
          { label: `${id}.ts`, url: source },
          { label: `${id}.ts`, url: alpha },
        ],
      ],
      [
        "duplicate checksum input URLs",
        [
          { label: `${id}.ts`, url: source },
          { label: "source-copy.ts", url: source },
        ],
      ],
      [
        "checksum inputs must be sorted",
        [
          { label: `${id}.ts`, url: source },
          { label: "beta.ts", url: beta },
          { label: "alpha.ts", url: alpha },
        ],
      ],
    ];

    for (const [message, checksumInputs] of cases) {
      await expect(
        resolveActiveDataMigrations(
          [manifest()],
          [implementation(source, { checksumInputs })],
        ),
      ).rejects.toThrow(message);
    }
  });

  it("rejects duplicate IDs and source filenames that do not match", async () => {
    const source = new URL(`file:///tmp/${id}.ts`);
    const entry = implementation(source);
    await expect(
      resolveActiveDataMigrations([manifest()], [entry, entry]),
    ).rejects.toThrow("Duplicate");
    await expect(
      resolveActiveDataMigrations(
        [manifest()],
        [implementation(new URL("file:///tmp/wrong.ts"))],
      ),
    ).rejects.toThrow("filename");
  });
});
