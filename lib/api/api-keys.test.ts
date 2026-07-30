import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey } from "./api-keys";
import type { ApiContext } from "./context";

type AddedColumn = {
  column: string;
  source: string;
  table: string;
};

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: { create: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function prismaColumnsByTable(schema: string) {
  const columnsByTable = new Map<string, Set<string>>();
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const modelNames = new Set(models.map((model) => model[1]));

  for (const model of models) {
    const [, modelName, body] = model;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;
    const columns = new Set<string>();

    for (const line of body.split("\n")) {
      const field = line.match(/^\s*(\w+)\s+(\w+)/);
      if (!field || modelNames.has(field[2])) {
        continue;
      }

      columns.add(line.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1]);
    }

    columnsByTable.set(table, columns);
  }

  return columnsByTable;
}

function addedColumns(sql: string, source: string): AddedColumn[] {
  const columns: AddedColumn[] = [];
  const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
  const alterTable = /\bALTER\s+TABLE(?:\s+ONLY)?\s+(?:"([^"]+)"|([A-Za-z_]\w*))\s+([\s\S]*?);/gi;
  const addColumn = /\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"([^"]+)"|([A-Za-z_]\w*))/gi;

  for (const statement of withoutComments.matchAll(alterTable)) {
    const table = statement[1] ?? statement[2];

    for (const addition of statement[3].matchAll(addColumn)) {
      columns.push({
        column: addition[1] ?? addition[2],
        source,
        table,
      });
    }
  }

  return columns;
}

function migrationColumnMismatches(schema: string, migrations: Array<[string, string]>) {
  const columnsByTable = prismaColumnsByTable(schema);
  const additions = migrations.flatMap(([source, sql]) => addedColumns(sql, source));
  const mismatches = additions.filter(
    ({ column, table }) => !columnsByTable.get(table)?.has(column),
  );

  return { additions, mismatches };
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function context(body: Record<string, unknown>): ApiContext {
  const url = new URL("https://example.test/api/v1/api-keys");
  return {
    auth: {
      apiKey: {
        id: "key_admin",
        name: "Admin",
        prefix: "bsb_key_live_admin",
        projectId: "project_1",
        scopes: ["admin"],
      },
      project: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: "prj_a00000000000000000000000",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    headers: new Headers(),
    instance: url.pathname,
    method: "POST",
    path: ["api-keys"],
    req: new Request(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    url,
  };
}

describe("createApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"));
    mocks.prisma.apiKey.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: new Date(),
        expiresAt: data.expiresAt ?? null,
        id: "api_key_1",
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
  });

  it.each([
    ["read", ["read"]],
    ["write", ["read", "write"]],
    ["admin", ["read", "write", "admin"]],
  ] as const)("persists the %s scope tier", async (scope, expected) => {
    const response = await createApiKey(context({ name: "Automation", scope }));

    expect(response.status).toBe(201);
    expect(mocks.prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scopes: expected }),
    });
  });

  it("keeps the legacy admin scope default", async () => {
    await createApiKey(context({ name: "Legacy" }));

    expect(mocks.prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scopes: ["read", "write", "admin"] }),
    });
  });

  it("accepts snake-case expiry and persists the resolved date", async () => {
    const response = await createApiKey(
      context({ expires_in_days: 30, name: "Expiring", scope: "read" }),
    );

    expect(mocks.prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expiresAt: new Date("2026-08-25T12:00:00.000Z"),
        scopes: ["read"],
      }),
    });
    await expect(response.json()).resolves.toMatchObject({
      expires_at: "2026-08-25T12:00:00.000Z",
      scope: "read",
    });
  });
});

describe("API key migration column names", () => {
  it("rejects snake_case columns when the Prisma field uses camelCase", () => {
    const schema = `
model Example {
  id              String    @id
  reviewExpiresAt DateTime?

  @@map("example_records")
}
`;
    const sql = 'ALTER TABLE "example_records" ADD COLUMN "review_expires_at" TIMESTAMP(3);';

    const result = migrationColumnMismatches(schema, [["negative fixture", sql]]);

    expect(result.additions).toHaveLength(1);
    expect(result.mismatches).toEqual([
      {
        column: "review_expires_at",
        source: "negative fixture",
        table: "example_records",
      },
    ]);
  });

  it("matches every added migration column to its Prisma database field", () => {
    const migrationsRoot = resolve(process.cwd(), "prisma/migrations");
    const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
      .filter(existsSync)
      .map((path) => [path, readFileSync(path, "utf8")] satisfies [string, string]);

    const result = migrationColumnMismatches(source("prisma/schema.prisma"), migrations);

    expect(result.additions.length).toBeGreaterThan(0);
    expect(result.mismatches).toEqual([]);
  });
});
