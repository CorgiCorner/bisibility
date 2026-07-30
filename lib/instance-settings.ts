import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  INSTANCE_SETTING_DEFAULTS,
  INSTANCE_SETTING_KEYS,
  type InstanceSettingKey,
  parseInstanceSettingValue,
} from "@/lib/instance-setting-definitions";
import { unstable_cache } from "next/cache";

const INSTANCE_SETTINGS_CACHE_SECONDS = 60;

type InstanceSettingsClient = Pick<Prisma.TransactionClient, "instanceSetting">;

export type InstanceSettings = Record<InstanceSettingKey, number>;

export async function readInstanceSettings(
  client: InstanceSettingsClient = prisma,
): Promise<InstanceSettings> {
  const rows = await client.instanceSetting.findMany({
    select: { key: true, value: true },
    where: { key: { in: INSTANCE_SETTING_KEYS } },
  });
  const values: InstanceSettings = { ...INSTANCE_SETTING_DEFAULTS };

  for (const row of rows) {
    const key = row.key as InstanceSettingKey;
    if (!INSTANCE_SETTING_KEYS.includes(key)) {
      continue;
    }
    values[key] = parseInstanceSettingValue(key, row.value) ?? INSTANCE_SETTING_DEFAULTS[key];
  }

  return values;
}

export const getInstanceSettings = unstable_cache(
  () => readInstanceSettings(),
  ["instance-settings"],
  { revalidate: INSTANCE_SETTINGS_CACHE_SECONDS },
);

export async function getInstanceSetting(key: InstanceSettingKey) {
  return (await getInstanceSettings())[key];
}
