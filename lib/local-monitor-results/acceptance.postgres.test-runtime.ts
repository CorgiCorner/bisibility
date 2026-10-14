import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, vi } from "vitest";

const owned = vi.hoisted(() => ({
  db: null as PrismaClient | null,
  actor: null as { id: string } | null,
}));
// Redirect only host composition to the same full-schema owned DB; readers and grants stay real.
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, property) {
        if (!owned.db) throw new Error("Owned Local acceptance database is not bound.");
        const value = Reflect.get(owned.db, property, owned.db);
        return typeof value === "function" ? value.bind(owned.db) : value;
      },
    },
  ),
}));
vi.mock("@/lib/actions/_shared", async () => ({
  getActionActor: async () => owned.actor,
  makePublicId: (await import("@/lib/db/public-id")).makePublicId,
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: async () => ({ mode: "polling", ok: true }),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T12:00:00.000Z"));
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  vi.stubEnv("DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "60");
  vi.stubEnv("DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "3600");
});
afterEach(() => {
  owned.db = null;
  owned.actor = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
export function bindAcceptanceDatabase(db: PrismaClient, actorId: string) {
  owned.db = db;
  owned.actor = { id: actorId };
}
