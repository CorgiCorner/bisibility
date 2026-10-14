import { cloneTablePresentation, type TablePresentation } from "./presentation-model";

/** The caller supplies an access-filtered registry; restricted column labels never enter this port. */
export type PresentationColumn = {
  defaultVisible: boolean;
  defaultWidth: number;
  id: string;
  lockedVisible?: boolean;
  maxWidth: number;
  minWidth: number;
};

export function resolveTablePresentation(
  registry: { columns: readonly PresentationColumn[]; version: number },
  stored?: TablePresentation | null,
) {
  const ids = registry.columns.map(({ id }) => id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Presentation registry IDs must be unique.");
  const known = new Set(ids);
  const source = stored ? cloneTablePresentation(stored) : null;
  const requested = source?.columnOrder ?? [];
  const columnOrder = [...new Set(requested.filter((id) => known.has(id)))];
  for (const id of ids) if (!columnOrder.includes(id)) columnOrder.push(id);
  const sizing: Record<string, number> = {};
  const visibility: Record<string, boolean> = {};
  for (const column of registry.columns) {
    if (
      !Number.isFinite(column.minWidth) ||
      !Number.isFinite(column.maxWidth) ||
      column.minWidth > column.maxWidth
    )
      throw new Error("Presentation registry width bounds must be valid.");
    const requestedWidth = source?.sizing[column.id];
    const width =
      requestedWidth !== undefined && Number.isFinite(requestedWidth)
        ? requestedWidth
        : column.defaultWidth;
    sizing[column.id] = Math.min(column.maxWidth, Math.max(column.minWidth, width));
    visibility[column.id] = Boolean(
      column.lockedVisible || (source?.visibility[column.id] ?? column.defaultVisible),
    );
  }
  const requestedIds = [
    ...requested,
    ...Object.keys(source?.sizing ?? {}),
    ...Object.keys(source?.visibility ?? {}),
  ];
  return {
    partial: Boolean(
      source &&
        (source.registryVersion !== registry.version || requestedIds.some((id) => !known.has(id))),
    ),
    presentation: {
      columnOrder,
      registryVersion: registry.version,
      sizing,
      version: 1 as const,
      visibility,
    },
  };
}

export function movePresentationColumn(
  order: readonly string[],
  id: string,
  direction: "up" | "down",
) {
  const next = [...order];
  const index = next.indexOf(id);
  const destination = index + (direction === "up" ? -1 : 1);
  if (index < 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
