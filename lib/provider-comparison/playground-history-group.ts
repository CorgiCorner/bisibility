export type PlaygroundHistorySource = {
  aiOverview: boolean;
  cents: number | null;
  createdAt: string;
  device: "desktop" | "mobile";
  id: string;
  locationId: string;
  market: string;
  text: string;
};

export type PlaygroundSearch = { text: string; device: string; locationId: string };
export const playgroundSearchKey = (search: PlaygroundSearch) =>
  JSON.stringify([search.text, search.device, search.locationId]);

export type GroupedPlaygroundHistory = Omit<PlaygroundHistorySource, "aiOverview"> & {
  overviewFetched?: true;
};

function combineCents(values: Array<number | null>): number | null {
  if (values.some((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** Overview runs mark searches with their exact identity, never add history rows. */
export function groupPlaygroundHistory(
  sources: readonly PlaygroundHistorySource[],
): GroupedPlaygroundHistory[] {
  const organic = sources.filter((source) => !source.aiOverview);
  const overviews = sources.filter((source) => source.aiOverview);
  return organic.map(({ aiOverview: _, ...run }) => {
    const matches = overviews.filter(
      (overview) => playgroundSearchKey(overview) === playgroundSearchKey(run),
    );
    return {
      ...run,
      ...(matches.length ? { overviewFetched: true as const } : {}),
      cents: combineCents([run.cents, ...matches.map((match) => match.cents)]),
    };
  });
}
