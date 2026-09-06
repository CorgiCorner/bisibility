import { fileURLToPath } from "node:url";
import { makePublicId } from "@/lib/db/public-id";
import { prisma } from "@/lib/db/prisma";
import { sweepWelcomeFollowupIntents } from "@/lib/temporal/welcome-intent-processor";

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
        const user = new Proxy(transaction.user, {
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
            if (property === "user") return user;
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return callback(wrapped as unknown as typeof prisma);
      });
    },
    user: prisma.user,
  };
}

export async function verifyWelcomeIntentProcessing() {
  const now = new Date();
  const suffix = `${process.pid}_${Date.now()}`;
  const pending = await prisma.user.create({
    data: {
      email: `welcome-race-${suffix}@example.test`,
      name: "Welcome race test",
      publicId: makePublicId("usr"),
      welcomeFollowupRequestedAt: new Date(now.getTime() - 60_000),
    },
  });
  const expired = await prisma.user.create({
    data: {
      email: `welcome-expired-${suffix}@example.test`,
      name: "Welcome expiry test",
      publicId: makePublicId("usr"),
      welcomeFollowupRequestedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
    },
  });
  try {
    let starts = 0;
    const startWorkflow = async () => {
      starts += 1;
    };
    const client = racingClientBarrier();
    const results = await Promise.all([
      sweepWelcomeFollowupIntents({
        client: client as never,
        limit: 1,
        startWorkflow,
      }),
      sweepWelcomeFollowupIntents({
        client: client as never,
        limit: 1,
        startWorkflow,
      }),
    ]);
    const [storedPending, storedExpired] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: pending.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: expired.id } }),
    ]);

    assert(starts === 1, `Expected one workflow start, received ${starts}.`);
    assert(storedPending.welcomeFollowupFinishedAt !== null, "Winning claim was not finished.");
    assert(storedExpired.welcomeFollowupExpiredAt !== null, "Eight-day intent was not expired.");
    assert(
      results.reduce((total, result) => total + result.expired, 0) === 1,
      `Expected one expired intent, received ${JSON.stringify(results)}.`,
    );
    console.log("Welcome intent PostgreSQL race passed: two claimants, one workflow start.");
    console.log("Welcome intent PostgreSQL expiry passed: eight-day intent expired, zero starts.");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [pending.id, expired.id] } } });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyWelcomeIntentProcessing()
    .finally(() => prisma.$disconnect())
    .catch((error) => {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    });
}
