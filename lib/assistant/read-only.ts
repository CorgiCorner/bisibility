import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";

/** Read-only roles and read-only projects get read tools only; the server re-checks on every call. */
export function assistantReadOnly(writeMode: string | null | undefined, role: Role) {
  return isProjectReadOnly(writeMode) || role === "viewer" || role === "auditor";
}
