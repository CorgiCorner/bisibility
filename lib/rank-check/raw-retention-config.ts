import { deploymentMode } from "@/lib/deployment/deployment";
import { z } from "zod";
import { DEFAULT_CLOUD_RETENTION_DAYS } from "./raw-retention-types";
export const retentionDaysSchema = z.coerce.number().int().min(1).max(3650);
export function getRankCheckRawRetentionDays() {
  if (deploymentMode() === "cloud") return DEFAULT_CLOUD_RETENTION_DAYS;
  const raw = process.env.RANK_CHECK_RAW_RETENTION_DAYS?.trim();
  if (!raw || raw.toLowerCase() === "unlimited") return null;
  return retentionDaysSchema.parse(raw);
}
