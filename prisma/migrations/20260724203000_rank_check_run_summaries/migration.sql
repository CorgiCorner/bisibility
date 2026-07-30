ALTER TABLE "rank_checks"
  ADD COLUMN "viaFallback" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "degradedToCountry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1;

WITH attempt_values AS (
  SELECT
    rc.id,
    attempt.ordinality,
    COALESCE(
      NULLIF(attempt.value->>'provider', ''),
      NULLIF(attempt.value->>'providerId', ''),
      NULLIF(attempt.value->>'provider_id', ''),
      'unknown'
    ) AS provider,
    COALESCE(
      NULLIF(attempt.value->>'outcome', ''),
      NULLIF(attempt.value->>'code', '')
    ) AS stored_outcome,
    COALESCE(
      NULLIF(attempt.value->>'detail', ''),
      NULLIF(attempt.value->>'message', ''),
      NULLIF(attempt.value->>'error', '')
    ) AS detail,
    (
      attempt.value->>'degradedToCountry' = 'true'
      OR attempt.value->>'degraded_to_country' = 'true'
    ) AS degraded
  FROM "rank_checks" rc
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(rc.attempts) = 'array' THEN rc.attempts
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS attempt(value, ordinality)
  WHERE jsonb_typeof(attempt.value) = 'object'
),
parsed_attempts AS (
  SELECT
    id,
    ordinality,
    provider,
    degraded,
    CASE
      WHEN stored_outcome IN (
        'credentials_unavailable',
        'ok',
        'provider_failed',
        'rate_limited'
      )
        THEN stored_outcome
      WHEN stored_outcome = 'provider_rate_limited'
        THEN 'rate_limited'
      WHEN LOWER(CONCAT_WS(' ', stored_outcome, detail)) LIKE '%rate limit%'
        OR LOWER(CONCAT_WS(' ', stored_outcome, detail)) LIKE '%429%'
        THEN 'rate_limited'
      WHEN LOWER(CONCAT_WS(' ', stored_outcome, detail)) LIKE '%credential%'
        THEN 'credentials_unavailable'
      ELSE 'provider_failed'
    END AS outcome
  FROM attempt_values
),
attempt_stats AS (
  SELECT
    rc.id,
    COUNT(pa.ordinality)::int AS parsed_count,
    COALESCE(BOOL_OR(pa.degraded), false) AS degraded,
    (ARRAY_AGG(pa.provider ORDER BY pa.ordinality))[1] AS first_provider,
    (ARRAY_AGG(pa.provider ORDER BY pa.ordinality DESC))[1] AS last_provider,
    (ARRAY_AGG(pa.outcome ORDER BY pa.ordinality DESC))[1] AS last_outcome,
    COALESCE(BOOL_OR(pa.outcome <> 'ok'), false) AS has_non_ok
  FROM "rank_checks" rc
  LEFT JOIN parsed_attempts pa ON pa.id = rc.id
  GROUP BY rc.id
)
UPDATE "rank_checks" rc
SET
  "attemptCount" = stats.parsed_count + CASE
    WHEN rc.status = 'completed'
      AND NOT COALESCE(
        stats.last_outcome = 'ok'
        AND stats.last_provider = rc.provider,
        false
      )
      THEN 1
    ELSE 0
  END,
  "degradedToCountry" = stats.degraded,
  "viaFallback" = rc.status = 'completed'
    AND stats.parsed_count > 0
    AND (
      stats.has_non_ok
      OR stats.first_provider IS DISTINCT FROM rc.provider
    )
FROM attempt_stats stats
WHERE stats.id = rc.id;

CREATE INDEX "rank_checks_viaFallback_checkedAt_id_idx"
  ON "rank_checks"("viaFallback", "checkedAt", "id");
CREATE INDEX "rank_checks_provider_checkedAt_id_idx"
  ON "rank_checks"("provider", "checkedAt", "id");
CREATE INDEX "rank_checks_trigger_checkedAt_id_idx"
  ON "rank_checks"("trigger", "checkedAt", "id");
