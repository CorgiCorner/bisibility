import "server-only";
import type { AdminSearch } from "@/lib/instance-admin/page-data";

/** Self-hosted redirects use only the shared destination map. */
export function legacyAdminDestination(_path: string, _params: AdminSearch): string | undefined {
  return undefined;
}
