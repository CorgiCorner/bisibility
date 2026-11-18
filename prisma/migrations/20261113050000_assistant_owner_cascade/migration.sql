-- Project and account deletion remove assistant transcripts, run evidence, grants and encrypted keys.

-- Rows whose owner was deleted before these constraints existed would block them; remove them first.
DELETE FROM "assistant_conversations" c WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = c."projectId") OR NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = c."userId");
DELETE FROM "assistant_credentials" c WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = c."userId");
DELETE FROM "assistant_grants" g WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = g."userId");

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_credentials" ADD CONSTRAINT "assistant_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_grants" ADD CONSTRAINT "assistant_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
