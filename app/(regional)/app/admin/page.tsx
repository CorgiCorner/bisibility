import { redirectLegacyAdmin } from "@/lib/instance-admin/legacy-redirect";
import type { AdminSearch } from "@/lib/instance-admin/page-data";

export default async function Page({ searchParams }: { searchParams?: Promise<AdminSearch> } = {}) {
  return redirectLegacyAdmin("", searchParams);
}
