-- The person who created a project API key. The key never exceeds that person's current role
-- in the project: lowering the role lowers the key, and leaving the project disables it.
ALTER TABLE "api_keys" ADD COLUMN "createdById" TEXT;

-- Existing keys: the person recorded as issuing or regenerating the key in the audit log.
UPDATE "api_keys" AS k
SET "createdById" = a."actorId"
FROM (
  SELECT DISTINCT ON (l."targetId") l."targetId", l."actorId"
  FROM "audit_logs" AS l
  JOIN "users" AS u ON u."id" = l."actorId"
  WHERE l."targetType" = 'api_key'
    AND l."action" IN ('api_key.issue', 'api_key.regenerate')
  ORDER BY l."targetId", l."createdAt" DESC
) AS a
WHERE a."targetId" = k."publicId";

-- Keys with no surviving audit record keep working under the project owner, who holds every right.
UPDATE "api_keys" AS k
SET "createdById" = COALESCE(
  (SELECT m."userId" FROM "memberships" AS m
   WHERE m."projectId" = k."projectId" AND m."role" = 'owner'
   ORDER BY m."createdAt" LIMIT 1),
  (SELECT p."ownerId" FROM "projects" AS p WHERE p."id" = k."projectId")
)
WHERE k."createdById" IS NULL;

CREATE INDEX "api_keys_createdById_idx" ON "api_keys"("createdById");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
