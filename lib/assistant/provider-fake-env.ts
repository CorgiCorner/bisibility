import "server-only";

/**
 * The development fixture switch, kept apart from the fixture model so that access checks and
 * key resolution can read it without loading the model SDK.
 */
const MAX_FAKE_DELAY_MS = 2000;

/** `1` enables the fixture. A larger integer also sets the per-event delay, capped at 2000ms. */
export function assistantDevFakeProvider(): { enabled: boolean; delayMs: number } {
  const raw = process.env.ASSISTANT_DEV_FAKE_PROVIDER;
  if (!raw || !/^[1-9]\d{0,9}$/.test(raw)) return { enabled: false, delayMs: 0 };
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return { enabled: false, delayMs: 0 };
  return { enabled: true, delayMs: value === 1 ? 0 : Math.min(value, MAX_FAKE_DELAY_MS) };
}

export function isAssistantFakeProviderEnabled() {
  return assistantDevFakeProvider().enabled && process.env.NODE_ENV !== "production";
}
