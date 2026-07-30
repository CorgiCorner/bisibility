import "server-only";

import { currentAuthTransaction } from "@/lib/auth/auth-database";
import {
  capacityUtcDay,
  readEmailSignInCapacity,
  reserveEmailSignInCode,
} from "@/lib/auth/email-signin-capacity";
import { GOOGLE_CAPACITY_EXHAUSTED, type SignInCapacity } from "@/lib/auth/signin-capacity-types";
import { prisma } from "@/lib/db/prisma";
import { isCloud } from "@/lib/deployment/deployment";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  getInstanceSetting,
  getInstanceSettings,
  type InstanceSettings,
} from "@/lib/instance-settings";
import { APIError } from "better-auth/api";
import { unstable_cache } from "next/cache";

const GOOGLE_CAPACITY_LOCK_ID = 802_693_279;
const CAPACITY_CACHE_SECONDS = 60;

type CapacityClient = {
  account: { count(args: Prisma.AccountCountArgs): Promise<number> };
  user: { count(args: Prisma.UserCountArgs): Promise<number> };
};
type GoogleGateClient = {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  account: { count(args: Prisma.AccountCountArgs): Promise<number> };
};

export { capacityUtcDay, reserveEmailSignInCode };

export async function readSignInCapacity(
  now = new Date(),
  client: CapacityClient = prisma,
  settingsReader: () => Promise<InstanceSettings> = getInstanceSettings,
  emailCapacityReader: () => Promise<SignInCapacity["emailCodes"]> = () =>
    readEmailSignInCapacity(now),
): Promise<SignInCapacity> {
  const day = capacityUtcDay(now);
  const [googleUsed, signupsToday, settings, emailCodes] = await Promise.all([
    client.account.count({ where: { providerId: "google" } }),
    client.user.count({ where: { createdAt: { gte: day } } }),
    settingsReader(),
    emailCapacityReader(),
  ]);

  return {
    emailCodes,
    googleSpots: {
      cap: settings.google_signup_cap,
      left: Math.max(0, settings.google_signup_cap - googleUsed),
    },
    signupsToday,
  };
}

export const getSignInCapacity = unstable_cache(() => readSignInCapacity(), ["signin-capacity"], {
  revalidate: CAPACITY_CACHE_SECONDS,
});

type GoogleAccountCreation = {
  providerId: string;
};

export async function enforceGoogleSignupCapacity(
  account: GoogleAccountCreation,
  _context?: unknown,
  client: GoogleGateClient | null = currentAuthTransaction(),
  capReader: () => Promise<number> = () => getInstanceSetting("google_signup_cap"),
) {
  if (!isCloud || account.providerId !== "google") {
    return;
  }

  const gateClient = client ?? (prisma as PrismaClient);
  const cap = await capReader();
  await gateClient.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${GOOGLE_CAPACITY_LOCK_ID})`,
  );
  const used = await gateClient.account.count({ where: { providerId: "google" } });

  if (used >= cap) {
    throw new APIError("TOO_MANY_REQUESTS", {
      code: GOOGLE_CAPACITY_EXHAUSTED,
      message: GOOGLE_CAPACITY_EXHAUSTED,
    });
  }
}
