import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  fencePaidAttemptsInTransaction,
  markPaidAttemptDispatch,
  reservePaidAttempts,
} from "@/lib/metering/admission";
import { input, required } from "@/lib/metering/paid-attempt-test-fixture";
import { PrismaPg } from "@prisma/adapter-pg";
import { createManualClock } from "@usagekit/store";
import { createPostgresStore } from "./index";
import { interceptExecute } from "./intercept-execute.test-fixture.ts";
import { command, receipt, request } from "./test-data";

const url = process.env.METERING_TEST_DATABASE_URL;
const schema = process.env.METERING_TEST_SCHEMA;
if (!url || !schema || new URL(url).hostname !== "127.0.0.1")
  throw new Error("Isolated local metering test configuration required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const phase = process.env.METERING_CRASH_PHASE;
if (phase?.startsWith("history_")) {
  await import("@/lib/metering/history-crash-test-process");
  throw new Error("Historical crash barrier was not reached");
}
async function barrier(payload = {}) {
  process.on("message", () => {});
  process.send?.({ ready: true, ...payload });
  await new Promise<void>(() => {});
}
if (phase === "queued_preparation" || phase === "after_http") {
  const options = { clock: createManualClock(), verifyBinding: async () => {} };
  const run = <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(schema)}`);
      let contexts = 0;
      const proxy = new Proxy(tx, {
        get(target, key) {
          if (key !== "$executeRaw") return Reflect.get(target, key);
          return async (...args: Parameters<typeof tx.$executeRaw>) => {
            const result = await tx.$executeRaw(...args);
            const query = args[0] as Prisma.Sql | TemplateStringsArray;
            const text = "strings" in query ? query.strings.join("") : Array.from(query).join("");
            if (
              text.includes("INSERT INTO metering_paid_attempt_context") &&
              ++contexts === 2 &&
              phase === "queued_preparation"
            )
              await barrier();
            return result;
          };
        },
      });
      return body(proxy);
    });
  if (phase === "queued_preparation") {
    await run((tx) => reservePaidAttempts(tx, [input("a"), input("b")], options));
    throw new Error("Queued crash barrier was not reached");
  }
  const providerUrl = process.env.METERING_TEST_PROVIDER_URL;
  if (!providerUrl || new URL(providerUrl).hostname !== "127.0.0.1")
    throw new Error("Local fixture provider required");
  const [reservation] = await run((tx) => reservePaidAttempts(tx, [input("paid-http")], options));
  const grant = await run((tx) =>
    markPaidAttemptDispatch(tx, required(reservation), "worker", options),
  );
  await run((tx) => fencePaidAttemptsInTransaction(tx, [grant], options));
  await fetch(providerUrl, { method: "POST" });
  await barrier();
}
const db = new Proxy(prisma, {
  get(target, key) {
    if (key !== "$transaction" || phase !== "before_reservation_commit")
      return Reflect.get(target, key);
    return <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
      prisma.$transaction(async (tx) => {
        return body(
          interceptExecute(tx, async (text, execute) => {
            const result = await execute();
            if (text.includes("INSERT INTO metering_operation")) await barrier();
            return result;
          }),
        );
      });
  },
});
const store = await createPostgresStore({ prisma: db, schema, clock: createManualClock() });
const reserved = await store.reserve(request("crash-operation"));
if (reserved.outcome !== "reserved") throw new Error("Reservation failed");
if (phase === "after_reservation_commit") await barrier();
const grant = await store.markDispatchIntent({
  ...command(reserved.operation),
  holder: "child",
  leaseTtlMs: 60000,
});
if (!("granted" in grant) || !grant.granted) throw new Error("Intent failed");
await store.settle({
  ...command(grant.operation),
  commandId: "settlement",
  authority: { kind: "lease", leaseId: grant.lease.leaseId },
  receipt: { ...receipt(), id: "native" },
});
await barrier({ expectedVersion: grant.operation.version, leaseId: grant.lease.leaseId });
