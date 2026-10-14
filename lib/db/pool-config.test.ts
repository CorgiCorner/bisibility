import { describe, expect, it } from "vitest";
import { databaseConnectionConfig, databasePoolConfig, databaseSchemaFromUrl } from "./pool-config";

describe("databasePoolConfig", () => {
  it("uses conservative SSR defaults", () => {
    expect(databasePoolConfig({})).toEqual({
      application_name: "bisibility-ssr",
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
      max: 3,
    });
  });

  it("supports a separate worker budget", () => {
    expect(
      databasePoolConfig({
        DATABASE_APPLICATION_NAME: "bisibility-worker",
        DATABASE_CONNECT_TIMEOUT_MS: "3000",
        DATABASE_IDLE_TIMEOUT_MS: "15000",
        DATABASE_POOL_MAX: "4",
      }),
    ).toEqual({
      application_name: "bisibility-worker",
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 15_000,
      max: 4,
    });
  });

  it("sets a quoted search path when the connection URL names a schema", () => {
    expect(
      databasePoolConfig(
        {},
        "postgresql://user:secret@db/bisibility?schema=bisibility_preview_pr_446",
      ),
    ).toMatchObject({
      application_name: "bisibility-ssr",
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
      max: 3,
      options: '-c search_path="bisibility_preview_pr_446",pg_temp -c TimeZone=UTC',
    });
  });

  it.each([
    ["DATABASE_POOL_MAX", "0"],
    ["DATABASE_POOL_MAX", "21"],
    ["DATABASE_CONNECT_TIMEOUT_MS", "fast"],
    ["DATABASE_IDLE_TIMEOUT_MS", "999"],
    ["DATABASE_APPLICATION_NAME", "bisibility Worker"],
  ] as const)("rejects invalid %s=%s", (name, value) => {
    expect(() => databasePoolConfig({ [name]: value })).toThrow(name);
  });
});

describe("databaseSchemaFromUrl", () => {
  it("preserves the Prisma schema URL parameter for the driver adapter", () => {
    expect(databaseSchemaFromUrl("postgresql://user:secret@db/bisibility?schema=preview")).toBe(
      "preview",
    );
  });

  it("leaves the adapter schema unset when the URL has no valid schema", () => {
    expect(databaseSchemaFromUrl("postgresql://user:secret@db/bisibility")).toBeUndefined();
    expect(databaseSchemaFromUrl("not a URL")).toBeUndefined();
  });

  it.each([
    "preview schema",
    "preview,public",
    'preview"',
    "preview\\",
    "1preview",
    `p${"x".repeat(63)}`,
  ])("rejects unsafe or unsupported schema %s", (schema) => {
    const url = new URL("postgresql://user:secret@db/bisibility");
    url.searchParams.set("schema", schema);

    expect(() => databaseSchemaFromUrl(url.toString())).toThrow("Database schema");
  });
});

describe("databaseConnectionConfig", () => {
  it("enforces UTC for a URL without a schema", () => {
    expect(databaseConnectionConfig("postgresql://user:secret@db/bisibility").options).toBe(
      "-c TimeZone=UTC",
    );
  });

  it("preserves other startup options and overrides URL timezone before pg reparses the URL", () => {
    const url = new URL("postgresql://user:secret@db/bisibility?schema=preview");
    url.searchParams.set("options", "-c statement_timeout=15000 -c TimeZone=Europe/Warsaw");
    const config = databaseConnectionConfig(url.toString());
    expect(config.options).toBe(
      '-c statement_timeout=15000 -c TimeZone=Europe/Warsaw -c search_path="preview",pg_temp -c TimeZone=UTC',
    );
    if (!config.connectionString) throw new Error("URL options were not canonicalized");
    expect(new URL(config.connectionString).searchParams.get("options")).toBe(config.options);
  });
});
