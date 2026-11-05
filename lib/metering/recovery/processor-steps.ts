const LOG_WINDOW_MS = 10 * 60_000;
const seen = new Map<string, { at: number; suppressed: number }>();

export function resetRecoveryStepLog() {
  seen.clear();
}

/** A bounded, secret-free classification: a short error code or the error class name. */
function failureCode(error: unknown) {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,48}$/.test(code)) return code;
    if (typeof name === "string" && /^[A-Za-z0-9_]{1,48}$/.test(name)) return name;
  }
  return "unknown";
}

/** Logs one failure per step and code per window; messages (which may carry data) are dropped. */
export function logRecoveryFailure(step: string, error: unknown, now = Date.now()) {
  const code = failureCode(error);
  const key = `${step}:${code}`;
  const previous = seen.get(key);
  if (previous && now - previous.at < LOG_WINDOW_MS) {
    previous.suppressed++;
    return;
  }
  const name = (error as { name?: unknown } | null)?.name;
  console.error("[metering] recovery worker requires retry", {
    step,
    code,
    ...(typeof name === "string" && /^[A-Za-z0-9_]{1,48}$/.test(name) && name !== code
      ? { name }
      : {}),
    suppressed: previous?.suppressed ?? 0,
  });
  seen.set(key, { at: now, suppressed: 0 });
}

/**
 * One failing step never starves the others. The failure is logged once per step and code per
 * window with the count of suppressed repeats.
 */
export async function runRecoveryStep(step: string, work: () => Promise<unknown>, now?: number) {
  try {
    await work();
    return true;
  } catch (error) {
    logRecoveryFailure(step, error, now);
    return false;
  }
}
