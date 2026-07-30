import type { GridDensity } from "@mui/x-data-grid";

const renderedRowHeights = {
  compact: 56,
  comfortable: 78,
  standard: 68,
} satisfies Record<GridDensity, number>;

export function renderedRowHeightForDensity(density: GridDensity) {
  return renderedRowHeights[density];
}
