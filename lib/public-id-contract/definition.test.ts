import { describe, expect, it } from "vitest";
import {
  highVolumePublicIdTables,
  publicIdContractEntities,
  publicIdFormatConstraintName,
  publicIdFormatPattern,
  publicIdIndexName,
  publicIdNotNullConstraintName,
} from "./definition";

describe("public ID contract definition", () => {
  it("covers exactly the 23 independently addressable resources", () => {
    expect(publicIdContractEntities).toHaveLength(23);
    expect(publicIdContractEntities.map((entity) => entity.table)).toEqual([
      "users",
      "sessions",
      "memberships",
      "projects",
      "keywords",
      "saved_keywords",
      "tags",
      "competitors",
      "rank_checks",
      "provider_connections",
      "api_keys",
      "personal_access_tokens",
      "audit_logs",
      "alert_rules",
      "triggered_alerts",
      "webhook_endpoints",
      "saved_views",
      "notifications",
      "invites",
      "migration_tokens",
      "cloud_import_jobs",
      "ingest_hooks",
      "signals",
    ]);
  });

  it("uses independently built indexes only for high-volume tables", () => {
    expect(highVolumePublicIdTables).toEqual([
      "rank_checks",
      "audit_logs",
      "triggered_alerts",
      "notifications",
    ]);
    expect(publicIdIndexName("rank_checks")).toBe("rank_checks_publicId_key");
    expect(publicIdNotNullConstraintName("cloud_import_jobs")).toBe(
      "cloud_import_jobs_public_id_contract_not_null",
    );
    expect(publicIdFormatConstraintName("cloud_import_jobs")).toBe(
      "cloud_import_jobs_public_id_contract_format",
    );
    expect(publicIdFormatPattern("check")).toBe("^check_[a-z][a-z0-9]{23}$");
  });
});
