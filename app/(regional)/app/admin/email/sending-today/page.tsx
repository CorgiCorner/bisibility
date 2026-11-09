import { OssAdminPage } from "@/components/admin/pages/OssAdminPage";
import type { AdminSearch } from "@/lib/instance-admin/page-data";
export default function Page({ searchParams }: { searchParams?: Promise<AdminSearch> }) {
  return OssAdminPage({ view: "Sending today", searchParams });
}
