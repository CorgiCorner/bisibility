import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { claimFirstTrafficSyncIntent } from "@/lib/traffic/first-sync-intent-claim";
import { dispatchFirstTrafficSyncIntent } from "@/lib/temporal/traffic-intent-dispatch";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function racingClientBarrier() {
  let readers = 0;
  let release: () => void = () => undefined;
  const bothSelected = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    $transaction(callback: (transaction: typeof prisma) => Promise<unknown>) {
      return prisma.$transaction(async (transaction) => {
        const providerConnection = new Proxy(transaction.providerConnection, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "findFirst" && typeof value === "function") {
              return async (args: unknown) => {
                const candidate = await value.call(target, args);
                readers += 1;
                if (readers === 2) release();
                await bothSelected;
                return candidate;
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const wrapped = new Proxy(transaction, {
          get(target, property) {
            if (property === "providerConnection") return providerConnection;
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return callback(wrapped as unknown as typeof prisma);
      });
    },
    providerConnection: prisma.providerConnection,
  };
}

export async function verifyTrafficFirstSyncIntentClaim() {
  const suffix = `${process.pid}_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `traffic-claim-${suffix}@example.test`,
      name: "Traffic claim test",
      publicId: makePublicId("usr"),
    },
  });
  try {
    const project = await prisma.project.create({
      data: {
        domain: "example.test",
        name: "Traffic claim test",
        ownerId: user.id,
        publicId: makePublicId("prj"),
      },
    });
    const requestedAt = new Date("2026-09-03T05:00:00.000Z");
    const connection = await prisma.providerConnection.create({
      data: {
        enabled: true,
        firstSyncRequestedAt: requestedAt,
        kind: "analytics",
        priority: 0,
        projectId: project.id,
        provider: "traffic-claim-test",
        publicId: makePublicId("conn"),
        status: "connected",
      },
    });
    let starts = 0;
    const now = new Date("2026-09-03T05:01:00.000Z");
    const client = racingClientBarrier();
    const previousTrafficSyncEnabled = process.env.TRAFFIC_SYNC_ENABLED;
    process.env.TRAFFIC_SYNC_ENABLED = "1";
    try {
      const start = async () => {
        starts += 1;
        return {
          runId: "run_1",
          workflowId: `traffic-first-sync:${connection.id}`,
        };
      };
      const results = await Promise.all([
        dispatchFirstTrafficSyncIntent({
          claim: () =>
            claimFirstTrafficSyncIntent({ client: client as never, now }),
          start,
        }),
        dispatchFirstTrafficSyncIntent({
          claim: () =>
            claimFirstTrafficSyncIntent({ client: client as never, now }),
          start,
        }),
      ]);
      const stored = await prisma.providerConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });

      assert(starts === 1, `Expected one workflow start, received ${starts}.`);
      assert(
        results.filter((result) => result.status === "started").length === 1,
        `Expected one started claimant, received ${JSON.stringify(results)}.`,
      );
      assert(
        stored.firstSyncStartedAt !== null,
        "Winning claim was not recorded.",
      );
      console.log(
        "Traffic first-sync concurrent claim passed: two racing dispatches, one workflow.",
      );
    } finally {
      if (previousTrafficSyncEnabled === undefined)
        delete process.env.TRAFFIC_SYNC_ENABLED;
      else process.env.TRAFFIC_SYNC_ENABLED = previousTrafficSyncEnabled;
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyTrafficFirstSyncIntentClaim()
    .finally(() => prisma.$disconnect())
    .catch((error) => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    });
}
