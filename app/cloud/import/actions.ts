"use server";

import { getCloudImportJobStatus } from "@/lib/queries/cloud";
import { z } from "zod";

const statusSchema = z.object({
  projectId: z.string().trim().min(1).max(160),
});

export async function pollCloudImportJob(input: unknown) {
  const data = statusSchema.parse(input);
  return getCloudImportJobStatus(data.projectId);
}
