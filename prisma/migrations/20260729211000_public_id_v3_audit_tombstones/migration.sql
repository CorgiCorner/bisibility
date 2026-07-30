-- Audit history outlives the entities it describes. Reserve deterministic v3
-- public IDs for internal audit targets before the blocking data migration so
-- deleted targets can be rewritten without restoring deleted application rows.
BEGIN;

SELECT set_config(
    'bisibility.public_id_write_gate_bypass',
    'public-id-v3-n',
    TRUE
);

WITH target_entities("targetType", "entityType", "prefix") AS (
    VALUES
        ('alert_rule', 'alert_rule', 'alr'),
        ('api_key', 'api_key', 'key'),
        ('audit_log', 'audit_log', 'audit'),
        ('cloud_import_job', 'cloud_import_job', 'imp'),
        ('competitor', 'competitor', 'cmp'),
        ('ingest_hook', 'ingest_hook', 'dwh'),
        ('invite', 'invite', 'inv'),
        ('keyword', 'keyword', 'kw'),
        ('membership', 'membership', 'mbr'),
        ('migration_token', 'migration_token', 'ferry'),
        ('notification', 'notification', 'ntf'),
        ('personal_access_token', 'personal_access_token', 'pat'),
        ('project', 'project', 'prj'),
        ('provider_connection', 'provider_connection', 'conn'),
        ('rank_check', 'rank_check', 'check'),
        ('saved_keyword', 'saved_keyword', 'svkw'),
        ('saved_view', 'saved_view', 'viw'),
        ('session', 'session', 'sid'),
        ('signal', 'signal', 'sig'),
        ('tag', 'tag', 'tag'),
        ('triggered_alert', 'triggered_alert', 'al'),
        ('user', 'user', 'usr'),
        ('webhook_endpoint', 'webhook_endpoint', 'we')
),
internal_references AS (
    SELECT DISTINCT
           target_entities."entityType",
           audit_log."targetId" AS "internalId",
           target_entities."prefix"
      FROM "audit_logs" AS audit_log
      JOIN target_entities
        ON target_entities."targetType" = audit_log."targetType"
     WHERE audit_log."targetId" !~
           '^(al|alert|alr|audit|check|cmp|comp|conn|dwh|ferry|hook|imp|inv|invite|job|key|kw|mbr|member|mtok|notif|ntf|pat|prj|rule|ses|sid|sig|skw|svkw|tag|usr|view|viw|we|webhook)_[a-z][a-z0-9]{23}$'
       AND audit_log."targetId" !~ '^prj_sample_[0-9A-Za-z]{10}$'
),
entity_rows("entityType", "internalId", "currentPublicId") AS (
    SELECT reference."entityType", row."id", row."publicId"
      FROM internal_references AS reference
      JOIN "alert_rules" AS row ON reference."entityType" = 'alert_rule' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "api_keys" AS row ON reference."entityType" = 'api_key' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "audit_logs" AS row ON reference."entityType" = 'audit_log' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "cloud_import_jobs" AS row ON reference."entityType" = 'cloud_import_job' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "competitors" AS row ON reference."entityType" = 'competitor' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "ingest_hooks" AS row ON reference."entityType" = 'ingest_hook' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "invites" AS row ON reference."entityType" = 'invite' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "keywords" AS row ON reference."entityType" = 'keyword' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "memberships" AS row ON reference."entityType" = 'membership' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "migration_tokens" AS row ON reference."entityType" = 'migration_token' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "notifications" AS row ON reference."entityType" = 'notification' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "personal_access_tokens" AS row ON reference."entityType" = 'personal_access_token' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "projects" AS row ON reference."entityType" = 'project' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "provider_connections" AS row ON reference."entityType" = 'provider_connection' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "rank_checks" AS row ON reference."entityType" = 'rank_check' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "saved_keywords" AS row ON reference."entityType" = 'saved_keyword' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "saved_views" AS row ON reference."entityType" = 'saved_view' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "sessions" AS row ON reference."entityType" = 'session' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "signals" AS row ON reference."entityType" = 'signal' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "tags" AS row ON reference."entityType" = 'tag' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "triggered_alerts" AS row ON reference."entityType" = 'triggered_alert' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "users" AS row ON reference."entityType" = 'user' AND row."id" = reference."internalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM internal_references AS reference JOIN "webhook_endpoints" AS row ON reference."entityType" = 'webhook_endpoint' AND row."id" = reference."internalId"
)
INSERT INTO "public_id_v3_migrations" (
    "id",
    "entityType",
    "internalId",
    "oldExternalId",
    "newPublicId",
    "createdAt",
    "migratedAt"
)
SELECT
    'audit-tombstone-' || md5(
        internal_references."entityType" || ':' || internal_references."internalId"
    ),
    internal_references."entityType",
    internal_references."internalId",
    CASE
        WHEN entity_rows."currentPublicId" IS NULL
          OR entity_rows."currentPublicId" ~ (
              '^' || internal_references."prefix" || '_[a-z][a-z0-9]{23}$'
          )
        THEN NULL
        ELSE entity_rows."currentPublicId"
    END,
    CASE
        WHEN entity_rows."currentPublicId" ~ (
            '^' || internal_references."prefix" || '_[a-z][a-z0-9]{23}$'
        )
        THEN entity_rows."currentPublicId"
        ELSE internal_references."prefix" || '_z' || substr(
            md5(
                'public-id-v3:' ||
                internal_references."entityType" || ':' ||
                internal_references."internalId"
            ),
            1,
            23
        )
    END,
    NOW(),
    NOW()
  FROM internal_references
  LEFT JOIN entity_rows
    ON entity_rows."entityType" = internal_references."entityType"
   AND entity_rows."internalId" = internal_references."internalId"
