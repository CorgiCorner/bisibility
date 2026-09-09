import type { DataTableDensity } from "@/components/ui/data-table/data-table-types";
import { PREFERENCE_COOKIES } from "@/lib/account/preferences-shared";

export function persistKeywordGridDensity(density: DataTableDensity) {
  // biome-ignore lint/suspicious/noDocumentCookie: density preference must be written synchronously from the user event.
  document.cookie = `${PREFERENCE_COOKIES.density}=${density}; path=/; max-age=31536000; SameSite=Lax`;
}
