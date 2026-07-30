const REQUIRED_CONSECUTIVE_SUCCESSES = 2;

function probeWithin(probe, timeoutMs) {
  const controller = new AbortController();
  let timer;
  return Promise.race([
    Promise.resolve()
      .then(() => probe(controller.signal))
      .then((succeeded) => controller.signal.aborted === false && succeeded === true),
    new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function waitForUsableService(
  serviceName,
  probe,
  { intervalMs = 750, probeTimeoutMs = 5_000, timeoutMs = 60_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let consecutiveSuccesses = 0;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    let succeeded = false;
    try {
      succeeded = (await probeWithin(probe, Math.min(probeTimeoutMs, remainingMs))) === true;
    } catch {
      succeeded = false;
    }

    consecutiveSuccesses = succeeded ? consecutiveSuccesses + 1 : 0;
    if (consecutiveSuccesses >= REQUIRED_CONSECUTIVE_SUCCESSES) return;

    const pauseMs = Math.min(intervalMs, deadline - Date.now());
    if (pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  throw new Error(`${serviceName} did not become usable within ${timeoutMs}ms.`);
}
