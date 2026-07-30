import "server-only";

import type { EmailCapacityMeter } from "@/lib/auth/signin-capacity-types";
import { prisma } from "@/lib/db/prisma";
import { isCloud } from "@/lib/deployment/deployment";
import { resolveSesRegion, sesClientFor } from "@/lib/email/providers/ses";
import { resolveEmailProvider } from "@/lib/email/registry";
import { emailCounterUtcDay } from "@/lib/email/send-counter";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getInstanceSettings, type InstanceSettings } from "@/lib/instance-settings";
import { GetAccountCommand } from "@aws-sdk/client-sesv2";
import { unstable_cache } from "next/cache";

const CAPACITY_CACHE_SECONDS = 60;

type CounterClient = {
  dailySendCounter: {
    aggregate(
      args: Prisma.DailySendCounterAggregateArgs,
    ): Promise<{ _sum?: { count?: number | null } | null }>;
    findUnique(args: Prisma.DailySendCounterFindUniqueArgs): Promise<{ count: number } | null>;
    updateMany(args: Prisma.DailySendCounterUpdateManyArgs): Promise<{ count: number }>;
    upsert(args: Prisma.DailySendCounterUpsertArgs): Promise<unknown>;
  };
};

type SesQuota = {
  cap: number;
  providerLeft: number;
};

type UsageReader = (start: Date, end: Date) => Promise<number>;
type SettingsReader = () => Promise<InstanceSettings>;
type SesQuotaReader = () => Promise<SesQuota | null>;

export function capacityUtcDay(now = new Date()) {
  return emailCounterUtcDay(now);
}

export function capacityUtcMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { end, start };
}

async function aggregateSendCount(start: Date, end: Date, client: CounterClient = prisma) {
  const result = await client.dailySendCounter.aggregate({
    _sum: { count: true },
    where: { day: { gte: start, lt: end } },
  });
  return result._sum?.count ?? 0;
}

const readMonthlyUsageCached = unstable_cache(
  (startIso: string, endIso: string) => aggregateSendCount(new Date(startIso), new Date(endIso)),
  ["signin-capacity-monthly-usage"],
  { revalidate: CAPACITY_CACHE_SECONDS },
);

async function readSesQuota(): Promise<SesQuota | null> {
  try {
    const region = resolveSesRegion();
    if (!region) {
      return null;
    }
    const account = await sesClientFor(region).send(new GetAccountCommand({}));
    const maximum = account.SendQuota?.Max24HourSend;
    const sent = account.SendQuota?.SentLast24Hours;
    if (!Number.isFinite(maximum) || !Number.isFinite(sent)) {
      return null;
    }
    const cap = Math.max(0, Math.floor(maximum ?? 0));
    return {
      cap,
      providerLeft: Math.floor(Math.max(0, (maximum ?? 0) - (sent ?? 0))),
    };
  } catch {
    return null;
  }
}

const readSesQuotaCached = unstable_cache(readSesQuota, ["signin-capacity-ses-quota"], {
  revalidate: CAPACITY_CACHE_SECONDS,
});

function selectedProvider() {
  try {
    const provider = resolveEmailProvider();
    return provider?.isConfigured() ? provider.id : null;
  } catch {
    return null;
  }
}

function resendMeter(
  settings: InstanceSettings,
  dailyUsed: number,
  monthlyUsed: number,
): EmailCapacityMeter {
  const dailyLeft = Math.max(0, settings.email_daily_send_cap - dailyUsed);
  const monthlyLeft = Math.max(0, settings.email_monthly_send_cap - monthlyUsed);
  if (monthlyLeft <= dailyLeft) {
    return {
      binding: "monthly",
      cap: settings.email_monthly_send_cap,
      left: monthlyLeft,
    };
  }
  return { binding: "daily", cap: settings.email_daily_send_cap, left: dailyLeft };
}

export async function readEmailSignInCapacity(
  now = new Date(),
  client: CounterClient = prisma,
  settingsReader: SettingsReader = getInstanceSettings,
  monthlyUsageReader: UsageReader = (start, end) =>
    readMonthlyUsageCached(start.toISOString(), end.toISOString()),
  sesQuotaReader: SesQuotaReader = readSesQuotaCached,
): Promise<EmailCapacityMeter | null> {
  const provider = selectedProvider();
  if (provider === "resend") {
    const day = capacityUtcDay(now);
    const month = capacityUtcMonth(now);
    const [counter, settings, monthlyUsed] = await Promise.all([
      client.dailySendCounter.findUnique({ select: { count: true }, where: { day } }),
      settingsReader(),
      monthlyUsageReader(month.start, month.end),
    ]);
    return resendMeter(settings, counter?.count ?? 0, monthlyUsed);
  }
  if (provider !== "ses") {
    return null;
  }

  const day = capacityUtcDay(now);
  const [counter, quota] = await Promise.all([
    client.dailySendCounter.findUnique({ select: { count: true }, where: { day } }),
    sesQuotaReader(),
  ]);
  if (!quota) {
    return null;
  }
  return {
    binding: "daily",
    cap: quota.cap,
    left: Math.min(quota.providerLeft, Math.max(0, quota.cap - (counter?.count ?? 0))),
  };
}

async function reserveAtLimit(day: Date, limit: number, client: CounterClient) {
  await client.dailySendCounter.upsert({
    create: { day },
    update: {},
    where: { day },
  });
  const reservation = await client.dailySendCounter.updateMany({
    data: { count: { increment: 1 } },
    where: { count: { lt: limit }, day },
  });
  return reservation.count === 1;
}

export async function reserveEmailSignInCode(
  now = new Date(),
  client: CounterClient = prisma,
  settingsReader: SettingsReader = getInstanceSettings,
  completedDaysUsageReader: UsageReader = (start, end) => aggregateSendCount(start, end, client),
  sesQuotaReader: SesQuotaReader = readSesQuotaCached,
) {
  if (!isCloud) {
    return { binding: null, gated: false, granted: true };
  }

  const provider = selectedProvider();
  const day = capacityUtcDay(now);
  if (provider === "resend") {
    const month = capacityUtcMonth(now);
    const [settings, completedDaysUsed] = await Promise.all([
      settingsReader(),
      completedDaysUsageReader(month.start, day),
    ]);
    const monthlyAllowanceToday = Math.max(0, settings.email_monthly_send_cap - completedDaysUsed);
    const binding = monthlyAllowanceToday <= settings.email_daily_send_cap ? "monthly" : "daily";
    const limit = Math.min(settings.email_daily_send_cap, monthlyAllowanceToday);
    const granted = await reserveAtLimit(day, limit, client);
    return { binding, gated: true, granted };
  }
  if (provider !== "ses") {
    return { binding: null, gated: false, granted: true };
  }

  const quota = await sesQuotaReader();
  if (!quota) {
    return { binding: null, gated: false, granted: true };
  }
  return {
    binding: "daily" as const,
    gated: true,
    granted: await reserveAtLimit(day, quota.cap, client),
  };
}
