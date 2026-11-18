-- One standalone statement: build without blocking metering writes.
CREATE INDEX CONCURRENTLY "metering_operation_platform_project_created_idx"
ON "metering_operation" ("namespace", (("input"->'scope')->>'group'), "created_at", "operation_pk")
WHERE "input"->>'fundingSource'='platform' AND "input"->>'surface'='app';
