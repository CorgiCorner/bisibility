export const readProjectDataCache = async () => ({
  ttlSeconds: 43200,
  page: { available: true, entries: [], cursor: "0" },
});
export const saveProjectDataCache = async (input: { ttlSeconds: number | null }) => ({
  kind: "saved" as const,
  ttlSeconds: input.ttlSeconds,
});
export const deleteProjectDataCache = async () => ({ kind: "removed" as const });
