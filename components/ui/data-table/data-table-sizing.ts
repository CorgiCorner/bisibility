export const DATA_TABLE_DEFAULT_COLUMN_SIZE = 150;
export const DATA_TABLE_DEFAULT_MIN_SIZE = 64;
export const DATA_TABLE_KEYBOARD_RESIZE_STEP = 8;
export const DATA_TABLE_WIDTH_VARIABLE = "--dt-table-width";
export const DATA_TABLE_VIEWPORT_WIDTH_VARIABLE = "--dt-viewport-width";

const DATA_TABLE_ENCODED_ID_PREFIX = "encoded--";
const SIMPLE_CSS_ID = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export type DataTableSizeInput = {
  flex?: number;
  id: string;
  maxSize?: number;
  minSize?: number;
  size?: number;
};

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function normalizeDataTableSize(
  value: number,
  minSize = DATA_TABLE_DEFAULT_MIN_SIZE,
  maxSize = Number.MAX_SAFE_INTEGER,
): number {
  const lower = Math.max(0, minSize);
  const upper = Math.max(lower, maxSize);
  const rounded = Math.round(finiteOr(value, lower) / 4) * 4;
  return Math.min(upper, Math.max(lower, rounded));
}

function initialWidth(column: DataTableSizeInput, sizing: Record<string, number>): number {
  return normalizeDataTableSize(
    sizing[column.id] ?? column.size ?? DATA_TABLE_DEFAULT_COLUMN_SIZE,
    column.minSize,
    column.maxSize,
  );
}

export function distributeDataTableWidths(
  columns: readonly DataTableSizeInput[],
  containerWidth: number,
  sizing: Record<string, number>,
): Record<string, number> {
  const widths = Object.fromEntries(
    columns.map((column) => [column.id, initialWidth(column, sizing)]),
  );
  let remaining = Math.max(0, containerWidth - Object.values(widths).reduce((a, b) => a + b, 0));
  const active = columns.filter(
    (column) => (column.flex ?? 0) > 0 && !Object.hasOwn(sizing, column.id),
  );
  const distributed = Object.fromEntries(active.map((column) => [column.id, 0]));

  while (remaining >= 4 && active.length > 0) {
    let next: DataTableSizeInput | undefined;
    let nextShare = Number.POSITIVE_INFINITY;
    for (const column of active) {
      if (widths[column.id] + 4 > (column.maxSize ?? Number.MAX_SAFE_INTEGER)) continue;
      const share = (distributed[column.id] + 4) / (column.flex ?? 1);
      if (share < nextShare) {
        next = column;
        nextShare = share;
      }
    }
    if (!next) break;
    widths[next.id] += 4;
    distributed[next.id] += 4;
    remaining -= 4;
  }

  return widths;
}

export function dataTableColumnCssId(id: string): string {
  if (SIMPLE_CSS_ID.test(id) && !id.startsWith(DATA_TABLE_ENCODED_ID_PREFIX)) return id;
  return `${DATA_TABLE_ENCODED_ID_PREFIX}${Array.from(id, (character) =>
    character.codePointAt(0)?.toString(16),
  ).join("-")}`;
}

export function dataTableColumnWidthVariable(id: string): string {
  return `--dt-col-${dataTableColumnCssId(id)}`;
}

export function dataTablePinnedOffsetVariable(id: string): string {
  return `--dt-pin-${dataTableColumnCssId(id)}`;
}