ON CONFLICT ("entityType", "internalId") DO NOTHING;

-- Legacy external IDs can also survive only inside audit payloads after their
-- source row is deleted. Reserve those by oldExternalId so recursive JSON
-- rewriting can replace them with a valid v3 ID.
WITH legacy_prefixes("legacyPrefix", "entityType", "prefix") AS (
    VALUES
        ('alert', 'triggered_alert', 'al'),
        ('rule', 'alert_rule', 'alr'),
        ('comp', 'competitor', 'cmp'),
        ('hook', 'ingest_hook', 'dwh'),
        ('invite', 'invite', 'inv'),
        ('job', 'cloud_import_job', 'imp'),
        ('member', 'membership', 'mbr'),
        ('mtok', 'migration_token', 'ferry'),
        ('notif', 'notification', 'ntf'),
        ('ses', 'session', 'sid'),
        ('skw', 'saved_keyword', 'svkw'),
        ('view', 'saved_view', 'viw'),
        ('webhook', 'webhook_endpoint', 'we')
),
external_references AS (
    SELECT DISTINCT
           legacy_prefixes."entityType",
           legacy_prefixes."prefix",
           observed_id.match[1] AS "oldExternalId"
      FROM "audit_logs" AS audit_log
      CROSS JOIN LATERAL regexp_matches(
          concat_ws(
              ' ',
              audit_log."targetId",
              audit_log."before"::text,
              audit_log."after"::text
          ),
          '((alert|rule|comp|hook|invite|job|member|mtok|notif|ses|skw|view|webhook)_[a-z][a-z0-9]{23})',
          'g'
      ) AS observed_id(match)
      JOIN legacy_prefixes
        ON legacy_prefixes."legacyPrefix" = observed_id.match[2]
),
entity_rows("entityType", "internalId", "oldExternalId") AS (
    SELECT reference."entityType", row."id", row."publicId"
      FROM external_references AS reference
      JOIN "triggered_alerts" AS row ON reference."entityType" = 'triggered_alert' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "alert_rules" AS row ON reference."entityType" = 'alert_rule' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "competitors" AS row ON reference."entityType" = 'competitor' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "ingest_hooks" AS row ON reference."entityType" = 'ingest_hook' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "invites" AS row ON reference."entityType" = 'invite' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "cloud_import_jobs" AS row ON reference."entityType" = 'cloud_import_job' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "memberships" AS row ON reference."entityType" = 'membership' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "migration_tokens" AS row ON reference."entityType" = 'migration_token' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "notifications" AS row ON reference."entityType" = 'notification' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "sessions" AS row ON reference."entityType" = 'session' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "saved_keywords" AS row ON reference."entityType" = 'saved_keyword' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "saved_views" AS row ON reference."entityType" = 'saved_view' AND row."publicId" = reference."oldExternalId"
    UNION ALL SELECT reference."entityType", row."id", row."publicId" FROM external_references AS reference JOIN "webhook_endpoints" AS row ON reference."entityType" = 'webhook_endpoint' AND row."publicId" = reference."oldExternalId"
),
reservations AS (
    SELECT reference."entityType",
           reference."prefix",
           reference."oldExternalId",
           COALESCE(
               entity_rows."internalId",
               'audit-external-' || md5(
                   reference."entityType" || ':' || reference."oldExternalId"
               )
           ) AS "internalId"
      FROM external_references AS reference
      LEFT JOIN entity_rows
        ON entity_rows."entityType" = reference."entityType"
       AND entity_rows."oldExternalId" = reference."oldExternalId"
)
INSERT INTO "public_id_v3_migrations" (
    "id",
    "entityType",
    "internalId",
    "oldExternalId",
    "newPublicId",
    "createdAt",
    "migratedAt"
)
SELECT
    'audit-external-' || md5(
        reservations."entityType" || ':' || reservations."oldExternalId"
    ),
    reservations."entityType",
    reservations."internalId",
    reservations."oldExternalId",
    reservations."prefix" || '_z' || substr(
        md5(
            'public-id-v3:' ||
            reservations."entityType" || ':' ||
            reservations."internalId"
        ),
        1,
        23
    ),
    NOW(),
    NOW()
  FROM reservations
ON CONFLICT DO NOTHING;

COMMIT;
