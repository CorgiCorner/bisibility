import { AdminShell } from "@/components/admin/AdminShell";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import type { ReactNode } from "react";

export default async function InstanceAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireInstanceAdmin();

  return <AdminShell>{children}</AdminShell>;
}
