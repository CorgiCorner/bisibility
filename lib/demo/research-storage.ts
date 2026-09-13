import { readDemoConfig } from "./config";

const FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

type DemoEnvironment = Record<string, string | undefined>;

function validTimestamp(value: Date | string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isEditableDemoResearchProject(
  projectPublicId: string,
  env: DemoEnvironment = process.env,
) {
  try {
    const config = readDemoConfig(env);
    return config.kind === "editable" && config.projectPublicId === projectPublicId;
  } catch {
    return false;
  }
}

export function demoResearchFreshUntil(values: readonly (Date | string)[]) {
  const timestamps = values.flatMap((value) => {
    const timestamp = validTimestamp(value);
    return timestamp === null ? [] : [timestamp];
  });
  if (timestamps.length === 0) return null;
  return new Date(Math.min(...timestamps) + FRESHNESS_MS);
}

export function demoResearchStorageState(input: {
  freshUntil: Date | string;
  now?: Date;
  savedAt: Date | string;
}) {
  return {
    freshUntil: new Date(input.freshUntil).toISOString(),
    savedAt: new Date(input.savedAt).toISOString(),
    stale: new Date(input.freshUntil).getTime() <= (input.now ?? new Date()).getTime(),
  };
}
