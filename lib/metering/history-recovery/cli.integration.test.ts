import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { historyFixture } from "./test-fixture";

test("real Node CLI lists, previews, refuses stale approval, applies and replays without paid I/O", async () => {
  const f = await historyFixture();
  const directory = mkdtempSync(join(tmpdir(), "history-resolution-cli-"));
  const path = join(directory, "manifest.json");
  const local = new URL(f.url);
  local.searchParams.set("schema", f.schema);
  const invoke = (args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--import",
        "./lib/temporal/register-loader.mjs",
        "scripts/ops/resolve-historical-accounting.ts",
        ...args,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: local.toString() },
        encoding: "utf8",
        timeout: 15000,
      },
    );
  try {
    writeFileSync(path, JSON.stringify(f.manifest));
    const list = invoke(["--list", "--namespace", "test"]);
    expect(list.status, list.stderr).toBe(0);
    expect(JSON.parse(list.stdout)).toMatchObject({
      nextAfter: null,
      operations: [{ operationId: f.ops[0]?.operationId, costKnown: true, unitsKnown: false }],
    });
    const preview = invoke(["--manifest", path]);
    expect(preview.status, preview.stderr).toBe(0);
    const { planHash } = JSON.parse(preview.stdout);
    const rejected = invoke(["--manifest", path, "--apply", "--confirm", "0".repeat(64)]);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("Preview changed");
    const applied = invoke(["--manifest", path, "--apply", "--confirm", planHash]);
    expect(applied.status, applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ resolved: 1, replayed: false });
    const replayed = invoke(["--manifest", path, "--apply", "--confirm", planHash]);
    expect(replayed.status, replayed.stderr).toBe(0);
    expect(JSON.parse(replayed.stdout)).toMatchObject({ resolved: 1, replayed: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
    await f.close();
  }
});
