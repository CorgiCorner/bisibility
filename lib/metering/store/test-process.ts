import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createManualClock } from "@usagekit/store";
import { createPostgresStore } from "./index";
import { command, request } from "./test-data";

const url = process.env.METERING_TEST_DATABASE_URL;
const schema = process.env.METERING_TEST_SCHEMA;
if (!url || !schema || new URL(url).hostname !== "127.0.0.1")
  throw new Error("Isolated local metering test configuration required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const clock = createManualClock();
const store = await createPostgresStore({ prisma, schema, clock });
const r = await store.reserve(request("restart-operation"));
if (r.outcome !== "reserved") throw new Error("Reservation failed");
const g = await store.markDispatchIntent({
  ...command(r.operation),
  holder: "child",
  leaseTtlMs: 60000,
});
if (!("granted" in g) || !g.granted) throw new Error("Intent failed");
process.on("message", () => {});
process.send?.({ ready: true, leaseId: g.lease.leaseId });
