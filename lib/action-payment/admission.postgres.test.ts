import { randomUUID } from "node:crypto";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import type { SerpProvider } from "@/lib/providers/types";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readPaymentPart } from "./receipt";
import { prepareActionPayment } from "./session";

const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, key) => {
        const value = Reflect.get(state.client!, key);
        return typeof value === "function" ? value.bind(state.client) : value;
      },
    },
  ),
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "payment-fixture" }));
vi.mock("./deployment-extension", () => ({
  quoteDeploymentPayment: vi.fn(),
  assertDeploymentPayment: vi.fn(),
  readDeploymentPayment: vi.fn(),
  readDeploymentPaymentAvailability: vi.fn(),
}));
// The native Meter port is an existing boundary; this fixture exercises the new real SQL
// journal uniqueness/locks and consent guard, not a replacement wallet implementation.
vi.mock("@/lib/provider-usage/admission-extension", () => ({
  ownAdmission: {
    reserve: async (tx: PrismaClient, inputs: { id: string }[]) =>
      inputs.map(({ id }) => ({ attemptId: id, leaseId: "fixture-lease" })),
    fence: async () => undefined,
    acknowledge: async (tx: PrismaClient, id: string) => {
      await tx.$executeRawUnsafe(
        "INSERT INTO payment_fixture_charges(id) VALUES($1) ON CONFLICT DO NOTHING",
        id,
      );
      return true;
    },
    cancel: async () => undefined,
  },
}));
// The release-safety lane provides the shared credits fixture; the suite owns its own schema.
const url =
  process.env.ACTION_PAYMENT_TEST_DATABASE_URL ?? process.env.PROVIDER_UI_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const schema = `payment_fixture_${randomUUID().replaceAll("-", "")}`;
let db: PrismaClient;
let admin: PrismaClient;
const provider = {
  id: "future",
  label: "Future",
  payment: {
    basis: "provider_quantity",
    unit: {
      kind: "provider_native",
      providerId: "future",
      key: "queries",
      singular: "query",
      plural: "queries",
    },
    estimateQuantity: () => "1",
  },
  fetchRank: vi.fn(),
  testConnection: vi.fn(),
} as SerpProvider;
const connection = {
  id: "connection",
  publicId: "conn_a00000000000000000000000",
  provider: "future",
  credentialSource: "own" as const,
  credentialsEncrypted: "retained-key",
};
const input = {
  projectId: "project",
  ownerId: "owner",
  actorId: "owner",
  source: "app",
  feature: "keyword_research",
  request: ["seed"],
  provider,
  connection,
  children: [{ key: "source", costCents: 0, quantity: 1, cached: false }],
};
async function consent() {
  const preview = (await prepareActionPayment(input))!;
  return (await prepareActionPayment({
    ...input,
    acceptedPayment: { quoteToken: preview.quote.quoteToken },
  }))!;
}

