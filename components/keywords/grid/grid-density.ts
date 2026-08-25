import { PREFERENCE_COOKIES } from "@/lib/account/preferences-shared";
import type { GridDensity } from "@mui/x-data-grid";

const renderedRowHeights = {
  compact: 56,
  comfortable: 78,
  standard: 68,
} satisfies Record<GridDensity, number>;

export function renderedRowHeightForDensity(density: GridDensity) {
  return renderedRowHeights[density];
}

export function persistKeywordGridDensity(density: GridDensity) {
  // biome-ignore lint/suspicious/noDocumentCookie: density preference must be written synchronously from the user event.
  document.cookie = `${PREFERENCE_COOKIES.density}=${density}; path=/; max-age=31536000; SameSite=Lax`;
}
