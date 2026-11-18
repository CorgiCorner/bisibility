import "server-only";

/** Roll workers with the delivery registry before enabling this app-only switch. */
export function modelPlaygroundWorkerEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    env.MODEL_PLAYGROUND_WORKER_ENABLED === "1" || env.MODEL_PLAYGROUND_WORKER_ENABLED === "true"
  );
}
