import "server-only";
import type { AdminPageData, AdminSearch } from "@/lib/instance-admin/page-data";
import type { ReactNode } from "react";
export type AdminPageExtensionProps = {
  view: string;
  params: AdminSearch;
  data: AdminPageData;
  failed: boolean;
  dangerousActionsAllowed: boolean;
  children: ReactNode;
};
export async function extendAdminPage({ children }: AdminPageExtensionProps) {
  return children;
}
