import { parsePublicId } from "@/lib/db/public-id";
import type { CloudBackupCounts } from "@/lib/migration/cloud-backup-sections";
import { z } from "zod";

const idSchema = z.string().min(1).max(160);
const strictPublicId = (prefix: "ferry" | "prj") =>
  idSchema.refine((value) => parsePublicId(value)?.prefix === prefix, {
    message: `Expected a strict ${prefix}_ v3 public ID.`,
  });

export const migrationScopeValues = ["full", "keywords"] as const;

export const mintMigrationTokenFormSchema = z.object({
  projectId: strictPublicId("prj"),
  scope: z.enum(migrationScopeValues),
});

export const revokeMigrationTokenFormSchema = z.object({
  projectId: strictPublicId("prj"),
  tokenId: strictPublicId("ferry").optional(),
});

export type MintMigrationTokenForm = z.infer<typeof mintMigrationTokenFormSchema>;
export type RevokeMigrationTokenForm = z.infer<typeof revokeMigrationTokenFormSchema>;

export type IssuedMigrationToken = {
  createdAt: string;
  expiresAt: string;
  id: string;
  importJob: CloudImportJobData;
  scope: "full" | "keywords";
  singleUse: boolean;
  token: string;
};

export type ActiveMigrationToken = {
  createdAt: string;
  createdBy: { email: string; name: string };
  expiresAt: string;
  id: string;
  scope: "full" | "keywords";
  singleUse: boolean;
};

export type CloudImportJobData = {
  counts: unknown;
  createdAt: string | null;
  error: string | null;
  finishedAt: string | null;
  id: string | null;
  progress: number;
  startedAt: string | null;
  state: "idle" | "receiving" | "importing" | "done" | "failed";
};

export type CloudImportPackageFile = {
  content: string;
  counts: CloudBackupCounts;
  filename: string;
  mimeType: string;
};

export function expiresInLabel(expiresAt: string) {
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));

  if (minutes === 0) {
    return "Expires now";
  }
  if (minutes === 1) {
    return "Expires in 1 min";
  }
  return `Expires in ${minutes} min`;
}
