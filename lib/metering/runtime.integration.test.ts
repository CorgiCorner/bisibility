import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, expect, it, vi } from "vitest";
import { fixture } from "./store/test-fixture";

afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("uses the database URL schema for runtime metering transactions", async () => {
  const f = await fixture();
  let scoped: PrismaClient | undefined;
  try {
    const url = new URL(f.url);
    url.searchParams.set("schema", f.schema);
    vi.stubEnv("DATABASE_URL", url.toString());
    scoped = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url.toString(), ...databasePoolConfig(undefined, url.toString()) },
        { schema: databaseSchemaFromUrl(url.toString()) },
      ),
    });
    vi.doMock("@/lib/db/prisma", () => ({ prisma: scoped }));
    vi.resetModules();

    const [raw] = (await scoped.$queryRaw`SELECT current_schema() AS schema`) as {
      schema: string;
    }[];
    expect(raw?.schema).toBe(f.schema);
    expect(await scoped.$queryRaw`SELECT 1 FROM metering_shadow LIMIT 1`).toEqual([]);

    const { meteringRuntime, meteringSchema } = await import("./runtime");
    expect(meteringSchema()).toBe(f.schema);
    const { store } = await meteringRuntime();
    expect(await store.listBudgets("test")).toEqual([]);
    expect(
      await store.getOperation({
        namespace: "test",
        operationId: "missing",
        principal: undefined as never,
      }),
    ).toBeNull();
  } finally {
    await scoped?.$disconnect();
    await f.close();
  }
});
