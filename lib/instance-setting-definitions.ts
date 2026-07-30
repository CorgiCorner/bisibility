export const INSTANCE_SETTING_DEFAULTS = {
  email_daily_send_cap: 100,
  email_monthly_send_cap: 3_000,
  google_signup_cap: 100,
} as const;

export type InstanceSettingKey = keyof typeof INSTANCE_SETTING_DEFAULTS;

export const INSTANCE_SETTING_KEYS = Object.keys(INSTANCE_SETTING_DEFAULTS) as InstanceSettingKey[];

const parsers: Record<InstanceSettingKey, (value: string) => number | null> = {
  email_daily_send_cap: positiveInteger,
  email_monthly_send_cap: positiveInteger,
  google_signup_cap: positiveInteger,
};

function positiveInteger(value: string) {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseInstanceSettingValue(key: InstanceSettingKey, value: string) {
  return parsers[key](value);
}

export function isInstanceSettingKey(value: string): value is InstanceSettingKey {
  return Object.hasOwn(INSTANCE_SETTING_DEFAULTS, value);
}
