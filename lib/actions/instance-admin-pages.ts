"use server";
import { getOssAccount } from "@/lib/queries/admin/oss-accounts";
/** Retains the core lookup budget, neutral fields and append-only lookup audit. */
export async function lookupOssAdminAccount(identifier: string) {
  return getOssAccount(identifier);
}
