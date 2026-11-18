import { createHash } from "node:crypto";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import type { DataSyncKind } from "@/lib/schedules/types";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const BODY = "abcdefghijklmnopqrstuvwxyz0123456789";
const DATA_SYNC_PUBLIC_ID = /^dsy_[a-z][a-z0-9]{23}$/;
const NATIVE_PREFIXES = ["ais", "lmn", "sch"] as const;
const DATA_SYNC_KINDS = {
  domain_rating: true,
  page_indexing: true,
  search_console: true,
  sitemap: true,
} as const satisfies Record<DataSyncKind, true>;
const dataSyncKinds = Object.keys(DATA_SYNC_KINDS) as DataSyncKind[];
const internalDataSyncId = new RegExp(
  `^sync:(prj_[a-z][a-z0-9]{23}):(${dataSyncKinds.join("|")})$`,
);

/**
 * Stable public ID for one data sync. The digest covers the project public ID and sync kind
 * only, so the result does not contain an internal database ID.
 */
export function dataSyncPublicId(projectPublicId: string, kind: DataSyncKind): string {
  if (!isPublicIdOfType(projectPublicId, "prj")) {
    throw new Error("Data sync public IDs are derived from a public project ID.");
  }
  const digest = createHash("sha256")
    .update("bisibility:data-sync-public-id")
    .update("\0")
    .update(projectPublicId)
    .update("\0")
    .update(kind)
    .digest();
  let value = BigInt(`0x${digest.toString("hex")}`);
  const chars = Array<string>(24);
  chars[0] = LETTERS[Number(value % 26n)];
  value /= 26n;
  for (let index = 1; index < 24; index += 1) {
    chars[index] = BODY[Number(value % 36n)];
    value /= 36n;
  }
  return `dsy_${chars.join("")}`;
}

export function isDataSyncPublicId(value: string) {
  return DATA_SYNC_PUBLIC_ID.test(value);
}

export function isNativeSchedulePublicId(value: string) {
  return NATIVE_PREFIXES.some((prefix) => isPublicIdOfType(value, prefix));
}

export function isPublicScheduleId(value: string) {
  return isNativeSchedulePublicId(value) || isDataSyncPublicId(value);
}

export function parseInternalDataSyncId(value: string) {
  const match = internalDataSyncId.exec(value);
  if (!match || !isPublicIdOfType(match[1], "prj")) return null;
  return { kind: match[2] as DataSyncKind, projectPublicId: match[1] };
}

/** Map a public schedule ID back to the service ID for this project, or null when it is not one. */
export function internalScheduleId(projectPublicId: string, publicId: string): string | null {
  if (isNativeSchedulePublicId(publicId)) return publicId;
  if (!isDataSyncPublicId(publicId) || !isPublicIdOfType(projectPublicId, "prj")) return null;
  for (const kind of dataSyncKinds) {
    if (dataSyncPublicId(projectPublicId, kind) === publicId) {
      return `sync:${projectPublicId}:${kind}`;
    }
  }
  return null;
}
