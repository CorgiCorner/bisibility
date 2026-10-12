"use server";
import { getMeteringAdminPage } from "@/lib/metering/admin-service";
export async function loadMeteringAdminPageAction(input: {
  month: string;
  project?: string;
  usageCursor?: string;
  exceptionCursor?: string;
}) {
  return getMeteringAdminPage(input);
}
