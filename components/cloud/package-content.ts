import { parsePublicId } from "@/lib/db/public-id";
import {
  IMPORT_PACKAGE_MAX_BODY_BYTES,
  IMPORT_PACKAGE_MAX_KEYWORDS,
  keywordLimitDetail,
  payloadLimitDetail,
} from "@/lib/migration/package-limits";
import { readCloudWorkspaceManifest } from "@/lib/migration/workspace-package";

function packageRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function packageCounts(data: unknown) {
  const record = packageRecord(data) ?? {};
  const count = (key: string) => (Array.isArray(record[key]) ? record[key].length : 0);
  return {
    alertRules: count("alert_rules"),
    competitors: count("competitors"),
    keywords: count("keywords"),
    notificationPreferences: count("notification_preferences"),
    rankChecks: count("rank_checks"),
    savedViews: count("saved_views"),
  };
}

export function parsePackageContent(content: string) {
  assertPackageFileSize(new TextEncoder().encode(content).byteLength);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("Package must contain valid JSON.");
  }
  const envelope = packageRecord(parsed);
  if (envelope?.version !== 5) {
    throw new Error("Package must use the strict v5 transfer format.");
  }
  if (
    typeof envelope.project_id !== "string" ||
    parsePublicId(envelope.project_id)?.prefix !== "prj"
  ) {
    throw new Error("Package must contain a strict prj_ v3 project ID.");
  }
  const counts = packageCounts(parsed);
  if (counts.keywords > IMPORT_PACKAGE_MAX_KEYWORDS) {
    throw new Error(keywordLimitDetail(counts.keywords));
  }
  if (counts.keywords === 0) {
    throw new Error("Upload a JSON export package with at least one keyword.");
  }
  return { counts, parsed };
}

export function assertPackageFileSize(bytes: number) {
  if (bytes > IMPORT_PACKAGE_MAX_BODY_BYTES) {
    throw new Error(payloadLimitDetail(IMPORT_PACKAGE_MAX_BODY_BYTES));
  }
}

function isZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export async function parsePackageUpload(bytes: Uint8Array) {
  assertPackageFileSize(bytes.byteLength);
  let content: string;
  if (isZip(bytes)) {
    content = await readCloudWorkspaceManifest(bytes, IMPORT_PACKAGE_MAX_BODY_BYTES);
  } else {
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Package must contain valid JSON.");
    }
  }
  return { content, ...parsePackageContent(content) };
}
