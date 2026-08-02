export const FROZEN_NOW_ISO = "2026-07-10T23:00:00.000Z";
export const FROZEN_NOW_MS = Date.parse(FROZEN_NOW_ISO);
export const FROZEN_NOW = new Date(FROZEN_NOW_MS);

type TestClockOffset = {
  days?: number;
  hours?: number;
  milliseconds?: number;
  minutes?: number;
  seconds?: number;
};

export function dateFromFrozenNow({
  days = 0,
  hours = 0,
  milliseconds = 0,
  minutes = 0,
  seconds = 0,
}: TestClockOffset = {}) {
  const offsetMs =
    days * 24 * 60 * 60 * 1_000 +
    hours * 60 * 60 * 1_000 +
    minutes * 60 * 1_000 +
    seconds * 1_000 +
    milliseconds;

  return new Date(FROZEN_NOW_MS + offsetMs);
}

export function isoFromFrozenNow(offset: TestClockOffset = {}) {
  return dateFromFrozenNow(offset).toISOString();
}

export function dateOnlyFromFrozenNow(offset: TestClockOffset = {}) {
  return isoFromFrozenNow(offset).slice(0, 10);
}