suite("payment consent real PostgreSQL boundaries", () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      parsed.hostname !== "127.0.0.1" ||
      !["/fixture", "/credits_fixture"].includes(parsed.pathname)
    )
      throw new Error("Owned loopback fixture required");
    admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const scopedUrl = new URL(url!);
    scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: scopedUrl.toString() }, { schema }),
    });
    state.client = db;
    const ddl = [
      'CREATE TABLE projects(id text PRIMARY KEY,"ownerId" text NOT NULL)',
      'CREATE TABLE provider_connections(id text PRIMARY KEY,"projectId" text,"publicId" text,provider text,"credentialSource" text,"credentialsEncrypted" text,enabled boolean,status text)',
      `CREATE TABLE metering_usage_evidence(id text PRIMARY KEY,namespace text,principal text NOT NULL,"projectId" text NOT NULL,"connectionId" text NOT NULL,provider text NOT NULL,feature text NOT NULL,source text NOT NULL,"credentialKind" text,"credentialId" text,"correlationId" text NOT NULL,unit text NOT NULL,estimate jsonb NOT NULL,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz DEFAULT now(),receipt jsonb,"proofVersion" integer DEFAULT 0,"receiptId" text,"providerRequestId" text,"canonicalId" text,discarded boolean DEFAULT false,"measurementStatus" text DEFAULT 'unknown')`,
      "CREATE TABLE payment_fixture_charges(id text PRIMARY KEY)",
      `INSERT INTO projects VALUES('project','owner')`,
      `INSERT INTO provider_connections VALUES('connection','project','${connection.publicId}','future','own','retained-key',true,'connected')`,
    ];
    for (const sql of ddl) await db.$executeRawUnsafe(sql);
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });

  it("actual locked admission refuses a changed payer before a permit", async () => {
    const payment = (await consent()).child("source")!;
    await db.$executeRaw`UPDATE provider_connections SET "credentialSource" = ${"hosted"} WHERE id=${"connection"}`;
    await expect(
      db.$transaction(async (tx) => {
        await payment.guard.lockBusiness(tx, "attempt");
        await payment.guard.assertRequest(tx, "attempt");
      }),
    ).rejects.toThrow("payment_quote_changed");
    expect(await db.meteringUsageEvidence.count()).toBe(0);
    await db.$executeRaw`UPDATE provider_connections SET "credentialSource" = ${"own"} WHERE id=${"connection"}`;
  });
  it("concurrent accepted replay creates one SQL attempt and one acknowledged charge", async () => {
    const session = await consent();
    const payment = session.child("source")!;
    const attribution = {
      context: {
        projectId: "project",
        feature: "keyword_research",
        source: "app",
        trigger: "manual",
        correlationId: payment.operationKey,
      },
      tag: "fixture",
    } as never;
    const make = () =>
      createProviderRequestJournal(db, {
        attribution,
        connectionId: "connection",
        projectId: "project",
        provider: "future",
        unit: "units",
        credentialVersion: "retained-version",
        estimate: { cents: "0", units: "1" },
        logicalOperationKey: payment.operationKey,
        beforeReserve: payment.guard,
      });
    const first = make(),
      replay = make();
    const results = await Promise.allSettled([first.observer.begin(), replay.observer.begin()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.meteringUsageEvidence.count()).toBe(1);
    const winner = results[0].status === "fulfilled" ? first : replay;
    const result = results.find(
      (item) => item.status === "fulfilled",
    )! as PromiseFulfilledResult<string>;
    await winner.observer.beforeDispatch?.(result.value);
    await winner.observer.settle(result.value, {
      cached: false,
      failed: false,
      costCents: 0,
      quantity: 1,
      providerRequestId: "native-request",
    });
    const charges = await db.$queryRawUnsafe<{ count: bigint }[]>(
      "SELECT count(*) FROM payment_fixture_charges",
    );
    expect(charges[0].count).toBe(1n);
    await expect(make().observer.begin()).rejects.toThrow();
    expect(await db.meteringUsageEvidence.count()).toBe(1);
  });
  it("retained native receipt survives connection source change", async () => {
    const evidence = await db.meteringUsageEvidence.findFirstOrThrow();
    await db.$executeRaw`UPDATE provider_connections SET "credentialSource" = ${"hosted"} WHERE id=${"connection"}`;
    const option = (await prepareActionPayment(input))!.quote.option;
    const part = await readPaymentPart(option, provider.payment!, { attemptIds: [evidence.id] });
    expect(part.charge).toMatchObject({
      value: "1",
      unit: { key: "queries" },
      certainty: "measured",
    });
    await db.$executeRaw`UPDATE provider_connections SET "credentialSource" = ${"own"} WHERE id=${"connection"}`;
  });
  it("accepted free-cache miss creates no attempt or permit", async () => {
    const preview = (await prepareActionPayment({
      ...input,
      children: [{ ...input.children[0], cached: true }],
    }))!;
    const run = (await prepareActionPayment({
      ...input,
      acceptedPayment: { quoteToken: preview.quote.quoteToken },
    }))!;
    const before = await db.meteringUsageEvidence.count();
    expect(() => run.child("source")).toThrow("payment_quote_changed");
    expect(await db.meteringUsageEvidence.count()).toBe(before);
  });
});
