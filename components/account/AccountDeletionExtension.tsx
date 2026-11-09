import "server-only";
import type { ReactNode } from "react";

export async function AccountDeletionExtension({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
